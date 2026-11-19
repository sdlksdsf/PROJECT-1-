import { memo, useEffect, useMemo, useRef } from 'react';
import Globe, { type GlobeInstance } from 'globe.gl';
import * as THREE from 'three';
import { appStore, openCamera, selectCountry, type Theme, type WeatherMap } from '../lib/appState';
import { useStore } from '../lib/store';
import { escapeHtml, timeAgo } from '../lib/format';
import { CONFLICTS } from '../data/conflicts';
import type { Camera, DisastersResponse, FlightsResponse } from '../../shared/types';
import type { ShipPoint } from '../lib/ships';

export interface CountryFeature {
  type: 'Feature';
  bbox?: number[];
  properties: { ADM0_A3: string; NAME: string; [key: string]: unknown };
  geometry: unknown;
}

interface GPoint {
  id: string;
  kind: 'quake' | 'event' | 'aircraft' | 'ship' | 'camera';
  lat: number;
  lng: number;
  alt: number;
  r: number;
  color: string;
  label: string;
}

interface GRing {
  lat: number;
  lng: number;
  color: string;
  maxR: number;
  speed: number;
  period: number;
}

interface GArc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
}

interface RadarSlot {
  path: string;
  time: number; // unix seconds
  forecast: boolean;
  tex: THREE.CanvasTexture | null;
}

interface GLabel {
  lat: number;
  lng: number;
  text: string;
  color: string;
}

export interface GlobeViewProps {
  features: CountryFeature[];
  disasters: DisastersResponse | null;
  flights: FlightsResponse | null;
  ships: ShipPoint[];
  cameras: Camera[];
  sidebarOpen: boolean;
  drawerOpen: boolean;
}

const EVENT_COLORS: Record<string, string> = {
  Wildfires: '#ef4444',
  Volcanoes: '#f97316',
  'Severe Storms': '#60a5fa',
  Floods: '#3b82f6',
  Drought: '#d97706',
  Landslides: '#a16207',
  'Dust and Haze': '#a8a29e',
};

// Markers sit almost on the surface, so they read as flat dots instead of 3D columns.
const FLAT = 0.002;
// Radius of the globe in globe.gl units.
const GLOBE_R = 100;

const CENTROID_CACHE = new Map<string, { lat: number; lng: number }>();

function centroidOf(f: CountryFeature): { lat: number; lng: number } | null {
  const cached = CENTROID_CACHE.get(f.properties.ADM0_A3);
  if (cached) return cached;
  const b = f.bbox;
  if (!b || b.length < 4) return null;
  const width = b[2] - b[0];
  const c = {
    lat: (b[1] + b[3]) / 2,
    // Boxes crossing the antimeridian (e.g. Russia) would average to 0°; fall back to the box's east edge.
    lng: width > 180 ? b[2] - 30 : (b[0] + b[2]) / 2,
  };
  CENTROID_CACHE.set(f.properties.ADM0_A3, c);
  return c;
}

/** Great-circle-ish projection of a heading vector: where an aircraft will be in `seconds`. */
function projectHeading(lat: number, lng: number, speedMs: number, headingDeg: number, seconds: number) {
  const d = speedMs * seconds;
  const h = (headingDeg * Math.PI) / 180;
  const dLat = (d * Math.cos(h)) / 111320;
  const dLng = (d * Math.sin(h)) / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return { lat: Math.max(-85, Math.min(85, lat + dLat)), lng: ((lng + dLng + 540) % 360) - 180 };
}

function aircraftColor(alt: number | null): string {
  if (alt === null) return '#94a3b8';
  if (alt < 3000) return '#38bdf8';
  if (alt < 9000) return '#22d3ee';
  return '#a78bfa';
}

function quakeColor(mag: number): string {
  if (mag >= 6) return '#ef4444';
  if (mag >= 5) return '#f97316';
  if (mag >= 4) return '#f59e0b';
  return '#facc15';
}

