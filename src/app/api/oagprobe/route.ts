// TEMPORARY diagnostic route. Returns HTTP status codes and field NAMES only (no values). Removed after the test.
export const dynamic = 'force-dynamic';

const CANDIDATES = [
  '/flight-instances/?CarrierCode=BA&FlightNumber=117&DepartureDateTime=2026-11-19&version=v2',
  '/flight-instances/?carrierCode=BA&flightNumber=117&DepartureDateTime=2026-11-19&version=v2',
  '/flight-instances/?CarrierCode=BA&FlightNumber=117&DepartureDateTime=2026-11-19&CodeType=IATA&version=v2',
  '/flight-instances/?DepartureDateTime=2026-11-19&DepartureAirport=LHR&ArrivalAirport=ATH&CodeType=IATA&version=v2',
];

function keysOf(v: unknown, prefix = '', out: string[] = [], depth = 0): string[] {
  if (depth > 4 || out.length > 120) return out;
  if (Array.isArray(v)) {
    if (v.length) keysOf(v[0], prefix + '[]', out, depth + 1);
  } else if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v)) {
      const p = prefix ? `${prefix}.${k}` : k;
      out.push(p + (typeof val === 'object' && val !== null ? '' : `:${typeof val}`));
      keysOf(val, p, out, depth + 1);
    }
  }
  return out;
}

export async function GET() {
  const key = process.env.OAG_FLIGHT_INFO_KEY ?? '';
  const out: { path: string; status: number | string; fields?: string[]; count?: number; error?: string }[] = [];
  for (const path of CANDIDATES) {
    try {
      const r = await fetch(`https://api.oag.com${path}`, {
        headers: { 'Ocp-Apim-Subscription-Key': key, 'Subscription-Key': key, accept: 'application/json' },
        cache: 'no-store',
      });
      const text = await r.text();
      if (r.status === 200) {
        const j = JSON.parse(text) as { data?: unknown[] };
        out.push({ path, status: 200, count: j.data?.length ?? 0, fields: keysOf(j.data?.[0]) });
      } else {
        out.push({ path, status: r.status, error: text.slice(0, 120).replace(/\s+/g, ' ') });
      }
    } catch (e) {
      out.push({ path, status: 'error', error: String(e).slice(0, 80) });
    }
  }
  return Response.json(out);
}
