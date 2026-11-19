import { getCameras } from '@server/lib/cameras';
import { fail, handle, json, param } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/cameras?cca2=PK -> public live webcams (requires WINDY_API_KEY)
export const GET = handle(async (req) => {
  const cca2 = param(req, 'cca2');
  if (!cca2 || !/^[A-Za-z]{2}$/.test(cca2)) return fail(400, 'cca2 must be an ISO alpha-2 code');
  return json(await getCameras(cca2), { maxAge: 600, swr: 1200 });
});
