import { getFlights } from '@server/lib/flights';
import { handle, json } from '@server/lib/http';

export const dynamic = 'force-dynamic';
// Up to 24 hub queries in batches of six.
export const maxDuration = 30;

// GET /api/flights -> live aircraft positions (airborne only)
export const GET = handle(async () => json(await getFlights(), { maxAge: 60, swr: 120 }));
