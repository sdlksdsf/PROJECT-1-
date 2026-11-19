// Public webcams from two free sources:
//  - Windy Webcams API v3 (env WINDY_API_KEY, header x-windy-api-key). Attribution required on the free tier.
//    Image links expire after 10 minutes, so the viewer re-requests a camera every minute.
//  - OpenWebcamDB API v1 (env WEBCAMDB_API_KEY, Bearer token). Free for non-commercial use with attribution.
//    Each webcam has a stream type (youtube, iframe, hls, mjpeg, image); single-webcam requests include the stream URL.
// Each source reports its own status, so a wrong or missing key is visible on the site instead of failing silently.
import { getJson, UpstreamError } from './http';
import { remember } from './cache';
import type { Camera, CameraDetail, CameraKind, CamerasResponse, CameraSourceId, CameraSourceStatus } from '../../shared/types';

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
  stream_type?: string | null;
  stream_url?: string | null;
}

const WORLD = { lat_min: '-58', lat_max: '75', lng_min: '-180', lng_max: '180' };
const MAP_LIMIT = 500;

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function statusOf(err: unknown): CameraSourceStatus {
  if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) return 'auth-failed';
  return 'error';
}

const isHttps = (u: string | null | undefined): u is string => typeof u === 'string' && u.startsWith('https://');

/** Maps an OpenWebcamDB stream type to a kind the viewer can show. Unknown types are not playable in-app. */
function kindOf(streamType: string | null | undefined): CameraKind | null {
  switch (streamType) {
    case 'youtube':
    case 'iframe':
    case 'hls':
    case 'mjpeg':
    case 'image':
      return streamType;
    default:
      return null;
  }
}

/** Turns a YouTube watch or live URL into the privacy-enhanced embed URL. Returns null if no video id is found. */
function youtubeEmbed(url: string): string | null {
  const m = /(?:v=|youtu\.be\/|embed\/|live\/)([A-Za-z0-9_-]{6,})/.exec(url);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&mute=1` : null;
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
  return (data.webcams ?? []).map((w) => {
    const embed = w.player?.live?.embed ?? w.player?.day?.embed ?? null;
    return {
      id: `windy-${w.webcamId}`,
      source: 'windy' as CameraSourceId,
      title: w.title,
      city: w.location?.city ?? null,
      lat: w.location?.latitude ?? null,
      lon: w.location?.longitude ?? null,
      preview: w.images?.current?.preview ?? null,
      embed,
      url: w.urls?.detail ?? null,
      attribution: 'Webcams: Windy.com',
      kind: embed ? 'iframe' : 'image',
    };
  });
}

function toWebcamDbCamera(w: WebcamDbItem): Camera {
  return {
    id: `owdb-${w.slug}`,
    source: 'openwebcamdb',
    title: w.title,
    city: w.city ?? null,
    lat: num(w.latitude),
    lon: num(w.longitude),
    preview: w.thumbnail_url ?? null,
    embed: null,
    url: w.permalink ?? null,
    attribution: w.attribution ?? 'Webcams: OpenWebcamDB',
    kind: kindOf(w.stream_type),
  };
}

async function fromWebcamDb(code: string, key: string): Promise<Camera[]> {
  // Country path takes the two-letter ISO code (e.g. /countries/PK). Lists are paginated under `data`.
  let data: { data?: WebcamDbItem[] | { webcams?: WebcamDbItem[] } };
  try {
    data = await getJson<{ data?: WebcamDbItem[] | { webcams?: WebcamDbItem[] } }>(
      `https://openwebcamdb.com/api/v1/countries/${code}?per_page=24`,
      { timeoutMs: 8000, headers: { authorization: `Bearer ${key}` } },
    );
  } catch (err) {
    // 404 = this country has no webcams in the directory; that is an empty result, not an error.
    if (err instanceof UpstreamError && err.status === 404) return [];
    throw err;
  }
  const items = Array.isArray(data.data) ? data.data : (data.data?.webcams ?? []);
  return items.map(toWebcamDbCamera);
}

/** Cameras for one country (list shown in the country drawer). */
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

