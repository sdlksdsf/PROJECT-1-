import { geocode } from '@server/lib/geocode';
import { fail, handle, json, param } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/geocode?q=Karachi
export const GET = handle(async (req) => {
  const q = param(req, 'q');
  if (!q || q.length < 2) return fail(400, 'q must be at least 2 characters');
  return json({ results: await geocode(q.slice(0, 80)) }, { maxAge: 86400, swr: 86400 });
});
