// Proved crude-oil reserves per country.
// 1. US EIA International Energy Data (EIA_API_KEY). EIA's international data currently has no
//    proved-reserves measure, so this is tried first and usually returns nothing.
// 2. OPEC Annual Statistical Bulletin 2026, Table 3.1 (year-end 2025, million barrels). This is an
//    official public table stored in server/lib/opecReserves.json, so it works without any key.
import { getJson, UpstreamError } from './http';
import { remember } from './cache';
import countryNames from './countryNames.json';
import opec from './opecReserves.json';
import type { OilResponse } from '../../shared/types';

const EIA_BASE = 'https://api.eia.gov/v2/international';

interface Facet {
  id: string;
  name: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

function eiaFacets(key: string, facet: string): Promise<Facet[]> {
  return remember(`eia-facet:${facet}`, 24 * 3600e3, async () => {
    const data = await getJson<{ response?: { facets?: Facet[] } }>(`${EIA_BASE}/facet/${facet}?api_key=${key}`, { timeoutMs: 10000 });
    const list = data.response?.facets ?? [];
    if (list.length === 0) throw new UpstreamError(`EIA facet list "${facet}" came back empty`, 502);
    return list;
  });
}

// Returns null when EIA has no matching series. Errors are swallowed so OPEC can answer instead.
async function eiaReserves(key: string, code: string, names: string[]): Promise<Omit<OilResponse, 'configured' | 'updatedAt'> | null> {
  try {
    const [products, activities, regions] = await Promise.all([
      eiaFacets(key, 'productId'),
      eiaFacets(key, 'activityId'),
      eiaFacets(key, 'countryRegionId'),
    ]);
    const product = products.find((f) => /crude oil/i.test(f.name) && /condensate/i.test(f.name)) ?? products.find((f) => /crude oil/i.test(f.name));
    const activity = activities.find((f) => /proved reserves|reserves/i.test(f.name));
    const wanted = new Set(names.map(norm));
    const region = regions.find((f) => f.id === code) ?? regions.find((f) => wanted.has(norm(f.name)));
    if (!product || !activity || !region) return null;
    const params = new URLSearchParams({
      api_key: key,
      frequency: 'annual',
      'data[0]': 'value',
      'facets[productId][]': product.id,
      'facets[activityId][]': activity.id,
      'facets[countryRegionId][]': region.id,
      'sort[0][column]': 'period',
      'sort[0][direction]': 'desc',
      length: '1',
    });
    const res = await getJson<{ response?: { data?: { period: string; value: number | null; unit?: string }[] } }>(
      `${EIA_BASE}/data/?${params.toString()}`,
      { timeoutMs: 10000 },
    );
    const row = res.response?.data?.[0];
    if (!row || typeof row.value !== 'number') return null;
    return { value: row.value, year: Number(row.period) || null, unit: row.unit ?? 'thousand barrels', source: 'US EIA International Energy Data', message: undefined };
  } catch {
    return null;
  }
}

function opecReserves(code: string): Omit<OilResponse, 'configured' | 'updatedAt'> | null {
  const row = (opec.countries as Record<string, { name: string; mb: number }>)[code];
  if (!row) return null;
  return { value: row.mb, year: opec.year, unit: opec.unit, source: opec.source, message: opec.note };
}

export function getOilReserves(iso3: string): Promise<OilResponse> {
  const code = iso3.toUpperCase();
  return remember(`oil:${code}`, 24 * 3600e3, async (): Promise<OilResponse> => {
    const updatedAt = new Date().toISOString();
    const names = (countryNames as { iso3: string; names: string[] }[]).find((c) => c.iso3 === code)?.names ?? [];
    const key = process.env.EIA_API_KEY;
    const eia = key ? await eiaReserves(key, code, names) : null;
    const hit = eia ?? opecReserves(code);
    if (hit) return { configured: true, updatedAt, ...hit };
    return {
      configured: true,
      updatedAt,
      value: null,
      year: null,
      unit: null,
      source: null,
      message: 'No proven-reserves figure for this country in the OPEC or EIA data. Oil rents (% of GDP) above is the World Bank proxy.',
    };
  });
}