/** Worldwide OpenWebcamDB cameras for the globe (one request, cached 10 minutes). */
export function getCameraMap(): Promise<CamerasResponse> {
  return remember('cameras:map', 10 * 60e3, async () => {
    const dbKey = process.env.WEBCAMDB_API_KEY;
    const sources: Record<CameraSourceId, CameraSourceStatus> = {
      windy: process.env.WINDY_API_KEY ? 'ok' : 'no-key',
      openwebcamdb: dbKey ? 'ok' : 'no-key',
    };
    if (!dbKey) {
      return {
        configured: Boolean(process.env.WINDY_API_KEY),
        cameras: [],
        sources,
        message: 'Worldwide camera markers need the OpenWebcamDB key (WEBCAMDB_API_KEY) on the server.',
      };
    }
    try {
      const qs = new URLSearchParams({ ...WORLD }).toString();
      const data = await getJson<{ data?: WebcamDbItem[] } | WebcamDbItem[]>(
        `https://openwebcamdb.com/api/v1/webcams/map?${qs}`,
        { timeoutMs: 10000, headers: { authorization: `Bearer ${dbKey}` } },
      );
      const items = Array.isArray(data) ? data : (data.data ?? []);
      const cameras = items
        .map(toWebcamDbCamera)
        .filter((c) => c.lat !== null && c.lon !== null)
        .slice(0, MAP_LIMIT);
      return { configured: true, cameras, sources };
    } catch (err) {
      sources.openwebcamdb = statusOf(err);
      return { configured: true, cameras: [], sources, message: 'OpenWebcamDB map is unavailable right now.' };
    }
  });
}

/** Live view for one camera. Ids come from the lists above: `owdb-<slug>` or `windy-<id>`. */
export function getCamera(id: string): Promise<CameraDetail | null> {
  if (!/^(owdb-[a-z0-9-]+|windy-\d+)$/i.test(id)) return Promise.resolve(null);
  return remember(`camera:${id}`, 60e3, async (): Promise<CameraDetail> => {
    const base = { id, title: id, city: null, attribution: null, permalink: null };
    try {
      if (id.startsWith('owdb-')) {
        const key = process.env.WEBCAMDB_API_KEY;
        if (!key) return { ...base, source: 'openwebcamdb', kind: null, stream: null, refreshSeconds: null, message: 'No OpenWebcamDB key on the server.' };
        const slug = id.slice(5);
        const res = await getJson<{ data?: WebcamDbItem } & WebcamDbItem>(`https://openwebcamdb.com/api/v1/webcams/${slug}`, {
          timeoutMs: 8000,
          headers: { authorization: `Bearer ${key}` },
        });
        const w = res.data ?? res;
        const kind = kindOf(w.stream_type);
        let stream: string | null = null;
        if (kind === 'youtube' && isHttps(w.stream_url)) stream = youtubeEmbed(w.stream_url);
        else if (kind && isHttps(w.stream_url)) stream = w.stream_url;
        return {
          id,
          title: w.title,
          city: w.city ?? null,
          source: 'openwebcamdb',
          attribution: w.attribution ?? 'Webcams: OpenWebcamDB',
          permalink: w.permalink ?? null,
          kind: stream ? (kind === 'youtube' ? 'iframe' : kind) : null,
          stream,
          refreshSeconds: kind === 'image' ? 30 : null,
          message: stream ? undefined : 'This camera does not offer a stream the site can show. Open it on OpenWebcamDB.',
        };
      }
      const key = process.env.WINDY_API_KEY;
      if (!key) return { ...base, source: 'windy', kind: null, stream: null, refreshSeconds: null, message: 'No Windy key on the server.' };
      const windyId = id.slice(6);
      const res = await getJson<{ webcam?: WindyWebcam } & WindyWebcam>(
        `https://api.windy.com/webcams/api/v3/webcams/${windyId}?include=location,images,player,urls`,
        { timeoutMs: 8000, headers: { 'x-windy-api-key': key } },
      );
      const w = res.webcam ?? res;
      const embed = w.player?.live?.embed ?? w.player?.day?.embed ?? null;
      const preview = w.images?.current?.preview ?? null;
      if (isHttps(embed)) {
        return {
          id,
          title: w.title,
          city: w.location?.city ?? null,
          source: 'windy',
          attribution: 'Webcams: Windy.com',
          permalink: w.urls?.detail ?? null,
          kind: 'iframe',
          stream: embed,
          refreshSeconds: null,
        };
      }
      return {
        id,
        title: w.title,
        city: w.location?.city ?? null,
        source: 'windy',
        attribution: 'Webcams: Windy.com',
        permalink: w.urls?.detail ?? null,
        kind: isHttps(preview) ? 'image' : null,
        stream: isHttps(preview) ? preview : null,
        refreshSeconds: 60,
        message: isHttps(preview) ? undefined : 'Windy has no picture for this camera right now.',
      };
    } catch (err) {
      const message = err instanceof UpstreamError && err.status === 404 ? 'This camera is no longer listed.' : 'The camera could not be loaded.';
      return { ...base, source: id.startsWith('owdb-') ? 'openwebcamdb' : 'windy', kind: null, stream: null, refreshSeconds: null, message };
    }
  });
}
