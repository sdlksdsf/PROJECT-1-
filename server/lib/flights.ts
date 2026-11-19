// Live aircraft positions from OpenSky Network (anonymous state vectors).
// OpenSky gives position, altitude, speed and heading. It does NOT give origin or
// destination airports, so the UI shows direction of travel, not routes.
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
const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

// OpenSky requires OAuth2 client credentials (OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET) for the
// registered credit budget. Without them the anonymous budget (400 credits/day) is used.
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

export function getFlights(): Promise<FlightsResponse> {
  return remember('flights', 120e3, async () => {
    try {
      // If the token call fails, fall back to anonymous access (smaller daily credit budget) instead of failing the panel.
      const token = await bearer().catch(() => null);
      const data = await getJson<{ time: number; states: StateVector[] | null }>(
        'https://opensky-network.org/api/states/all',
        { timeoutMs: 20000, headers: token ? { authorization: `Bearer ${token}` } : {} },
      );
      const states = data.states ?? [];
      const airborne: Aircraft[] = [];
      const counts = new Map<string, number>();
      for (const s of states) {
        const lon = s[5];
        const lat = s[6];
        if (lon === null || lat === null) continue;
        if (s[8]) continue; // on ground
        const country = s[2] ?? 'Unknown';
        counts.set(country, (counts.get(country) ?? 0) + 1);
        airborne.push({
          id: s[0],
          call: (s[1] ?? '').trim() || s[0],
          country,
          lat,
          lon,
          alt: s[7],
          vel: s[9],
          hdg: s[10],
        });
      }
      const byCountry = [...counts.entries()]
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);
      return {
        updatedAt: new Date((data.time ?? Date.now() / 1000) * 1000).toISOString(),
        total: states.length,
        airborne: airborne.length,
        aircraft: airborne.slice(0, MAX_AIRCRAFT),
        byCountry,
      };
    } catch (err) {
      return {
        updatedAt: new Date().toISOString(),
        total: 0,
        airborne: 0,
        aircraft: [],
        byCountry: [],
        error: `Flight data unavailable: ${(err as Error).message}`,
      };
    }
  });
}
