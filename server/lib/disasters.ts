// Natural hazards: USGS earthquakes (past 24 h, M2.5+) and NASA EONET open events
// (wildfires, storms, volcanoes, floods, ...). Both are public, keyless feeds.
import { getJson } from './http';
import { remember } from './cache';
import type { DisastersResponse, NatEvent, Quake } from '../../shared/types';

interface UsgsFeature {
  id: string;
  properties: { mag: number | null; place: string | null; time: number; url: string; tsunami: number; };
  geometry: { coordinates: [number, number, number] };
}

interface EonetEvent {
  id: string;
  title: string;
  link?: string;
  categories: { id: string; title: string }[];
  sources?: { id: string; url: string }[];
  geometry: { date: string; type: string; coordinates: unknown }[];
}

function latestPoint(e: EonetEvent): { lat: number; lon: number; date: string } | null {
  const pts = e.geometry.filter((g) => g.type === 'Point' && Array.isArray(g.coordinates));
  if (pts.length === 0) return null;
  const g = pts[pts.length - 1];
  const [lon, lat] = g.coordinates as [number, number];
  return { lat, lon, date: g.date };
}

export function getDisasters(): Promise<DisastersResponse> {
  return remember('disasters', 3 * 60e3, async () => {
    const errors: string[] = [];
    let quakes: Quake[] = [];
    let events: NatEvent[] = [];

    await Promise.all([
      (async () => {
        try {
          const data = await getJson<{ features: UsgsFeature[] }>(
            'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
            { timeoutMs: 8000 },
          );
          quakes = data.features
            .filter((f) => (f.properties.mag ?? 0) >= 2.5)
            .map((f) => ({
              id: f.id,
              mag: f.properties.mag ?? 0,
              place: f.properties.place ?? 'Unknown location',
              time: new Date(f.properties.time).toISOString(),
              lon: f.geometry.coordinates[0],
              lat: f.geometry.coordinates[1],
              depth: f.geometry.coordinates[2],
              tsunami: f.properties.tsunami === 1,
              url: f.properties.url,
            }))
            .sort((a, b) => b.mag - a.mag);
        } catch (err) {
          errors.push(`USGS: ${(err as Error).message}`);
        }
      })(),
      (async () => {
        try {
          const data = await getJson<{ events: EonetEvent[] }>(
            'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=150',
            { timeoutMs: 8000 },
          );
          events = data.events
            .map((e) => {
              const p = latestPoint(e);
              if (!p) return null;
              return {
                id: e.id,
                title: e.title,
                category: e.categories[0]?.title ?? 'Natural event',
                date: p.date,
                lat: p.lat,
                lon: p.lon,
                link: e.sources?.[0]?.url ?? e.link ?? 'https://eonet.gsfc.nasa.gov/',
              } satisfies NatEvent;
            })
            .filter((e): e is NatEvent => e !== null);
        } catch (err) {
          errors.push(`NASA EONET: ${(err as Error).message}`);
        }
      })(),
    ]);

    if (quakes.length === 0 && events.length === 0 && errors.length > 0) {
      throw new Error(errors.join('; '));
    }
    return { updatedAt: new Date().toISOString(), quakes, events, errors };
  });
}
