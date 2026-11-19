// Proved crude-oil reserves per country from the US EIA International Energy Data (free key: EIA_API_KEY).
// The EIA v2 facet lists are read at runtime so the series IDs are not hard-coded, and then
// matched to the country by name. This matches the EIA labels, not a guessed ID.
import { getJson } from './http';
import { remember } from './cache';
import countryNames from './countryNames.json';
import type { OilResponse } from '../../shared/types';

const BASE = 'https://api.eia.gov/v2/international';

interface Facet {
  id: string;
  name: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

function facets(key: string, facet: string): Promise<Facet[]> {
  return remember(`eia-facet:${facet}`, 24 * 3600e3, async () => {
    const data = await getJson<{ response?: { facets?: Facet[] } }>(`${BASE}/facet/${facet}?api_key=${key}`, { timeoutMs: 10000 });
    return data.response?.facets ?? [];
  });
}

export function getOilReserves(iso3: string): Promise<OilResponse> {
  const key = process.env.EIA_API_KEY;
  const updatedAt = new Date().toISOString();
  if (!key) {
    return Promise.resolve({
      configured: false,
      value: null,
      year: null,
      unit: null,
      updatedAt,
      message: 'Barrel-level reserves need a free US EIA API key. Add EIA_API_KEY on the server and redeploy.',
    });
  }
  const code = iso3.toUpperCase();
  return remember(`oil:${code}`, 24 * 3600e3, async () => {
    const [products, activities, regions] = await Promise.all([
      facets(key, 'productId'),
      facets(key, 'activityId'),
      facets(key, 'countryRegionId'),
    ]);
    const product = products.find((f) => /crude oil/i.test(f.name) && /condensate/i.test(f.name)) ?? products.find((f) => /crude oil/i.test(f.name));
    const activity = activities.find((f) => /proved reserves|reserves/i.test(f.name));
    const names = (countryNames as { iso3: string; names: string[] }[]).find((c) => c.iso3 === code)?.names ?? [];
    const wanted = new Set(names.map(norm));
    const region = regions.find((f) => f.id === code) ?? regions.find((f) => wanted.has(norm(f.name)));
    if (!product || !activity || !region) {
      return {
        configured: true,
        value: null,
        year: null,
        unit: null,
        updatedAt,
        message: 'EIA International data has no matching proved-reserves series for this country.',
      };
    }
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
      `${BASE}/data/?${params.toString()}`,
      { timeoutMs: 10000 },
    );
    const row = res.response?.data?.[0];
    return {
      configured: true,
      value: typeof row?.value === 'number' ? row.value : null,
      year: row ? Number(row.period) || null : null,
      unit: row?.unit ?? null,
      updatedAt,
      message: row ? undefined : 'EIA returned no value for this country.',
    };
  });
}
