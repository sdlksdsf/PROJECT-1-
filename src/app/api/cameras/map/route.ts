import { getCameraMap } from '@server/lib/cameras';
import { handle, json } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/cameras/map -> worldwide webcam markers for the globe (OpenWebcamDB, requires WEBCAMDB_API_KEY)
export const GET = handle(async () => json(await getCameraMap(), { maxAge: 600, swr: 1200 }));
