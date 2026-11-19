// Live aircraft positions from OpenSky Network (anonymous state vectors).
// OpenSky gives position, altitude, speed and heading. It does NOT give origin or
// destination airports, so the UI shows direction of travel, not routes.
import { getJson } from './http';
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

export function getFlights(): Promise<FlightsResponse> {
  return remember('flights', 30e3, async () => {
    try {
      const data = await getJson<{ time: number; states: StateVector[] | null }>(
        'https://opensky-network.org/api/states/all',
        { timeoutMs: 12000 },
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
