// Rain radar from RainViewer (free public API, no key). Frames are proxied through this server so the browser
// never has to read cross-origin pixels. Tiles are cached at the CDN for 5 minutes.
import { fetchWithTimeout, getJson, UpstreamError } from './http';
import { remember } from './cache';

const MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const TILE_HOST = 'https://tilecache.rainviewer.com';
const PATH_RE = /^\/v2\/radar\/[a-z0-9]{6,}$/;

export interface RadarFrame {
  time: number;
  path: string;
  attribution: string;
}

export function getRadarFrame(): Promise<RadarFrame> {
  return remember('radar:frame', 120e3, async () => {
    const data = await getJson<{ radar?: { past?: { time: number; path: string }[]; nowcast?: { time: number; path: string }[] } }>(
      MAPS_URL,
      { timeoutMs: 8000 },
    );
    const past = data.radar?.past ?? [];
    const latest = past[past.length - 1];
    if (!latest || !PATH_RE.test(latest.path)) throw new UpstreamError('RainViewer returned no radar frame', 502);
    return { time: latest.time, path: latest.path, attribution: 'Radar: RainViewer.com' };
  });
}

/** One 256 px tile of a radar frame at zoom 2 (x and y in 0..3). Returns PNG bytes. */
export async function getRadarTile(path: string, x: number, y: number): Promise<Response> {
  if (!PATH_RE.test(path)) throw new UpstreamError('invalid radar frame', 400);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 3 || y < 0 || y > 3) {
    throw new UpstreamError('invalid tile', 400);
  }
  // Colour scheme 2 (Universal Blue), smooth 1, snow 1.
  const res = await fetchWithTimeout(`${TILE_HOST}${path}/256/2/${x}/${y}/2/1_1.png`, { timeoutMs: 8000 });
  if (!res.ok) throw new UpstreamError(`RainViewer tile ${res.status}`, 502);
  return new Response(await res.arrayBuffer(), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
