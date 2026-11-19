import { getWeatherTile, isWeatherLayerKey } from '@server/lib/weatherMaps';
import { fail, handle, param } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/weather/tile?layer=temp|wind|clouds|precip&x=0..3&y=0..3 -> one weather map tile (PNG; z defaults to 2)
export const GET = handle(async (req) => {
  const layer = param(req, 'layer') ?? '';
  if (!isWeatherLayerKey(layer)) return fail(400, 'unknown weather layer');
  const z = Number(param(req, 'z') ?? 2);
  const x = Number(param(req, 'x'));
  const y = Number(param(req, 'y'));
  return getWeatherTile(layer, z, x, y);
});
