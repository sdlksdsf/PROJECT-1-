// Public webcams for a country via the Windy Webcams API v3 (free key, env WINDY_API_KEY).
// Without a key the function reports `configured: false` and the UI explains how to enable it.
import { getJson } from './http';
import { remember } from './cache';
import type { CamerasResponse, Camera } from '../../shared/types';

interface WindyWebcam {
  webcamId: number;
  title: string;
  location?: { city?: string; latitude?: number; longitude?: number };
  images?: { current?: { preview?: string } };
  player?: { live?: { embed?: string }; day?: { embed?: string } };
  urls?: { detail?: string };
}

export function getCameras(cca2: string): Promise<CamerasResponse> {
  const key = process.env.WINDY_API_KEY;
  if (!key) {
    return Promise.resolve({
      configured: false,
      cameras: [],
      message: 'Live camera feeds need a free Windy Webcams API key. Set WINDY_API_KEY in the server environment.',
    });
  }
  const code = cca2.toUpperCase();
  return remember(`cameras:${code}`, 10 * 60e3, async () => {
    const data = await getJson<{ webcams?: WindyWebcam[] }>(
      `https://api.windy.com/webcams/api/v3/webcams?${new URLSearchParams({
        countries: code,
        limit: '24',
        include: 'location,images,player,urls',
      })}`,
      { timeoutMs: 8000, headers: { 'x-windy-api-key': key } },
    );
    const cameras: Camera[] = (data.webcams ?? []).map((w) => ({
      id: String(w.webcamId),
      title: w.title,
      city: w.location?.city ?? null,
      lat: w.location?.latitude ?? null,
      lon: w.location?.longitude ?? null,
      preview: w.images?.current?.preview ?? null,
      embed: w.player?.live?.embed ?? w.player?.day?.embed ?? null,
      url: w.urls?.detail ?? null,
    }));
    return { configured: true, cameras };
  });
}
