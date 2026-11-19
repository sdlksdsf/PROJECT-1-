// OAG (Official Airline Guide) developer APIs, https://api.oag.com.
// Endpoints and parameters follow OAG's published OpenAPI document (Flight Info v2.0.0):
//   GET /flights      carrierCode, flightNumber, departureDate (flight status)
//   GET /connections  departureAirport, arrivalAirport, departureDate, maxConnections
// Auth: the Ocp-Apim-Subscription-Key header. Each OAG product has its own subscription key:
//   OAG_FLIGHT_INFO_KEY   Flight Info (free tier: 1,000 calls per 30 days)
//   OAG_CONNECTIONS_KEY   Flight Info Connections (free tier: 1,000 calls per month)
// The free quota is small, so every result is cached on the server.
import { getJson, UpstreamError } from './http';
import { remember } from './cache';
import type { ConnectionOption, ConnectionsResponse, FlightStatus, FlightStatusResponse } from '../../shared/types';

const BASE = 'https://api.oag.com';

interface OagFlight {
  carrierCode?: string;
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureTime?: string;
  arrivalTime?: string;
  status?: string;
  aircraftType?: string;
}

interface OagConnection {
  segments?: OagFlight[];
  totalDuration?: string;
  connectionCount?: number;
}

async function oagGet<T>(path: string, params: Record<string, string>, key: string): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  return getJson<T>(`${BASE}${path}?${qs}`, {
    timeoutMs: 10000,
    headers: { 'Ocp-Apim-Subscription-Key': key, 'Subscription-Key': key },
  });
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

// Splits "PK300" into carrier "PK" and number "300".
export function splitFlight(code: string): { carrier: string; number: string } | null {
  const m = /^([A-Z0-9]{2})(\d{1,4})[A-Z]?$/.exec(code);
  return m ? { carrier: m[1], number: m[2] } : null;
}

const toStatus = (f: OagFlight): FlightStatus => ({
  flight: `${f.carrierCode ?? ''}${f.flightNumber ?? ''}`,
  airline: null,
  date: f.departureTime ? f.departureTime.slice(0, 10) : null,
  status: f.status ?? null,
  departure: { airport: null, iata: f.departureAirport ?? null, scheduled: f.departureTime ?? null, estimated: null, delay: null },
  arrival: { airport: null, iata: f.arrivalAirport ?? null, scheduled: f.arrivalTime ?? null, estimated: null, delay: null },
  live: null,
});

// Returns null when no key is set, so the caller can try another source.
export function oagFlightStatus(code: string): Promise<FlightStatusResponse | null> {
  const key = process.env.OAG_FLIGHT_INFO_KEY;
  const parts = splitFlight(code);
  if (!key || !parts) return Promise.resolve(null);
  return remember(`oag-flight:${code}`, 30 * 60e3, async (): Promise<FlightStatusResponse> => {
    const data = await oagGet<{ data?: OagFlight[] }>('/flights', { carrierCode: parts.carrier, flightNumber: parts.number, departureDate: todayUtc() }, key);
    const flights = (data.data ?? []).map(toStatus);
    return { configured: true, flights, source: 'OAG Flight Info' };
  });
}

export function oagConnections(from: string, to: string, date: string): Promise<ConnectionsResponse> {
  const key = process.env.OAG_CONNECTIONS_KEY;
  if (!key) {
    return Promise.resolve({
      configured: false,
      options: [],
      message: 'Connections need an OAG Flight Info Connections key. Add OAG_CONNECTIONS_KEY on the server and redeploy.',
    });
  }
  return remember(`oag-conn:${from}:${to}:${date}`, 6 * 3600e3, async (): Promise<ConnectionsResponse> => {
    try {
      const data = await oagGet<{ data?: OagConnection[] }>(
        '/connections',
        { departureAirport: from, arrivalAirport: to, departureDate: date, maxConnections: '2' },
        key,
      );
      const options: ConnectionOption[] = (data.data ?? []).map((c) => ({
        totalDuration: c.totalDuration ?? null,
        stops: c.connectionCount ?? Math.max(0, (c.segments?.length ?? 1) - 1),
        segments: (c.segments ?? []).map((s) => ({
          flight: `${s.carrierCode ?? ''}${s.flightNumber ?? ''}`,
          from: s.departureAirport ?? null,
          to: s.arrivalAirport ?? null,
          departs: s.departureTime ?? null,
          arrives: s.arrivalTime ?? null,
        })),
      }));
      return { configured: true, options, source: 'OAG Flight Info Connections' };
    } catch (err) {
      const message = err instanceof UpstreamError ? err.message : 'Connections lookup failed';
      return { configured: true, options: [], message };
    }
  });
}
