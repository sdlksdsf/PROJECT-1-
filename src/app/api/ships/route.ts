import { getShips } from '@server/lib/ships';
import { handle, json } from '@server/lib/http';

export const dynamic = 'force-dynamic';
// A ship refresh listens to AISStream for about 10 seconds.
export const maxDuration = 30;

// GET /api/ships -> recent AIS position reports (server-side key, cached one minute)
export const GET = handle(async () => json(await getShips(), { maxAge: 60, swr: 120 }));
