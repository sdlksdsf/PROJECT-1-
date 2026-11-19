// Country profile: World Bank country metadata (name, capital, coordinates), World Bank indicators
// (economy, governance, population, area), and Wikidata (current head of state / government).
// REST Countries v3.1 was retired (it now answers success:false), so it is no longer used.
import { getJson, UpstreamError } from './http';
import { remember } from './cache';
import countryNames from './countryNames.json';
import type { CountryResponse, Indicator, Leader } from '../../shared/types';

const INDICATORS: { key: string; code: string; label: string; unit: string; note: string }[] = [
  {
    key: 'corruption',
    code: 'CC.PER.RNK',
    label: 'Control of corruption (percentile)',
    unit: '0-100 (higher = better control)',
    note: 'World Bank Worldwide Governance Indicators. Percentile rank among ~200 economies. This is NOT Transparency International CPI.',
  },
  { key: 'gdp', code: 'NY.GDP.MKTP.CD', label: 'GDP (current US$)', unit: 'US$', note: 'World Bank, current US dollars.' },
  { key: 'gdpPc', code: 'NY.GDP.PCAP.CD', label: 'GDP per capita (US$)', unit: 'US$', note: 'World Bank, current US dollars.' },
  { key: 'unemployment', code: 'SL.UEM.TOTL.ZS', label: 'Unemployment (% of labour force)', unit: '%', note: 'ILO estimate via World Bank.' },
  { key: 'oilRents', code: 'NY.GDP.PETR.RT.ZS', label: 'Oil rents (% of GDP)', unit: '%', note: 'Value of oil production above extraction cost, as % of GDP. Barrels-per-day comes from the US EIA reserves figure.' },
  { key: 'lifeExp', code: 'SP.DYN.LE00.IN', label: 'Life expectancy (years)', unit: 'years', note: 'World Bank / UN WPP.' },
];

interface WbPoint {
  date: string;
  value: number | null;
}

interface WbCountryMeta {
  iso2Code: string;
  name: string;
  region?: { value?: string };
  capitalCity?: string;
  latitude?: string;
  longitude?: string;
}

async function wbIndicator(iso3: string, code: string): Promise<{ value: number | null; year: number | null }> {
  try {
    const data = await getJson<[unknown, WbPoint[] | null]>(
      `https://api.worldbank.org/v2/country/${iso3}/indicator/${code}?format=json&mrnev=1&per_page=1`,
      { timeoutMs: 7000 },
    );
    const p = data[1]?.[0];
    if (!p) return { value: null, year: null };
    return { value: p.value, year: Number(p.date) };
  } catch {
    return { value: null, year: null };
  }
}

async function wbCountryMeta(iso3: string): Promise<WbCountryMeta | null> {
  const data = await getJson<[unknown, WbCountryMeta[] | null]>(`https://api.worldbank.org/v2/country/${iso3}?format=json`, {
    timeoutMs: 7000,
  });
  return data[1]?.[0] ?? null;
}

interface SparqlBinding {
  leader: { value: string };
  leaderLabel: { value: string };
  role: { value: string };
  image?: { value: string };
}

async function wikidataLeaders(iso3: string): Promise<Leader[]> {
  const query = `
SELECT ?leader ?leaderLabel ?role ?image WHERE {
  ?country wdt:P298 "${iso3}" .
  { ?country p:P6 ?st . ?st ps:P6 ?leader . BIND("Head of government" AS ?role)
    FILTER NOT EXISTS { ?st pq:P582 ?end } }
  UNION
  { ?country p:P35 ?st2 . ?st2 ps:P35 ?leader . BIND("Head of state" AS ?role)
    FILTER NOT EXISTS { ?st2 pq:P582 ?end2 } }
  OPTIONAL { ?leader wdt:P18 ?image }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 10`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const data = await getJson<{ results: { bindings: SparqlBinding[] } }>(url, {
    timeoutMs: 8000,
    headers: { accept: 'application/sparql-results+json' },
  });
  const seen = new Set<string>();
  const leaders: Leader[] = [];
  for (const b of data.results.bindings) {
    const key = `${b.leaderLabel.value}|${b.role.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    leaders.push({
      name: b.leaderLabel.value,
      role: b.role.value,
      image: b.image?.value ?? null,
      wikidata: b.leader.value,
    });
  }
  return leaders;
}

export function getCountry(iso3: string): Promise<CountryResponse> {
  const code = iso3.toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new UpstreamError('Country code must be ISO alpha-3, e.g. PAK', 400);
  return remember(`country:${code}`, 6 * 3600e3, async () => {
    const notes: string[] = [];
    const localNames = (countryNames as { iso3: string; names: string[] }[]).find((c) => c.iso3 === code)?.names ?? [];

    const [meta, wb, population, area, leaders] = await Promise.all([
      wbCountryMeta(code).catch((err: Error) => {
        notes.push(`Basic profile unavailable: ${err.message}`);
        return null;
      }),
      Promise.all(INDICATORS.map((i) => wbIndicator(code, i.code))),
      wbIndicator(code, 'SP.POP.TOTL'),
      wbIndicator(code, 'AG.SRF.TOTL.K2'),
      wikidataLeaders(code).catch((err: Error) => {
        notes.push(`Leaders unavailable: ${err.message}`);
        return [] as Leader[];
      }),
    ]);

    const indicators: Indicator[] = INDICATORS.map((meta, idx) => ({
      key: meta.key,
      label: meta.label,
      unit: meta.unit,
      note: meta.note,
      value: wb[idx].value,
      year: wb[idx].year,
    }));
    if (indicators.every((i) => i.value === null)) {
      notes.push('World Bank indicators have no data for this code (common for disputed or non-UN territories).');
    }

    const lat = Number(meta?.latitude);
    const lon = Number(meta?.longitude);
    const hasCapital = Boolean(meta?.latitude && meta?.longitude) && Number.isFinite(lat) && Number.isFinite(lon);
    const name = meta?.name ?? localNames[0] ?? code;
    return {
      iso3: code,
      cca2: meta?.iso2Code ?? null,
      name,
      official: null,
      capital: meta?.capitalCity || null,
      capitalLatLng: hasCapital ? [lat, lon] : null,
      region: meta?.region?.value ?? null,
      subregion: null,
      population: population.value,
      area: area.value,
      languages: [],
      currencies: [],
      flag: null,
      indicators,
      leaders,
      notes,
      updatedAt: new Date().toISOString(),
    };
  });
}
