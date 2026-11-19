import { getRadarFrames } from '@server/lib/radar';
import { handle, json } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/radar/frames -> the rain radar frame list, oldest first (RainViewer, no key)
export const GET = handle(async () => json(await getRadarFrames(), { maxAge: 60, swr: 120 }));
