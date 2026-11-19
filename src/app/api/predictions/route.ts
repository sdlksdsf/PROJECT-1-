import { getPredictions } from '@server/lib/predictions';
import { handle, json } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/predictions -> most-traded prediction markets (Polymarket, public data, cached 5 min)
export const GET = handle(async () => json(await getPredictions(), { maxAge: 120, swr: 300 }));
