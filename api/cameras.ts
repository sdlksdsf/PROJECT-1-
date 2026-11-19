import { getCameras } from '../server/lib/cameras';
import { qs, safeHandler, sendError, sendJson } from '../server/lib/http';

// GET /api/cameras?cca2=PK -> public live webcams (requires WINDY_API_KEY)
export default safeHandler(async (req, res) => {
  const cca2 = qs(req, 'cca2');
  if (!cca2 || !/^[A-Za-z]{2}$/.test(cca2)) return sendError(res, 400, 'cca2 must be an ISO alpha-2 code');
  const data = await getCameras(cca2);
  sendJson(res, data, { maxAge: 600, swr: 1200 });
});
