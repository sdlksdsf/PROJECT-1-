import { getInsights } from '@server/lib/insights';
import { handle, json } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/insights -> AI brief of the top stories (cached 15 min). configured:false when no AI key is set.
export const GET = handle(async () => json(await getInsights(), { maxAge: 300, swr: 900 }));
