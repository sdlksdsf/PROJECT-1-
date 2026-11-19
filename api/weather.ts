import { getWeather } from '../server/lib/weather';
import { qs, safeHandler, sendError, sendJson } from '../server/lib/http';

// GET /api/weather?lat=24.86&lon=67.01
export default safeHandler(async (req, res) => {
  const lat = Number(qs(req, 'lat'));
  const lon = Number(qs(req, 'lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return sendError(res, 400, 'lat and lon are required');
  }
  const data = await getWeather(lat, lon);
  sendJson(res, data, { maxAge: 600, swr: 1200 });
});
