// Public webcams for a country from two free sources, merged into one list:
//  - Windy Webcams API v3 (env WINDY_API_KEY, header X-WINDY-API-KEY). Attribution required on the free tier.
//  - OpenWebcamDB API v1 (env WEBCAMDB_API_KEY, Bearer token). Free for non-commercial use with attribution.
// Each source reports its own status, so a wrong or missing key is visible on the site instead of failing silently.
import { getJson, UpstreamError } from './http';
import { remember } from './cache';
import type { CamerasResponse, Camera, CameraSourceId, CameraSourceStatus } from '../../shared/types';

interface WindyWebcam {
  webcamId: number;
  title: string;
  location?: { city?: string; latitude?: number; longitude?: number };
  images?: { current?: { preview?: string } };
  player?: { live?: { embed?: string }; day?: { embed?: string } };
  urls?: { detail?: string };
}

interface WebcamDbItem {
  slug: string;
  title: string;
  city?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  thumbnail_url?: string | null;
  permalink?: string | null;
  attribution?: string | null;
}

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function statusOf(err: unknown): CameraSourceStatus {
  if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) return 'auth-failed';
  return 'error';
}

async function fromWindy(code: string, key: string): Promise<Camera[]> {
  const data = await getJson<{ webcams?: WindyWebcam[] }>(
    `https://api.windy.com/webcams/api/v3/webcams?${new URLSearchParams({
      countries: code,
      limit: '24',
      include: 'location,images,player,urls',
    })}`,
    { timeoutMs: 8000, headers: { 'x-windy-api-key': key } },
  );
  return (data.webcams ?? []).map((w) => ({
    id: `windy-${w.webcamId}`,
    source: 'windy' as CameraSourceId,
    title: w.title,
    city: w.location?.city ?? null,
    lat: w.location?.latitude ?? null,
    lon: w.location?.longitude ?? null,
    preview: w.images?.current?.preview ?? null,
    embed: w.player?.live?.embed ?? w.player?.day?.embed ?? null,
    url: w.urls?.detail ?? null,
    attribution: 'Webcams: Windy.com',
  }));
}

async function fromWebcamDb(code: string, key: string): Promise<Camera[]> {
  // Country path takes the two-letter ISO code (e.g. /countries/PK). Lists are paginated under `data`.
  const data = await getJson<{ data?: WebcamDbItem[] | { webcams?: WebcamDbItem[] } }>(
    `https://openwebcamdb.com/api/v1/countries/${code}?per_page=24`,
    { timeoutMs: 8000, headers: { authorization: `Bearer ${key}` } },
  );
  const items = Array.isArray(data.data) ? data.data : (data.data?.webcams ?? []);
  return items.map((w) => ({
    id: `owdb-${w.slug}`,
    source: 'openwebcamdb' as CameraSourceId,
    title: w.title,
    city: w.city ?? null,
    lat: num(w.latitude),
    lon: num(w.longitude),
    preview: w.thumbnail_url ?? null,
    embed: null,
    url: w.permalink ?? null,
    attribution: w.attribution ?? 'Webcams: OpenWebcamDB',
  }));
}

export function getCameras(cca2: string): Promise<CamerasResponse> {
  const code = cca2.toUpperCase();
  return remember(`cameras:${code}`, 10 * 60e3, async () => {
    const windyKey = process.env.WINDY_API_KEY;
    const dbKey = process.env.WEBCAMDB_API_KEY;
    const sources: Record<CameraSourceId, CameraSourceStatus> = {
      windy: windyKey ? 'ok' : 'no-key',
      openwebcamdb: dbKey ? 'ok' : 'no-key',
    };
    const jobs: Promise<Camera[]>[] = [];
    const ids: CameraSourceId[] = [];
    if (windyKey) {
      ids.push('windy');
      jobs.push(fromWindy(code, windyKey));
    }
    if (dbKey) {
      ids.push('openwebcamdb');
      jobs.push(fromWebcamDb(code, dbKey));
    }
    const results = await Promise.allSettled(jobs);
    const cameras: Camera[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') cameras.push(...r.value);
      else sources[ids[i]] = statusOf(r.reason);
    });
    const configured = Boolean(windyKey || dbKey);
    const message = configured
      ? undefined
      : 'Live camera feeds need a free key. Add WINDY_API_KEY or WEBCAMDB_API_KEY on the server.';
    return { configured, cameras: cameras.slice(0, 40), sources, message };
  });
}
