// Flight status by flight number (e.g. PK300) from AviationStack (env AVIATIONSTACK_API_KEY).
// The free plan is HTTP-only and capped per month, so results are cached for 30 minutes per flight.
import { getJson, UpstreamError } from './http';
import { remember } from './cache';
import type { FlightStatus, FlightStatusResponse } from '../../shared/types';

interface AsEndpoint {
  airport?: string | null;
  iata?: string | null;
  scheduled?: string | null;
  estimated?: string | null;
  delay?: number | null;
}

interface AsFlight {
  flight_date?: string;
  flight_status?: string;
  departure?: AsEndpoint;
  arrival?: AsEndpoint;
  airline?: { name?: string | null };
  flight?: { iata?: string | null };
  live?: { latitude: number; longitude: number; altitude: number | null; speed_horizontal: number | null; is_ground: boolean } | null;
}

const FLIGHT_RE = /^[A-Z0-9]{2}[0-9]{1,4}[A-Z]?$/;

export function isFlightNumber(s: string): boolean {
  return FLIGHT_RE.test(s);
}

const endpoint = (e?: AsEndpoint) => ({
  airport: e?.airport ?? null,
  iata: e?.iata ?? null,
  scheduled: e?.scheduled ?? null,
  estimated: e?.estimated ?? null,
  delay: e?.delay ?? null,
});

export function getFlightStatus(flight: string): Promise<FlightStatusResponse> {
  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) {
    return Promise.resolve({
      configured: false,
      flights: [],
      message: 'Flight status needs a free AviationStack key. Add AVIATIONSTACK_API_KEY on the server.',
    });
  }
  const code = flight.toUpperCase();
  return remember(`flight:${code}`, 30 * 60e3, async () => {
    try {
      // Free plan supports plain HTTP only. This call runs on the server, so the key is never exposed.
      const data = await getJson<{ data?: AsFlight[]; error?: { message?: string } }>(
        `http://api.aviationstack.com/v1/flights?${new URLSearchParams({
          access_key: key,
          flight_iata: code,
          limit: '5',
        })}`,
        { timeoutMs: 8000 },
      );
      if (data.error) throw new UpstreamError(data.error.message ?? 'AviationStack error', 502);
      const flights: FlightStatus[] = (data.data ?? []).map((f) => ({
        flight: f.flight?.iata ?? code,
        airline: f.airline?.name ?? null,
        date: f.flight_date ?? null,
        status: f.flight_status ?? null,
        departure: endpoint(f.departure),
        arrival: endpoint(f.arrival),
        live: f.live
          ? {
              lat: f.live.latitude,
              lon: f.live.longitude,
              altitude: f.live.altitude,
              speed: f.live.speed_horizontal,
              onGround: f.live.is_ground,
            }
          : null,
      }));
      return { configured: true, flights };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Flight lookup failed';
      return { configured: true, flights: [], message };
    }
  });
}
