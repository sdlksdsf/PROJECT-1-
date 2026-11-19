// Country profile: REST Countries (basics), World Bank indicators (economy, governance,
// oil rents), and Wikidata (current head of state / government).
import { getJson, UpstreamError } from './http';
import { remember } from './cache';
import type { CountryResponse, Indicator, Leader } from '../../shared/types';

interface RestCountry {
  cca2: string;
  name: { common: string; official: string };
  capital?: string[];
  capitalInfo?: { latlng?: [number, number] };
  region?: string;
  subregion?: string;
  population?: number;
  area?: number;
  languages?: Record<string, string>;
  currencies?: Record<string, { name: string; symbol?: string }>;
  flags?: { png?: string; svg?: string };
  flag?: string;
}

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
  { key: 'oilRents', code: 'NY.GDP.PETR.RT.ZS', label: 'Oil rents (% of GDP)', unit: '%', note: 'Value of oil production above extraction cost, as % of GDP. Barrels-per-day needs a US EIA key (not included).' },
  { key: 'lifeExp', code: 'SP.DYN.LE00.IN', label: 'Life expectancy (years)', unit: 'years', note: 'World Bank / UN WPP.' },
];

interface WbPoint {
  date: string;
  value: number | null;
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
    let base: RestCountry | null = null;
    try {
      const arr = await getJson<RestCountry[]>(`https://restcountries.com/v3.1/alpha/${code}`, { timeoutMs: 7000 });
      base = arr[0] ?? null;
    } catch (err) {
      notes.push(`Basic profile unavailable: ${(err as Error).message}`);
    }

    const [wb, leaders] = await Promise.all([
      Promise.all(INDICATORS.map((i) => wbIndicator(code, i.code))),
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

    const name = base?.name.common ?? code;
    const capLatLng = base?.capitalInfo?.latlng;
    return {
      iso3: code,
      cca2: base?.cca2 ?? null,
      name,
      official: base?.name.official ?? null,
      capital: base?.capital?.[0] ?? null,
      capitalLatLng: capLatLng && capLatLng.length === 2 ? [capLatLng[0], capLatLng[1]] : null,
      region: base?.region ?? null,
      subregion: base?.subregion ?? null,
      population: base?.population ?? null,
      area: base?.area ?? null,
      languages: Object.values(base?.languages ?? {}),
      currencies: Object.values(base?.currencies ?? {}).map((c) => (c.symbol ? `${c.name} (${c.symbol})` : c.name)),
      flag: base?.flags?.svg ?? base?.flags?.png ?? null,
      indicators,
      leaders,
      notes,
      updatedAt: new Date().toISOString(),
    };
  });
}
