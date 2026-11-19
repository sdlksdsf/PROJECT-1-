// Weather map tiles from OpenWeather "Weather maps 1.0" (included in the free plan).
// The key stays on the server: the browser asks this proxy for tiles, never OpenWeather directly.
// These maps are refreshed by OpenWeather about every 3 hours, so the UI says so.
import { fetchWithTimeout, UpstreamError } from './http';

export const WEATHER_LAYERS = {
  temp: { id: 'temp_new', label: 'Temperature' },
  wind: { id: 'wind_new', label: 'Wind speed' },
  clouds: { id: 'clouds_new', label: 'Clouds' },
  precip: { id: 'precipitation_new', label: 'Precipitation & snow' },
} as const;

export type WeatherLayerKey = keyof typeof WEATHER_LAYERS;

export function isWeatherLayerKey(v: string): v is WeatherLayerKey {
  return Object.prototype.hasOwnProperty.call(WEATHER_LAYERS, v);
}

/** One 256 px weather tile (zoom 0..5; x and y in 0..2^z-1). Returns PNG bytes. */
export async function getWeatherTile(layer: WeatherLayerKey, z: number, x: number, y: number): Promise<Response> {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) throw new UpstreamError('weather maps are not configured', 503);
  if (!Number.isInteger(z) || z < 0 || z > 5) throw new UpstreamError('invalid zoom', 400);
  const max = 2 ** z - 1;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > max || y < 0 || y > max) {
    throw new UpstreamError('invalid tile', 400);
  }
  const url = `https://tile.openweathermap.org/map/${WEATHER_LAYERS[layer].id}/${z}/${x}/${y}.png?appid=${encodeURIComponent(key)}`;
  const res = await fetchWithTimeout(url, { timeoutMs: 8000 });
  if (!res.ok) throw new UpstreamError(`OpenWeather tile ${res.status}`, 502);
  return new Response(await res.arrayBuffer(), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
    },
  });
}
