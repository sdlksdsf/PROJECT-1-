import { getRadarTile } from '@server/lib/radar';
import { fail, handle, param } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/radar/tile?p=/v2/radar/<frame>&x=0..3&y=0..3 -> one radar tile (PNG)
export const GET = handle(async (req) => {
  const p = param(req, 'p');
  const x = Number(param(req, 'x'));
  const y = Number(param(req, 'y'));
  if (!p) return fail(400, 'p is required');
  return getRadarTile(p, x, y);
});
