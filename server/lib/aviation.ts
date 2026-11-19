// Flight status by flight number (e.g. PK300).
// 1. OAG Flight Info (OAG_FLIGHT_INFO_KEY): scheduled and estimated times, status, airports.
// 2. AviationStack (AVIATIONSTACK_API_KEY): fallback, and the only source of live aircraft positions.
// AviationStack's free plan is HTTP-only and about 100 calls a month, so results are cached for 30 minutes per flight.
import { getJson, UpstreamError } from './http';
import { remember } from './cache';
import { oagFlightStatus } from './oag';
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

function aviationStack(key: string, code: string): Promise<FlightStatusResponse> {
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
      // The API can return other flights in the same response, so keep only the number that was asked for.
      const matching = (data.data ?? []).filter((f) => (f.flight?.iata ?? '').toUpperCase() === code);
      const flights: FlightStatus[] = matching.map((f) => ({
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
      return { configured: true, flights, source: 'AviationStack' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Flight lookup failed';
      return { configured: true, flights: [], message, source: 'AviationStack' };
    }
  });
}

export async function getFlightStatus(flight: string): Promise<FlightStatusResponse> {
  const code = flight.toUpperCase();

  let oag: FlightStatusResponse | null = null;
  try {
    oag = await oagFlightStatus(code);
  } catch (err) {
    oag = { configured: true, flights: [], source: 'OAG Flight Info', message: err instanceof Error ? err.message : 'OAG lookup failed' };
  }
  if (oag && oag.flights.length > 0) return oag;

  const asKey = process.env.AVIATIONSTACK_API_KEY;
  if (asKey) {
    const as = await aviationStack(asKey, code);
    if (as.flights.length > 0) return as;
    // Neither source found the flight: report the most useful message.
    if (oag) return { ...as, message: as.message ?? oag.message ?? `No scheduled flight found for ${code} today.`, source: as.source };
    return as;
  }

  if (oag) return { ...oag, message: oag.message ?? `No scheduled flight found for ${code} today.` };
  return {
    configured: false,
    flights: [],
    message: 'Flight status needs an OAG Flight Info key (OAG_FLIGHT_INFO_KEY) or an AviationStack key (AVIATIONSTACK_API_KEY) on the server.',
  };
}
