import { getFlights } from '../server/lib/flights';
import { safeHandler, sendJson } from '../server/lib/http';

// GET /api/flights -> live aircraft positions (airborne only)
export default safeHandler(async (_req, res) => {
  const data = await getFlights();
  sendJson(res, data, { maxAge: 30, swr: 60 });
});
