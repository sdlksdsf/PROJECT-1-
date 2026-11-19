// Looks up editorial standing for an outlet domain using the feed registry.
// Unknown domains default to 'C' (unrated) rather than being given an assumed grade.
import { FEEDS } from './feeds';
import type { Standing } from '../../shared/types';

const byDomain = new Map<string, OutletMeta>();
for (const f of FEEDS) {
  if (!byDomain.has(f.domain)) byDomain.set(f.domain, { standing: f.standing, ownership: f.ownership, country: f.country, name: f.name });
}

export interface OutletMeta {
  standing: Standing;
  ownership: string | null;
  country: string;
  name?: string;
}

export function domainStanding(domain: string): OutletMeta {
  const d = domain.replace(/^www\./, '').toLowerCase();
  const hit = byDomain.get(d);
  if (hit) return hit;
  for (const [known, v] of byDomain) if (d === known || d.endsWith(`.${known}`)) return v;
  return { standing: 'C', ownership: null, country: '' };
}
