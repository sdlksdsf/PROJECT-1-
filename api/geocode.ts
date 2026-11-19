import { geocode } from '../server/lib/geocode';
import { qs, safeHandler, sendError, sendJson } from '../server/lib/http';

// GET /api/geocode?q=Karachi
export default safeHandler(async (req, res) => {
  const q = qs(req, 'q');
  if (!q || q.length < 2) return sendError(res, 400, 'q must be at least 2 characters');
  const results = await geocode(q.slice(0, 80));
  sendJson(res, { results }, { maxAge: 86400, swr: 86400 });
});
