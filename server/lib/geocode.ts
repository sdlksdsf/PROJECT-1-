// City/place search via Open-Meteo's free geocoding API (no key).
import { getJson } from './http';
import { remember } from './cache';

export interface GeoResult {
  name: string;
  admin: string | null;
  country: string | null;
  countryCode: string | null;
  lat: number;
  lon: number;
}

interface OmGeo {
  results?: {
    name: string;
    latitude: number;
    longitude: number;
    admin1?: string;
    country?: string;
    country_code?: string;
  }[];
}

export function geocode(query: string): Promise<GeoResult[]> {
  return remember(`geo:${query.toLowerCase()}`, 24 * 3600e3, async () => {
    const data = await getJson<OmGeo>(
      `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' })}`,
      { timeoutMs: 6000 },
    );
    return (data.results ?? []).map((r) => ({
      name: r.name,
      admin: r.admin1 ?? null,
      country: r.country ?? null,
      countryCode: r.country_code ?? null,
      lat: r.latitude,
      lon: r.longitude,
    }));
  });
}
