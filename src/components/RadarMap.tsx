import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { appStore } from '../lib/appState';
import { useStore } from '../lib/store';

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

export function RadarMap() {
  const theme = useStore(appStore, (s) => s.theme);
  const rainOn = useStore(appStore, (s) => s.layers.rain);
  const weatherMap = useStore(appStore, (s) => s.weatherMap);

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
      <div ref={clockRef} className="radar-clock" hidden={!rainOn} aria-live="off" />
      <div className="radar-clock weather-clock" hidden={weatherMap === 'off'} aria-live="off">
        {weatherMap === 'off' ? '' : `${WEATHER_NAMES[weatherMap] ?? ''} · OpenWeather`}
      </div>
    </div>
  );
}
