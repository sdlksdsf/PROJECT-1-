// Keyword-based country tagging for headlines. Matching is whole-word and case-sensitive
// for proper nouns, so it can still produce false positives (e.g. a person named "Chad").
// The methodology page documents this limitation.
import countryNames from './countryNames.json';

const ALIASES: Record<string, string[]> = {
  USA: ['United States', 'U.S.', 'America'],
  GBR: ['Britain', 'Great Britain', 'UK'],
  RUS: ['Russia'],
  IRN: ['Iran'],
  SYR: ['Syria'],
  CIV: ['Ivory Coast'],
  CZE: ['Czech Republic'],
  MMR: ['Burma'],
  PSE: ['Palestine', 'Gaza', 'West Bank'],
  UKR: ['Kyiv', 'Kiev'],
  COD: ['DR Congo', 'DRC'],
  KOR: ['South Korea'],
  PRK: ['North Korea'],
  ARE: ['UAE', 'Emirates'],
  PAK: ['Pakistan'],
};

const lookup = new Map<string, string>();
for (const entry of countryNames as { iso3: string; names: string[] }[]) {
  for (const n of entry.names) lookup.set(n, entry.iso3);
}
for (const [iso, names] of Object.entries(ALIASES)) {
  for (const n of names) lookup.set(n, iso);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Longest names first so "Democratic Republic of the Congo" beats "Congo".
const keys = [...lookup.keys()].sort((a, b) => b.length - a.length);
const PATTERN = new RegExp(`(?<![A-Za-z])(${keys.map(escape).join('|')})(?![A-Za-z])`, 'g');

export function detectCountries(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const m of text.matchAll(PATTERN)) {
    const iso = lookup.get(m[1]);
    if (iso) found.add(iso);
  }
  return [...found];
}

export function countryNameFor(iso3: string): string | undefined {
  const entry = (countryNames as { iso3: string; names: string[] }[]).find((c) => c.iso3 === iso3);
  return entry?.names[0];
}
