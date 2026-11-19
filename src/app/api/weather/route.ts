import { getWeather } from '@server/lib/weather';
import { fail, handle, json, param } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/weather?lat=24.86&lon=67.01
export const GET = handle(async (req) => {
  const lat = Number(param(req, 'lat'));
  const lon = Number(param(req, 'lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return fail(400, 'lat and lon are required');
  }
  return json(await getWeather(lat, lon), { maxAge: 600, swr: 1200 });
});
