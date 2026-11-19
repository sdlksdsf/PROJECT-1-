import { getFlightStatus, isFlightNumber } from '@server/lib/aviation';
import { fail, handle, json, param } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/flight-status?flight=PK300 -> scheduled and live status (requires AVIATIONSTACK_API_KEY)
export const GET = handle(async (req) => {
  const flight = (param(req, 'flight') ?? '').toUpperCase().replace(/\s+/g, '');
  if (!isFlightNumber(flight)) return fail(400, 'flight must look like PK300 or BA117');
  return json(await getFlightStatus(flight), { maxAge: 900, swr: 1800 });
});
