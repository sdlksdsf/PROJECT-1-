import { getDisasters } from '@server/lib/disasters';
import { handle, json } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/disasters -> USGS earthquakes (24h, M2.5+) and NASA EONET open natural events
export const GET = handle(async () => json(await getDisasters(), { maxAge: 120, swr: 300 }));
