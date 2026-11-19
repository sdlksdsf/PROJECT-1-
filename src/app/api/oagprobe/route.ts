// TEMPORARY diagnostic route. Returns only HTTP status codes and short snippets. Removed after the test.
export const dynamic = 'force-dynamic';

const CANDIDATES = [
  '/flights?carrierCode=BA&flightNumber=117&departureDate=2026-11-19',
  '/flights?departuredate=2026-11-19&limit=2',
  '/flight-instances/?DepartureDateTime=2026-11-19&DepartureAirport=LHR&CodeType=IATA&version=v2',
  '/flight-instances?DepartureDate=2026-11-19&Limit=2&version=1.0',
  '/flight-instances/?DepartureDateTime=2026-11-19&ArrivalDateTime=2026-11-19&DepartureAirport=LHR&ArrivalAirport=ATH&CodeType=IATA,ICAO&version=v2',
  '/flight-connections/?departureAirport=LHR&arrivalAirport=ATH&departureDate=2026-11-20',
];

export async function GET() {
  const key = process.env.OAG_FLIGHT_INFO_KEY ?? '';
  const ckey = process.env.OAG_CONNECTIONS_KEY ?? '';
  const out: { path: string; keyLen: number; status: number | string; snippet: string }[] = [];
  for (const path of CANDIDATES) {
    for (const k of [key, ckey]) {
      try {
        const r = await fetch(`https://api.oag.com${path}`, {
          headers: { 'Ocp-Apim-Subscription-Key': k, 'Subscription-Key': k, accept: 'application/json' },
          cache: 'no-store',
        });
        const body = (await r.text()).slice(0, 160).replace(/\s+/g, ' ');
        out.push({ path, keyLen: k.length, status: r.status, snippet: body });
      } catch (e) {
        out.push({ path, keyLen: k.length, status: 'error', snippet: String(e).slice(0, 80) });
      }
    }
  }
  return Response.json(out);
}
