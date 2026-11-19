import { getNews } from '@server/lib/news';
import { handle, json } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/news -> clustered stories with factuality scores and per-feed health.
export const GET = handle(async () => json(await getNews(), { maxAge: 120, swr: 600 }));
