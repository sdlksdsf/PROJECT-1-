import { safeHandler, sendJson } from '../server/lib/http';
import { getNews } from '../server/lib/news';

// GET /api/news -> clustered stories with factuality scores and per-feed health.
export default safeHandler(async (_req, res) => {
  const data = await getNews();
  sendJson(res, data, { maxAge: 120, swr: 600 });
});
