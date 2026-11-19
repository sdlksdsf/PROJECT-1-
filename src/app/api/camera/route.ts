import { getCamera } from '@server/lib/cameras';
import { fail, handle, json, param } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/camera?id=owdb-<slug> | windy-<id> -> the live view for one camera.
// Short cache: Windy image links expire after 10 minutes.
export const GET = handle(async (req) => {
  const id = param(req, 'id');
  if (!id) return fail(400, 'id is required');
  const detail = await getCamera(id);
  if (!detail) return fail(400, 'unknown camera id');
  return json(detail, { maxAge: 30, swr: 60 });
});
