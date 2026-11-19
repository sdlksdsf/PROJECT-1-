import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { appStore, openCamera } from '../lib/appState';
import { useStore } from '../lib/store';
import { escapeHtml } from '../lib/format';
import { CHOKEPOINTS } from '../data/chokepoints';
import type { Camera, DisastersResponse, FlightsResponse, ShipPoint } from '../../shared/types';

// Flat 2D map with the rain radar animated over it. Rain is drawn as one tile layer per frame, so the
// animation only changes opacity and never re-downloads tiles. Weather maps come from the server proxy.

interface Frame {
  path: string;
  time: number; // unix seconds
  forecast: boolean;
}

const FRAME_MS = 600;
const HOLD_CYCLES = 4; // pause on the newest frame
const REFRESH_MS = 60_000;
const RADAR_MAX_NATIVE_ZOOM = 7; // RainViewer tiles exist up to zoom 7
const WEATHER_MAX_NATIVE_ZOOM = 5;
const RADAR_OPACITY = 0.75;

const WEATHER_NAMES: Record<string, string> = {
  temp: 'Temperature',
  wind: 'Wind speed',
  clouds: 'Clouds',
  precip: 'Precipitation & snow',
};

const BASEMAP = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};
const BASEMAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>';

async function fetchFrames(): Promise<Frame[]> {
  const res = await fetch('/api/radar/frames', { cache: 'no-store' });
  if (!res.ok) throw new Error(`radar frames ${res.status}`);
  const data = (await res.json()) as { frames: Frame[] };
  return data.frames;
}

function frameUrl(path: string) {
  return `https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/2/1_1.png`;
}

interface RadarMapProps {
  flights: FlightsResponse | null;
  disasters: DisastersResponse | null;
  ships: ShipPoint[];
  cameras: Camera[];
}

