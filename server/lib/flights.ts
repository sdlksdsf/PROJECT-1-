// Live aircraft positions for the globe.
// 1. adsb.lol (no key): community ADS-B feed, queried around major air hubs (each query covers 250 nautical miles).
// 2. OpenSky Network (OAuth2 when OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET are set): used only if adsb.lol fails.
// Neither source gives origin or destination airports, so the UI shows direction of travel, not routes.
import { fetchWithTimeout, getJson, UpstreamError } from './http';
import { remember } from './cache';
import type { Aircraft, FlightsResponse } from '../../shared/types';

type StateVector = [
  string, // 0 icao24
  string | null, // 1 callsign
  string | null, // 2 origin_country
  number | null, // 3 time_position
  number | null, // 4 last_contact
  number | null, // 5 longitude
  number | null, // 6 latitude
  number | null, // 7 baro_altitude
  boolean, // 8 on_ground
  number | null, // 9 velocity
  number | null, // 10 true_track
  ...unknown[],
];

const MAX_AIRCRAFT = 4000;
const FT_TO_M = 0.3048;
const KT_TO_MS = 0.514444;

// Air hubs that together cover the busiest airspace. Each query returns aircraft within 250 nm of the hub.
const ADSB_HUBS: [number, number][] = [
  [51.5, -0.5], // London
  [48.9, 2.4], // Paris
  [50.0, 8.6], // Frankfurt
  [55.8, 37.6], // Moscow
  [41.0, 29.0], // Istanbul
  [25.2, 55.3], // Dubai
  [28.6, 77.2], // Delhi
  [19.0, 72.8], // Mumbai
  [1.35, 103.9], // Singapore
  [35.7, 139.7], // Tokyo
  [39.9, 116.4], // Beijing
  [-33.9, 151.2], // Sydney
  [-26.1, 28.2], // Johannesburg
  [6.5, 3.4], // Lagos
  [30.0, 31.2], // Cairo
  [40.7, -74.0], // New York
  [41.9, -87.6], // Chicago
  [34.0, -118.2], // Los Angeles
  [32.8, -96.8], // Dallas
  [25.8, -80.2], // Miami
  [19.4, -99.1], // Mexico City
  [-23.5, -46.6], // São Paulo
  [-34.6, -58.4], // Buenos Aires
  [49.3, -123.1], // Vancouver
];

interface AdsbAircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  alt_baro?: number | 'ground';
  gs?: number;
  track?: number;
  lat?: number;
  lon?: number;
}

async function fetchAdsbHub(lat: number, lon: number): Promise<AdsbAircraft[]> {
  const data = await getJson<{ ac?: AdsbAircraft[] }>(`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/250`, {
    timeoutMs: 8000,
  });
  return data.ac ?? [];
}

async function fromAdsbLol(): Promise<FlightsResponse> {
  // Query the hubs in small batches so one request burst does not trip the provider's rate limit.
  const settled: PromiseSettledResult<AdsbAircraft[]>[] = [];
  for (let i = 0; i < ADSB_HUBS.length; i += 6) {
    const batch = ADSB_HUBS.slice(i, i + 6);
    settled.push(...(await Promise.allSettled(batch.map(([lat, lon]) => fetchAdsbHub(lat, lon)))));
  }
  const seen = new Map<string, Aircraft>();
  let failed = 0;
  let firstError = '';
  for (const r of settled) {
    if (r.status === 'rejected') {
      failed++;
      if (!firstError) firstError = (r.reason as Error)?.message ?? 'unknown';
      continue;
    }
    for (const a of r.value) {
      if (!a.hex || typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
      if (a.alt_baro === 'ground') continue;
      if (seen.has(a.hex)) continue;
      seen.set(a.hex, {
        id: a.hex,
        call: (a.flight ?? '').trim() || a.r || a.hex,
        // adsb.lol does not give the operating country. Show the registration and type instead.
        country: [a.r, a.t].filter(Boolean).join(' · ') || 'Unknown',
        lat: a.lat,
        lon: a.lon,
        alt: typeof a.alt_baro === 'number' ? a.alt_baro * FT_TO_M : null,
        vel: typeof a.gs === 'number' ? a.gs * KT_TO_MS : null,
        hdg: typeof a.track === 'number' ? a.track : null,
      });
    }
  }
  if (seen.size === 0 && failed === ADSB_HUBS.length) throw new UpstreamError(`adsb.lol: ${firstError}`, 502);
  const aircraft = [...seen.values()].slice(0, MAX_AIRCRAFT);
  return {
    source: 'adsb.lol',
    updatedAt: new Date().toISOString(),
    total: aircraft.length,
    airborne: aircraft.length,
    aircraft,
    byCountry: [],
  };
}

const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
let tokenCache: { token: string; exp: number } | null = null;

async function bearer(): Promise<string | null> {
  const id = process.env.OPENSKY_CLIENT_ID;
  const secret = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (tokenCache && tokenCache.exp > Date.now()) return tokenCache.token;
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    timeoutMs: 15000,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }).toString(),
  });
  if (!res.ok) throw new UpstreamError(`OpenSky token request failed (${res.status})`, 502);
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache = { token: j.access_token, exp: Date.now() + ((j.expires_in ?? 1800) - 120) * 1000 };
  return j.access_token;
}

async function fromOpenSky(): Promise<FlightsResponse> {
  const token = await bearer().catch(() => null);
  const data = await getJson<{ time: number; states: StateVector[] | null }>('https://opensky-network.org/api/states/all', {
    timeoutMs: 20000,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const states = data.states ?? [];
  const airborne: Aircraft[] = [];
  const counts = new Map<string, number>();
  for (const s of states) {
    const lon = s[5];
    const lat = s[6];
    if (lon === null || lat === null || s[8]) continue;
    const country = s[2] ?? 'Unknown';
    counts.set(country, (counts.get(country) ?? 0) + 1);
    airborne.push({ id: s[0], call: (s[1] ?? '').trim() || s[0], country, lat, lon, alt: s[7], vel: s[9], hdg: s[10] });
  }
  const byCountry = [...counts.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
  return {
    source: 'OpenSky Network',
    updatedAt: new Date((data.time ?? Date.now() / 1000) * 1000).toISOString(),
    total: states.length,
    airborne: airborne.length,
    aircraft: airborne.slice(0, MAX_AIRCRAFT),
    byCountry,
  };
}

export function getFlights(): Promise<FlightsResponse> {
  return remember('flights', 120e3, async () => {
    try {
      return await fromAdsbLol();
    } catch (adsbErr) {
      try {
        return await fromOpenSky();
      } catch (openSkyErr) {
        return {
          updatedAt: new Date().toISOString(),
          total: 0,
          airborne: 0,
          aircraft: [],
          byCountry: [],
          error: `Flight data unavailable: adsb.lol (${(adsbErr as Error).message}); OpenSky (${(openSkyErr as Error).message})`,
        };
      }
    }
  });
}
