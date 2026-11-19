import { getRadarTile } from '@server/lib/radar';
import { fail, handle, param } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/radar/tile?p=/v2/radar/<frame>&z=0..7&x=&y= -> one radar tile (PNG); z defaults to 2
export const GET = handle(async (req) => {
  const p = param(req, 'p');
  const z = Number(param(req, 'z') ?? 2);
  const x = Number(param(req, 'x'));
  const y = Number(param(req, 'y'));
  if (!p) return fail(400, 'p is required');
  return getRadarTile(p, z, x, y);
});