export function RadarMap({ flights, disasters, ships, cameras }: RadarMapProps) {
  const theme = useStore(appStore, (s) => s.theme);
  const layers = useStore(appStore, (s) => s.layers);
  const rainOn = layers.rain;
  const weatherMap = useStore(appStore, (s) => s.weatherMap);
  const focus = useStore(appStore, (s) => s.focus);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [distance, setDistance] = useState<{ km: number; points: number } | null>(null);
  const measureRef = useRef<{ layer: L.LayerGroup; points: L.LatLng[] } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.TileLayer | null>(null);
  const weatherRef = useRef<L.TileLayer | null>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // Create the map once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = L.map(el, {
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: RADAR_MAX_NATIVE_ZOOM,
      zoomControl: true,
      attributionControl: true,
    }).setView([20, 0], 2);
    baseRef.current = L.tileLayer(BASEMAP[themeRef.current], {
      attribution: BASEMAP_ATTRIBUTION,
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      baseRef.current = null;
      weatherRef.current = null;
    };
  }, []);

  // Region jump: move the flat map when a region is picked (the globe handles its own focus).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    const zoom = focus.alt > 2 ? 2 : focus.alt > 1.6 ? 3 : 4;
    map.setView([focus.lat, focus.lng], zoom, { animate: true });
  }, [focus]);

  // Measure distance: click points on the map; the line length is the great-circle distance.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !measuring) return;
    const layer = L.layerGroup().addTo(map);
    const state = { layer, points: [] as L.LatLng[] };
    measureRef.current = state;
    const draw = () => {
      layer.clearLayers();
      state.points.forEach((p) => L.circleMarker(p, { radius: 4, color: '#fbbf24', weight: 2, fillColor: '#fbbf24', fillOpacity: 1 }).addTo(layer));
      if (state.points.length > 1) L.polyline(state.points, { color: '#fbbf24', weight: 2, dashArray: '6 6' }).addTo(layer);
      let total = 0;
      for (let i = 1; i < state.points.length; i++) total += state.points[i - 1].distanceTo(state.points[i]);
      setDistance({ km: total / 1000, points: state.points.length });
    };
    const onClick = (e: L.LeafletMouseEvent) => {
      state.points.push(e.latlng);
      draw();
    };
    map.on('click', onClick);
    map.getContainer().style.cursor = 'crosshair';
    return () => {
      map.off('click', onClick);
      map.getContainer().style.cursor = '';
      layer.remove();
      measureRef.current = null;
    };
  }, [measuring]);

  const clearMeasure = () => {
    const state = measureRef.current;
    if (state) {
      state.points = [];
      state.layer.clearLayers();
    }
    setDistance(null);
  };

  // Swap the basemap when the theme changes.
  useEffect(() => {
    baseRef.current?.setUrl(BASEMAP[theme]);
  }, [theme]);

  // Weather map overlay.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    weatherRef.current?.remove();
    weatherRef.current = null;
    if (weatherMap === 'off') return;
    const layer = L.tileLayer(`/api/weather/tile?layer=${weatherMap}&z={z}&x={x}&y={y}`, {
      attribution: 'Weather: © OpenWeather',
      maxNativeZoom: WEATHER_MAX_NATIVE_ZOOM,
      maxZoom: RADAR_MAX_NATIVE_ZOOM,
      opacity: theme === 'dark' ? 0.55 : 0.7,
      zIndex: 300,
    });
    layer.addTo(map);
    weatherRef.current = layer;
    // Only re-run for the layer and the map, not the theme: opacity is set below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherMap]);

  useEffect(() => {
    weatherRef.current?.setOpacity(theme === 'dark' ? 0.55 : 0.7);
  }, [theme]);

  // Aircraft, ships, earthquakes and cameras, drawn on a canvas so a thousand points stay smooth.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    overlayRef.current = group;
    return () => {
      group.remove();
      overlayRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = overlayRef.current;
    if (!group) return;
    group.clearLayers();
    const renderer = L.canvas({ padding: 0.5 });
    const tipOpts: L.TooltipOptions = { sticky: true, direction: 'top', className: 'map2d-tip', opacity: 1 };

    if (layers.aircraft && flights) {
      for (const a of flights.aircraft) {
        const m = L.circleMarker([a.lat, a.lon], { renderer, radius: 2.5, color: '#38bdf8', weight: 0, fillOpacity: 0.9, interactive: true });
        m.bindTooltip(`<b>${escapeHtml(a.call || 'Aircraft')}</b><br>${escapeHtml(a.country)}${a.alt !== null ? ` · ${Math.round(a.alt * 3.281)} ft` : ''}`, tipOpts);
        m.addTo(group);
      }
    }
    if (layers.ships) {
      for (const s of ships) {
        const m = L.circleMarker([s.lat, s.lng], { renderer, radius: 3, color: '#34d399', weight: 0, fillOpacity: 0.95 });
        m.bindTooltip(`<b>${escapeHtml(s.name)}</b><br>MMSI ${escapeHtml(s.mmsi)}${s.sog !== null ? ` · ${s.sog.toFixed(1)} kn` : ''}`, tipOpts);
        m.addTo(group);
      }
    }
    if (layers.disasters && disasters) {
      for (const q of disasters.quakes) {
        const m = L.circleMarker([q.lat, q.lon], {
          renderer,
          radius: Math.max(3, q.mag * 1.6),
          color: '#f97316',
          weight: 1.5,
          fillOpacity: 0.25,
        });
        m.bindTooltip(`<b>M ${q.mag.toFixed(1)}</b> ${escapeHtml(q.place)}`, tipOpts);
        m.addTo(group);
      }
    }
    if (layers.waterways) {
      for (const c of CHOKEPOINTS) {
        const m = L.circleMarker([c.lat, c.lng], { renderer, radius: 6, color: '#fbbf24', weight: 2, fillColor: '#fbbf24', fillOpacity: 0.2 });
        m.bindTooltip(`<b>${escapeHtml(c.name)}</b><br>${escapeHtml(c.note)}`, tipOpts);
        m.addTo(group);
      }
    }
    if (layers.cameras) {
      for (const c of cameras) {
        if (c.lat === null || c.lon === null) continue;
        const m = L.circleMarker([c.lat, c.lon], { renderer, radius: 5, color: '#f472b6', weight: 2, fillColor: '#f472b6', fillOpacity: 0.5 });
        m.bindTooltip(`<b>📷 ${escapeHtml(c.title)}</b><br>${escapeHtml(c.city ?? '')} · click to watch`, tipOpts);
        m.on('click', () => openCamera(c.id));
        m.addTo(group);
      }
    }
  }, [flights, disasters, ships, cameras, layers.aircraft, layers.ships, layers.disasters, layers.cameras, layers.waterways]);

  // Rain radar: animated frames, refreshed every minute.
  useEffect(() => {
    const map = mapRef.current;
    const clock = clockRef.current;
    if (!map || !rainOn) {
      if (clock) clock.textContent = '';
      return;
    }
    let cancelled = false;
    let refreshTimer: number | undefined;
    let playTimer: number | undefined;
    let frames: { frame: Frame; layer: L.TileLayer }[] = [];
    let pos = -1;
    let hold = 0;

    const showClock = (f: Frame) => {
      if (!clock) return;
      const time = new Date(f.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (f.forecast) {
        clock.textContent = `Rain forecast ${time}`;
        return;
      }
      const ageMin = Math.max(0, Math.round((Date.now() / 1000 - f.time) / 60));
      clock.textContent = `Rain radar ${time} · ${ageMin < 1 ? 'just now' : `${ageMin} min ago`}`;
    };

    const show = (index: number) => {
      frames.forEach((item, i) => item.layer.setOpacity(i === index ? RADAR_OPACITY : 0));
      const current = frames[index];
      if (current) showClock(current.frame);
    };

    const step = () => {
      if (frames.length === 0) return;
      if (hold > 0) {
        hold--;
        return;
      }
      pos = (pos + 1) % frames.length;
      show(pos);
      if (pos === frames.length - 1) hold = HOLD_CYCLES;
    };

    const startPlay = () => {
      if (playTimer === undefined && !document.hidden) playTimer = window.setInterval(step, FRAME_MS);
    };
    const stopPlay = () => {
      if (playTimer !== undefined) window.clearInterval(playTimer);
      playTimer = undefined;
    };
    const onVisibility = () => (document.hidden ? stopPlay() : startPlay());
    document.addEventListener('visibilitychange', onVisibility);

    const sync = async () => {
      try {
        const list = await fetchFrames();
        if (cancelled) return;
        const known = new Map(frames.map((item) => [item.frame.path, item]));
        const next = list.map((f) => {
          const existing = known.get(f.path);
          if (existing) return existing;
          const layer = L.tileLayer(frameUrl(f.path), {
            opacity: 0,
            maxNativeZoom: RADAR_MAX_NATIVE_ZOOM,
            maxZoom: RADAR_MAX_NATIVE_ZOOM,
            zIndex: 200,
            attribution: 'Radar: RainViewer.com',
          });
          layer.addTo(map);
          return { frame: f, layer };
        });
        for (const item of frames) {
          if (!next.includes(item)) item.layer.remove();
        }
        frames = next;
        if (pos < 0 || pos >= frames.length) pos = frames.length - 1;
        startPlay();
      } catch {
        // Keep the frames we have.
      }
      if (!cancelled) refreshTimer = window.setTimeout(sync, REFRESH_MS);
    };
    sync();

    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimer);
      stopPlay();
      document.removeEventListener('visibilitychange', onVisibility);
      for (const item of frames) item.layer.remove();
      frames = [];
      if (clock) clock.textContent = '';
    };
  }, [rainOn]);

  return (
    <div className={`map2d ${theme === 'light' ? 'is-light' : ''}`}>
      <div ref={containerRef} className="map2d-canvas" role="region" aria-label="Flat 2D radar map" />
      <div className="measure-bar">
        <button className={`btn btn-glass btn-sm ${measuring ? 'is-on' : ''}`} aria-pressed={measuring} onClick={() => setMeasuring((m) => !m)}>
          {measuring ? 'Stop measuring' : 'Measure distance'}
        </button>
        {measuring && (
          <span className="small measure-read" aria-live="polite">
            {distance && distance.points > 1
              ? `${distance.km.toFixed(1)} km · ${(distance.km * 0.621371).toFixed(1)} mi`
              : 'Click two or more points on the map'}
          </span>
        )}
        {distance && (
          <button className="btn btn-ghost btn-sm" onClick={clearMeasure}>
            Clear
          </button>
        )}
      </div>
      <div ref={clockRef} className="radar-clock" hidden={!rainOn} aria-live="off" />
      <div className="radar-clock weather-clock" hidden={weatherMap === 'off'} aria-live="off">
        {weatherMap === 'off' ? '' : `${WEATHER_NAMES[weatherMap] ?? ''} · OpenWeather`}
      </div>
    </div>
  );
}
