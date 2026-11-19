// Rain radar from RainViewer (free public API, no key). Frames are proxied through this server so the browser
// never has to read cross-origin pixels. Tiles are cached at the CDN for 5 minutes.
import { fetchWithTimeout, getJson, UpstreamError } from './http';
import { remember } from './cache';

const MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const TILE_HOST = 'https://tilecache.rainviewer.com';
const PATH_RE = /^\/v2\/radar\/[a-z0-9]{6,}$/;

export interface RadarFrame {
  time: number; // unix seconds
  path: string;
  forecast: boolean; // true for nowcast frames (short-range forecast)
}

export interface RadarFrames {
  generated: number; // unix seconds, when RainViewer built the list
  frames: RadarFrame[]; // oldest first; past observations, then any forecast frames
  attribution: string;
}

type Raw = { time: number; path: string }[] | undefined;

/** The last two hours of observed rain (about 13 frames) plus any short-range forecast frames. */
export function getRadarFrames(): Promise<RadarFrames> {
  return remember('radar:frames', 60e3, async () => {
    const data = await getJson<{ generated?: number; radar?: { past?: Raw; nowcast?: Raw } }>(MAPS_URL, { timeoutMs: 8000 });
    const past = (data.radar?.past ?? []).filter((f) => PATH_RE.test(f.path));
    const nowcast = (data.radar?.nowcast ?? []).filter((f) => PATH_RE.test(f.path));
    if (past.length === 0) throw new UpstreamError('RainViewer returned no radar frames', 502);
    const frames: RadarFrame[] = [
      ...past.map((f) => ({ time: f.time, path: f.path, forecast: false })),
      ...nowcast.map((f) => ({ time: f.time, path: f.path, forecast: true })),
    ];
    return {
      generated: data.generated ?? Math.floor(Date.now() / 1000),
      frames,
      attribution: 'Radar: RainViewer.com',
    };
  });
}

/** One 256 px radar tile of a frame (zoom 0..7; x and y in 0..2^z-1). Returns PNG bytes. */
export async function getRadarTile(path: string, z: number, x: number, y: number): Promise<Response> {
  if (!PATH_RE.test(path)) throw new UpstreamError('invalid radar frame', 400);
  if (!Number.isInteger(z) || z < 0 || z > 7) throw new UpstreamError('invalid zoom', 400);
  const max = 2 ** z - 1;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > max || y < 0 || y > max) {
    throw new UpstreamError('invalid tile', 400);
  }
  // Colour scheme 2 (Universal Blue), smooth 1, snow 1.
  const res = await fetchWithTimeout(`${TILE_HOST}${path}/256/${z}/${x}/${y}/2/1_1.png`, { timeoutMs: 8000 });
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
