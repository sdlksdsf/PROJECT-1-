import { getRadarFrame } from '@server/lib/radar';
import { handle, json } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/radar/frame -> the latest rain radar frame (RainViewer, no key)
export const GET = handle(async () => json(await getRadarFrame(), { maxAge: 120, swr: 300 }));