const THEME = {
  dark: {
    globe: '/textures/earth-dark.jpg',
    background: '/textures/night-sky.png',
    atmosphere: '#38bdf8',
    cap: 'rgba(148,163,184,0.10)',
    capConflict: 'rgba(239,68,68,0.30)',
    capHover: 'rgba(56,189,248,0.38)',
    capSelected: 'rgba(45,212,191,0.50)',
    stroke: 'rgba(148,163,184,0.30)',
  },
  light: {
    globe: '/textures/earth-blue-marble.jpg',
    background: null,
    atmosphere: '#7dd3fc',
    cap: 'rgba(15,23,42,0.06)',
    capConflict: 'rgba(220,38,38,0.22)',
    capHover: 'rgba(2,132,199,0.26)',
    capSelected: 'rgba(13,148,136,0.42)',
    stroke: 'rgba(30,41,59,0.30)',
  },
} as const;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return (await res.json()) as T;
}

function loadTile(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('tile failed'));
    img.src = url;
  });
}


const RADAR_W = 1024;
const RADAR_H = 512;
let radarGridCache: { W: number; H: number; rowToSrc: Int32Array; colToSrc: Int32Array } | null = null;

/** Lookup tables from output pixels to source pixels, computed once (the Mercator maths is the costly part). */
function radarGrid() {
  if (radarGridCache) return radarGridCache;
  const W = RADAR_W;
  const H = RADAR_H;
  const rowToSrc = new Int32Array(H);
  const colToSrc = new Int32Array(W);
  const MERC_LIMIT = 85.0511;
  for (let row = 0; row < H; row++) {
    const lat = 90 - ((row + 0.5) / H) * 180;
    if (Math.abs(lat) > MERC_LIMIT) {
      rowToSrc[row] = -1;
      continue;
    }
    const rad = (lat * Math.PI) / 180;
    const my = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 1024;
    rowToSrc[row] = Math.min(1023, Math.max(0, Math.floor(my)));
  }
  for (let col = 0; col < W; col++) {
    const lng = ((col + 0.5) / W) * 360 - 180;
    colToSrc[col] = Math.min(1023, Math.max(0, Math.floor(((lng + 180) / 360) * 1024)));
  }
  radarGridCache = { W, H, rowToSrc, colToSrc };
  return radarGridCache;
}

/**
 * Builds an equirectangular (longitude/latitude) image from 16 Web Mercator zoom-2 tiles
 * (RainViewer radar or OpenWeather maps), re-sampled onto the globe's grid.
 */
