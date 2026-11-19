// OAG (Official Airline Guide) developer APIs, https://api.oag.com.
// Auth: the Ocp-Apim-Subscription-Key header. Each OAG product has its own subscription key:
//   OAG_FLIGHT_INFO_KEY   Flight Info v2 (free tier: 1,000 calls per 30 days)
//   OAG_CONNECTIONS_KEY   Flight Info Connections (free tier: 1,000 calls per month)
// Flight status uses GET /flight-instances/ (Flight Info v2). The key is rejected on /flights (401).
// Checked against the live API: CarrierCode, FlightNumber, DepartureDateTime, CodeType=IATA, version=v2 returns the
// scheduled instances for that flight.
// Connections: no operation path has been confirmed. Probing guessed paths returns 404, so no call is made until
// the path is known. The free quota is small, so every result is cached on the server.
import { getJson } from './http';
import { remember } from './cache';
import type { ConnectionsResponse, FlightStatus, FlightStatusResponse } from '../../shared/types';

const BASE = 'https://api.oag.com';

// Field names from the live Flight Info v2 response.
interface OagFlight {
  carrier?: { iata?: string };
  serviceSuffix?: string;
  flightNumber?: number;
  flightType?: string;
  departure?: { airport?: { iata?: string }; date?: { local?: string }; time?: { local?: string; utc?: string } };
  arrival?: { airport?: { iata?: string }; date?: { local?: string }; time?: { local?: string; utc?: string } };
  aircraftType?: { iata?: string };
}

async function oagGet<T>(path: string, params: Record<string, string>, key: string): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  return getJson<T>(`${BASE}${path}?${qs}`, {
    timeoutMs: 10000,
    headers: { 'Ocp-Apim-Subscription-Key': key },
  });
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

// Splits "PK300" into carrier "PK" and number "300".
export function splitFlight(code: string): { carrier: string; number: string } | null {
  const m = /^([A-Z0-9]{2})(\d{1,4})[A-Z]?$/.exec(code);
  return m ? { carrier: m[1], number: m[2] } : null;
}

const joinLocal = (date?: string, time?: string) => (date && time ? `${date}T${time}` : null);

const toStatus = (f: OagFlight): FlightStatus => ({
  flight: `${f.carrier?.iata ?? ''}${f.flightNumber ?? ''}${f.serviceSuffix ?? ''}`,
  airline: null,
  date: f.departure?.date?.local ?? null,
  // The response gives the scheduled instance type, not a live status.
  status: f.flightType ?? null,
  departure: {
    airport: null,
    iata: f.departure?.airport?.iata ?? null,
    scheduled: joinLocal(f.departure?.date?.local, f.departure?.time?.local),
    estimated: null,
    delay: null,
  },
  arrival: {
    airport: null,
    iata: f.arrival?.airport?.iata ?? null,
    scheduled: joinLocal(f.arrival?.date?.local, f.arrival?.time?.local),
    estimated: null,
    delay: null,
  },
  live: null,
});

// Returns null when no key is set, so the caller can try another source.
export function oagFlightStatus(code: string): Promise<FlightStatusResponse | null> {
  const key = process.env.OAG_FLIGHT_INFO_KEY;
  const parts = splitFlight(code);
  if (!key || !parts) return Promise.resolve(null);
  return remember(`oag-flight:${code}`, 30 * 60e3, async (): Promise<FlightStatusResponse> => {
    const data = await oagGet<{ data?: OagFlight[] }>(
      '/flight-instances/',
      {
        CarrierCode: parts.carrier,
        FlightNumber: parts.number,
        DepartureDateTime: todayUtc(),
        CodeType: 'IATA',
        version: 'v2',
      },
      key,
    );
    const flights = (data.data ?? []).map(toStatus);
    return { configured: true, flights, source: 'OAG Flight Info' };
  });
}

export function oagConnections(_from: string, _to: string, _date: string): Promise<ConnectionsResponse> {
  const key = process.env.OAG_CONNECTIONS_KEY;
  if (!key) {
    return Promise.resolve({
      configured: false,
      options: [],
      message: 'Connections need an OAG Flight Info Connections key. Add OAG_CONNECTIONS_KEY on the server and redeploy.',
    });
  }
  return Promise.resolve({
    configured: true,
    options: [],
    message:
      'Connections are not available yet: the OAG Flight Info Connections operation has not been confirmed. The key is set; the request path still needs to be confirmed against the OAG portal spec.',
  });
}