async function stitchTiles(tileUrl: (x: number, y: number) => string): Promise<HTMLCanvasElement> {
  const world = document.createElement('canvas');
  world.width = 1024;
  world.height = 1024;
  const wctx = world.getContext('2d');
  if (!wctx) throw new Error('no canvas');
  const jobs: Promise<void>[] = [];
  for (let x = 0; x < 4; x++) {
    for (let y = 0; y < 4; y++) {
      jobs.push(loadTile(tileUrl(x, y)).then((img) => wctx.drawImage(img, x * 256, y * 256)));
    }
  }
  await Promise.all(jobs);
  const src = wctx.getImageData(0, 0, 1024, 1024).data;
  const { W, H, rowToSrc, colToSrc } = radarGrid();
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('no canvas');
  const img = octx.createImageData(W, H);
  // Copy whole pixels (4 bytes) at a time; the lookup tables were computed once.
  const src32 = new Uint32Array(src.buffer);
  const dst32 = new Uint32Array(img.data.buffer);
  for (let row = 0; row < H; row++) {
    const sy = rowToSrc[row];
    const dRow = row * W;
    if (sy < 0) continue; // poles have no radar coverage: leave transparent
    const sRow = sy * 1024;
    for (let col = 0; col < W; col++) dst32[dRow + col] = src32[sRow + colToSrc[col]];
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function stitchRadar(path: string): Promise<HTMLCanvasElement> {
  return stitchTiles((x, y) => `/api/radar/tile?p=${encodeURIComponent(path)}&x=${x}&y=${y}`);
}

const WEATHER_NAMES: Record<Exclude<WeatherMap, 'off'>, string> = {
  temp: 'Temperature',
  wind: 'Wind speed',
  clouds: 'Clouds',
  precip: 'Precipitation & snow',
};

// Overlay opacity per theme: the dark globe needs stronger colours, the light globe needs more contrast.
const OVERLAY_OPACITY: Record<'rain' | 'weather', Record<Theme, number>> = {
  rain: { dark: 0.6, light: 0.85 },
  weather: { dark: 0.5, light: 0.7 },
};

function GlobeViewInner({ features, disasters, flights, ships, cameras, sidebarOpen, drawerOpen }: GlobeViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const featuresRef = useRef<CountryFeature[]>(features);
  const hoveredRef = useRef<string | null>(null);
  const radarClockRef = useRef<HTMLDivElement>(null);
  const weatherLabelRef = useRef<HTMLDivElement>(null);
  // Materials of the rain and weather overlays, so a theme change can restyle them without a reload.
  const overlayMaterialsRef = useRef(new Map<THREE.MeshBasicMaterial, 'rain' | 'weather'>());

  const theme = useStore(appStore, (s) => s.theme);
  const layers = useStore(appStore, (s) => s.layers);
  const country = useStore(appStore, (s) => s.country);
  const focus = useStore(appStore, (s) => s.focus);

  const themeRef = useRef(theme);
  const countryRef = useRef(country);
  const conflictSetRef = useRef<Set<string>>(new Set());
  themeRef.current = theme;
  countryRef.current = country;
  conflictSetRef.current = layers.conflicts ? new Set(CONFLICTS.flatMap((c) => c.countries)) : new Set();

  // Keep the rendered globe centred in the visible area when side panels open or close.
  const offsetRef = useRef<[number, number]>([0, 0]);

  /** Re-apply polygon colours (hover, selection, conflicts, theme). */
  const paintPolygons = () => {
    const g = globeRef.current;
    if (!g) return;
    const t = THEME[themeRef.current];
    const sel = countryRef.current;
    const hov = hoveredRef.current;
    const conflicts = conflictSetRef.current;
    g.polygonCapColor((f: object) => {
      const iso = (f as CountryFeature).properties.ADM0_A3;
      if (iso === sel) return t.capSelected;
      if (iso === hov) return t.capHover;
      if (conflicts.has(iso)) return t.capConflict;
      return t.cap;
    });
    g.polygonAltitude((f: object) => {
      const iso = (f as CountryFeature).properties.ADM0_A3;
      return iso === hov || iso === sel ? 0.018 : 0.006;
    });
  };

  // ---- one-time creation -------------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const g = new Globe(el, { animateIn: true })
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true)
      .atmosphereAltitude(0.18)
      .polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonsTransitionDuration(220)
      .polygonLabel((f: object) => {
        const feat = f as CountryFeature;
        return `<div class="globe-tip"><b>${escapeHtml(feat.properties.NAME)}</b><span>Click for country statistics</span></div>`;
      })
      .onPolygonHover((f: object | null) => {
        const iso = f ? (f as CountryFeature).properties.ADM0_A3 : null;
        if (iso === hoveredRef.current) return;
        hoveredRef.current = iso;
        paintPolygons();
        el.style.cursor = f ? 'pointer' : '';
      })
      .onPolygonClick((f: object, _ev: MouseEvent) => {
        const feat = f as CountryFeature;
        selectCountry(feat.properties.ADM0_A3);
      })
      .pointsData([])
      .pointLat('lat')
      .pointLng('lng')
      .pointAltitude('alt')
      .pointRadius('r')
      .pointColor('color')
      .pointLabel('label')
      .onPointClick((p: object) => {
        const pt = p as GPoint;
        if (pt.kind === 'camera') openCamera(pt.id.slice(2));
      })
      .pointsTransitionDuration(300)
      .arcsData([])
      .arcStartLat('startLat')
      .arcStartLng('startLng')
      .arcEndLat('endLat')
      .arcEndLng('endLng')
      .arcColor((a: object) => (a as GArc).color)
      .arcAltitude(0.004)
      .arcStroke(0.25)
      .arcDashLength(0.35)
      .arcDashGap(0.25)
      .arcDashInitialGap(() => Math.random())
      .arcDashAnimateTime(2600)
      .arcsTransitionDuration(0)
      .ringsData([])
      .ringLat('lat')
      .ringLng('lng')
      .ringColor((r: object) => (rr: number) => {
        const c = (r as GRing).color;
        const alpha = Math.max(0, 1 - rr);
        return c + Math.round(alpha * 255).toString(16).padStart(2, '0');
      })
      .ringMaxRadius('maxR')
      .ringPropagationSpeed('speed')
      .ringRepeatPeriod('period')
      .labelsData([])
      .labelLat('lat')
      .labelLng('lng')
      .labelText('text')
      .labelColor('color')
      .labelSize(0.55)
      .labelDotRadius(0.28)
      .labelAltitude(0.012)
      .labelResolution(2)
      .labelIncludeDot(true);

    // Dark/light textures and atmosphere. Painted again in the theme effect.
    g.globeImageUrl(THEME.dark.globe).bumpImageUrl('/textures/earth-topology.png');
    g.polygonStrokeColor(() => THEME.dark.stroke);

    const controls = g.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 118;
    controls.maxDistance = 520;

    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    g.pointOfView({ lat: 22, lng: 20, altitude: window.innerWidth < 800 ? 3.1 : 2.35 }, 0);
    g.width(el.clientWidth).height(el.clientHeight);

    // Pause auto-rotation while the user drags; resume after a short idle period.
    let resumeTimer: number | undefined;
    const onStart = () => {
      controls.autoRotate = false;
      window.clearTimeout(resumeTimer);
    };
    const onEnd = () => {
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        controls.autoRotate = appStore.get().layers.autorotate;
      }, 5000);
    };
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);

    const ro = new ResizeObserver(() => {
      g.width(el.clientWidth).height(el.clientHeight);
    });
    ro.observe(el);

    globeRef.current = g;

    return () => {
      window.clearTimeout(resumeTimer);
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      ro.disconnect();
      g._destructor();
      globeRef.current = null;
      el.innerHTML = '';
    };
    // paintPolygons reads refs only; intentionally created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- country polygons (loaded once by App) ----------------------------
  useEffect(() => {
    featuresRef.current = features;
    const g = globeRef.current;
    if (!g || features.length === 0) return;
    g.polygonsData(features);
    paintPolygons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features]);

  // ---- theme ------------------------------------------------------------
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const t = THEME[theme];
    g.globeImageUrl(t.globe)
      .atmosphereColor(t.atmosphere)
      .polygonStrokeColor(() => t.stroke)
      .backgroundImageUrl(t.background);
    paintPolygons();
    for (const [material, kind] of overlayMaterialsRef.current) material.opacity = OVERLAY_OPACITY[kind][theme];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // ---- rain radar: last 2 hours animated, forecast frames after, refreshed every minute ----
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !layers.rain) return;
    const scene = g.scene();
    const clock = radarClockRef.current;
    let mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | null = null;
    let cancelled = false;
    let refreshTimer: number | undefined;
    let playTimer: number | undefined;
    let slots: RadarSlot[] = [];
    let pos = -1;
    let hold = 0;

    const ensureMesh = () => {
      if (mesh) return mesh;
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: OVERLAY_OPACITY.rain[appStore.get().theme],
        depthWrite: false,
      });
      mesh = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 1.004, 128, 64), material);
      mesh.renderOrder = 2;
      scene.add(mesh);
      overlayMaterialsRef.current.set(material, 'rain');
      return mesh;
    };

    const showClock = (slot: RadarSlot) => {
      if (!clock) return;
      const time = new Date(slot.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (slot.forecast) {
        clock.textContent = `Rain forecast ${time}`;
        return;
      }
      const ageMin = Math.max(0, Math.round((Date.now() / 1000 - slot.time) / 60));
      clock.textContent = `Rain radar ${time} · ${ageMin < 1 ? 'just now' : `${ageMin} min ago`}`;
    };

    const showSlot = (slot: RadarSlot) => {
      if (!slot.tex) return;
      const m = ensureMesh();
      m.material.map = slot.tex;
      m.material.needsUpdate = true;
      showClock(slot);
    };

    const ready = () => slots.filter((s) => s.tex !== null);

    // Play the ready frames in order; hold the newest one for about two seconds.
    const step = () => {
      const frames = ready();
      if (frames.length === 0) return;
      if (hold > 0) {
        hold--;
        return;
      }
      pos = (pos + 1) % frames.length;
      showSlot(frames[pos]);
      if (pos === frames.length - 1) hold = 4;
    };
    const startPlay = () => {
      if (playTimer === undefined && !document.hidden) playTimer = window.setInterval(step, 500);
    };
    const stopPlay = () => {
      if (playTimer !== undefined) window.clearInterval(playTimer);
      playTimer = undefined;
    };
    const onVisibility = () => (document.hidden ? stopPlay() : startPlay());
    document.addEventListener('visibilitychange', onVisibility);

    const sync = async () => {
      try {
        const list = await fetchJson<{ frames: { time: number; path: string; forecast: boolean }[] }>('/api/radar/frames');
        if (cancelled) return;
        const known = new Map(slots.map((s) => [s.path, s]));
        const next: RadarSlot[] = list.frames.map(
          (f) => known.get(f.path) ?? { path: f.path, time: f.time, forecast: f.forecast, tex: null },
        );
        for (const s of slots) {
          if (!next.includes(s)) s.tex?.dispose();
        }
        slots = next;
        // Load missing frames newest first, so the current picture appears first.
        for (let i = slots.length - 1; i >= 0 && !cancelled; i--) {
          const slot = slots[i];
          if (slot.tex) continue;
          try {
            const canvas = await stitchRadar(slot.path);
            if (cancelled || !slots.includes(slot)) continue;
            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            slot.tex = tex;
            if (i === slots.length - 1 && pos < 0) {
              pos = ready().length - 1;
              showSlot(slot);
            }
          } catch {
            // Skip a frame that fails; it is tried again at the next refresh.
          }
          // Let the browser paint between frames so the globe keeps moving.
          await new Promise((r) => window.setTimeout(r, 0));
        }
        startPlay();
      } catch {
        // Keep showing the frames we have.
      }
      if (!cancelled) refreshTimer = window.setTimeout(sync, 60e3);
    };
    sync();

    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimer);
      stopPlay();
      document.removeEventListener('visibilitychange', onVisibility);
      for (const s of slots) s.tex?.dispose();
      slots = [];
      if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        overlayMaterialsRef.current.delete(mesh.material);
        mesh.material.dispose();
        mesh = null;
      }
      if (clock) clock.textContent = '';
    };
  }, [layers.rain]);

  // ---- weather map: temperature, wind, clouds or precipitation/snow (OpenWeather, reloaded every 10 minutes) ----
  const weatherMap = useStore(appStore, (s) => s.weatherMap);
  useEffect(() => {
    const g = globeRef.current;
    const label = weatherLabelRef.current;
    if (!g || weatherMap === 'off') return;
    const scene = g.scene();
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: OVERLAY_OPACITY.weather[appStore.get().theme],
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 1.006, 128, 64), material);
    mesh.renderOrder = 3;
    scene.add(mesh);
    overlayMaterialsRef.current.set(material, 'weather');
    let tex: THREE.CanvasTexture | null = null;
    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      try {
        const canvas = await stitchTiles((x, y) => `/api/weather/tile?layer=${weatherMap}&x=${x}&y=${y}`);
        if (cancelled) return;
        const next = new THREE.CanvasTexture(canvas);
        next.colorSpace = THREE.SRGBColorSpace;
        const old = tex;
        tex = next;
        material.map = next;
        material.needsUpdate = true;
        old?.dispose();
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (label) label.textContent = `${WEATHER_NAMES[weatherMap]} · OpenWeather · loaded ${time}`;
      } catch {
        if (label && !tex) label.textContent = `${WEATHER_NAMES[weatherMap]} unavailable right now`;
      }
      if (!cancelled) timer = window.setTimeout(load, 10 * 60e3);
    };
    if (label) label.textContent = `${WEATHER_NAMES[weatherMap]} · loading…`;
    load();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      scene.remove(mesh);
      overlayMaterialsRef.current.delete(material);
      mesh.geometry.dispose();
      material.dispose();
      tex?.dispose();
      if (label) label.textContent = '';
    };
  }, [weatherMap]);

  // ---- selection, layers that colour polygons ---------------------------
  useEffect(() => {
    paintPolygons();
    const g = globeRef.current;
    if (!g || !country) return;
    const f = featuresRef.current.find((x) => x.properties.ADM0_A3 === country);
    const c = f ? centroidOf(f) : null;
    if (c) g.pointOfView({ lat: c.lat, lng: c.lng, altitude: 1.9 }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, layers.conflicts]);

  // ---- auto-rotation -----------------------------------------------------
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.controls().autoRotate = layers.autorotate && !country;
  }, [layers.autorotate, country]);

  // ---- explicit focus requests (from lists) ----------------------------
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !focus) return;
    g.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: focus.alt }, 1100);
  }, [focus]);

  // ---- smooth re-centring when side panels open/close -------------------
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const wide = window.innerWidth >= 1000;
    const target: [number, number] = wide
      ? [(sidebarOpen ? 190 : 0) - (drawerOpen ? 210 : 0), 0]
      : [0, 0];
    const from = offsetRef.current;
    const start = performance.now();
    const duration = 380;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      const x = from[0] + (target[0] - from[0]) * e;
      g.globeOffset([x, 0]);
      wrapRef.current?.style.setProperty('--gx', `${x.toFixed(1)}px`);
      if (p < 1) raf = requestAnimationFrame(step);
      else offsetRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [sidebarOpen, drawerOpen]);

  // ---- data layers ------------------------------------------------------
  const points = useMemo<GPoint[]>(() => {
    const out: GPoint[] = [];
    if (layers.disasters && disasters) {
      for (const q of disasters.quakes) {
        out.push({
          id: `q-${q.id}`,
          kind: 'quake',
          lat: q.lat,
          lng: q.lon,
          alt: FLAT,
          r: 0.22 + q.mag * 0.07,
          color: quakeColor(q.mag),
          label: `<div class="globe-tip"><b>M${q.mag.toFixed(1)} earthquake</b><span>${escapeHtml(q.place)}</span><span>${timeAgo(q.time)} · depth ${q.depth.toFixed(0)} km${q.tsunami ? ' · tsunami alert' : ''}</span></div>`,
        });
      }
      for (const e of disasters.events) {
        out.push({
          id: `e-${e.id}`,
          kind: 'event',
          lat: e.lat,
          lng: e.lon,
          alt: FLAT,
          r: 0.4,
          color: EVENT_COLORS[e.category] ?? '#f472b6',
          label: `<div class="globe-tip"><b>${escapeHtml(e.title)}</b><span>${escapeHtml(e.category)}</span></div>`,
        });
      }
    }
    if (layers.aircraft && flights) {
      for (const a of flights.aircraft) {
        out.push({
          id: `a-${a.id}`,
          kind: 'aircraft',
          lat: a.lat,
          lng: a.lon,
          alt: FLAT,
          r: 0.1,
          color: aircraftColor(a.alt),
          label: `<div class="globe-tip"><b>✈ ${escapeHtml(a.call)}</b><span>${escapeHtml(a.country)}</span><span>${a.alt ? Math.round(a.alt) + ' m' : 'altitude n/a'} · ${a.vel ? Math.round(a.vel * 3.6) + ' km/h' : 'speed n/a'}</span></div>`,
        });
      }
    }
    if (layers.ships) {
      for (const s of ships) {
        out.push({
          id: `s-${s.mmsi}`,
          kind: 'ship',
          lat: s.lat,
          lng: s.lng,
          alt: FLAT,
          r: 0.14,
          color: '#34d399',
          label: `<div class="globe-tip"><b>${escapeHtml(s.name)}</b><span>MMSI ${escapeHtml(s.mmsi)}${s.sog !== null ? ` · ${s.sog.toFixed(1)} kn` : ''}</span></div>`,
        });
      }
    }
    if (layers.cameras && cameras.length) {
      for (const c of cameras) {
        if (c.lat === null || c.lon === null) continue;
        out.push({
          id: `c-${c.id}`,
          kind: 'camera',
          lat: c.lat,
          lng: c.lon,
          alt: FLAT,
          r: 0.34,
          color: '#f472b6',
          label: `<div class="globe-tip"><b>📷 ${escapeHtml(c.title)}</b><span>${escapeHtml(c.city ?? '')}</span></div>`,
        });
      }
    }
    return out;
  }, [disasters, flights, ships, cameras, layers.disasters, layers.aircraft, layers.ships, layers.cameras]);

  useEffect(() => {
    globeRef.current?.pointsData(points);
  }, [points]);

  const arcs = useMemo<GArc[]>(() => {
    if (!layers.headings || !layers.aircraft || !flights) return [];
    const out: GArc[] = [];
    for (const a of flights.aircraft) {
      if (out.length >= 500) break;
      if (a.hdg === null || a.vel === null || a.vel < 20) continue;
      const end = projectHeading(a.lat, a.lon, a.vel, a.hdg, 300);
      out.push({ startLat: a.lat, startLng: a.lon, endLat: end.lat, endLng: end.lng, color: 'rgba(56,189,248,0.7)' });
    }
    return out;
  }, [flights, layers.headings, layers.aircraft]);

  useEffect(() => {
    globeRef.current?.arcsData(arcs);
  }, [arcs]);

  const rings = useMemo<GRing[]>(() => {
    const out: GRing[] = [];
    if (layers.conflicts) {
      for (const c of CONFLICTS) {
        out.push({ lat: c.lat, lng: c.lng, color: '#ef4444', maxR: 3.2, speed: 1.1, period: 1800 });
      }
    }
    if (layers.disasters && disasters) {
      for (const q of disasters.quakes) {
        if (q.mag >= 5 && out.length < 80) out.push({ lat: q.lat, lng: q.lon, color: '#f97316', maxR: 2.2, speed: 1.4, period: 2200 });
      }
      for (const e of disasters.events.slice(0, 30)) {
        if (out.length >= 80) break;
        out.push({ lat: e.lat, lng: e.lon, color: EVENT_COLORS[e.category] ?? '#f472b6', maxR: 1.6, speed: 0.9, period: 2600 });
      }
    }
    return out;
  }, [layers.conflicts, layers.disasters, disasters]);

  useEffect(() => {
    globeRef.current?.ringsData(rings);
  }, [rings]);

  const labels = useMemo<GLabel[]>(
    () =>
      layers.conflicts
        ? CONFLICTS.map((c) => ({ lat: c.lat, lng: c.lng, text: c.name, color: 'rgba(252,165,165,0.95)' }))
        : [],
    [layers.conflicts],
  );

  useEffect(() => {
    globeRef.current?.labelsData(labels);
  }, [labels]);

  return (
    <div className="globe-wrap" ref={wrapRef}>
      <div ref={containerRef} className="globe-canvas" aria-label="Interactive 3D globe. Click a country to open its statistics." role="application" />
      {layers.radar && <div className="radar-sweep" aria-hidden="true" />}
      <div ref={radarClockRef} className="radar-clock" hidden={!layers.rain} aria-live="off" />
      <div ref={weatherLabelRef} className="radar-clock weather-clock" hidden={weatherMap === 'off'} aria-live="off" />
    </div>
  );
}

export const GlobeView = memo(GlobeViewInner);

