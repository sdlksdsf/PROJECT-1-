import { createStore } from './store';
import type { LiveStream } from '../data/liveStreams';

export type LeftTab = 'news' | 'markets' | 'weather' | 'disasters' | 'traffic' | 'conflicts' | 'live';
export type DrawerTab = 'overview' | 'leaders' | 'news' | 'cameras' | 'weather';
export type Theme = 'dark' | 'light';
export type WeatherMap = 'off' | 'temp' | 'wind' | 'clouds' | 'precip';
export type MapMode = 'globe' | 'flat';
export type TimeRange = '1h' | '6h' | '24h' | '48h' | '7d' | 'all';
export const TIME_RANGES: { id: TimeRange; label: string; ms: number | null }[] = [
  { id: '1h', label: '1h', ms: 3600e3 },
  { id: '6h', label: '6h', ms: 6 * 3600e3 },
  { id: '24h', label: '24h', ms: 24 * 3600e3 },
  { id: '48h', label: '48h', ms: 48 * 3600e3 },
  { id: '7d', label: '7d', ms: 7 * 86400e3 },
  { id: 'all', label: 'All', ms: null },
];

export interface Layers {
  conflicts: boolean;
  disasters: boolean;
  aircraft: boolean;
  headings: boolean;
  ships: boolean;
  cameras: boolean;
  rain: boolean;
  radar: boolean;
  waterways: boolean;
  autorotate: boolean;
}

export interface Focus {
  lat: number;
  lng: number;
  alt: number;
  nonce: number;
}

export interface AppState {
  theme: Theme;
  leftTab: LeftTab;
  leftOpen: boolean;
  country: string | null; // ISO alpha-3
  drawerTab: DrawerTab;
  layers: Layers;
  weatherMap: WeatherMap;
  mapMode: MapMode;
  timeRange: TimeRange; // how far back the map's earthquakes and events go
  liveStreamId: string | null; // channel shown in the Live TV player
  customStreams: LiveStream[]; // channels the user added
  focus: Focus | null;
  camera: string | null; // id of the camera open in the viewer
  methodologyOpen: boolean;
  newsCategory: string;
  newsQuery: string;
  saved: string[];
  watchlist: string[];
}

const LAYERS_KEY = 'us.layers';
const THEME_KEY = 'us.theme';
const SAVED_KEY = 'us.saved';
const WATCH_KEY = 'us.watchlist';
const CUSTOM_STREAMS_KEY = 'us.liveCustom';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const defaultLayers: Layers = {
  conflicts: true,
  disasters: true,
  aircraft: true,
  headings: false,
  ships: false,
  cameras: true,
  rain: true,
  radar: false,
  waterways: false,
  autorotate: true,
};

function initialTheme(): Theme {
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

const params = new URLSearchParams(window.location.search);
const urlCountry = params.get('c')?.toUpperCase() ?? null;
const urlTab = params.get('tab') as LeftTab | null;

export const appStore = createStore<AppState>({
  theme: initialTheme(),
  leftTab: urlTab && ['news', 'markets', 'weather', 'disasters', 'traffic', 'conflicts', 'live'].includes(urlTab) ? urlTab : 'news',
  leftOpen: true,
  country: urlCountry && /^[A-Z]{3}$/.test(urlCountry) ? urlCountry : null,
  drawerTab: 'overview',
  layers: { ...defaultLayers, ...readJson<Partial<Layers>>(LAYERS_KEY, {}) },
  weatherMap: 'off',
  mapMode: 'globe',
  timeRange: '7d',
  liveStreamId: null,
  customStreams: readJson<LiveStream[]>(CUSTOM_STREAMS_KEY, []),
  focus: null,
  camera: null,
  methodologyOpen: false,
  newsCategory: 'all',
  newsQuery: '',
  saved: readJson<string[]>(SAVED_KEY, []),
  watchlist: readJson<string[]>(WATCH_KEY, []),
});

// Persist the small amount of user preference state.
appStore.subscribe(() => {
  const s = appStore.get();
  try {
    window.localStorage.setItem(THEME_KEY, s.theme);
    window.localStorage.setItem(LAYERS_KEY, JSON.stringify(s.layers));
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(s.saved));
    window.localStorage.setItem(WATCH_KEY, JSON.stringify(s.watchlist));
  } catch {
    // storage may be blocked (private mode); the app still works
  }
});

/** Keep the URL shareable (?c=PAK&tab=news) without adding history entries. */
let lastUrl = '';
appStore.subscribe(() => {
  const s = appStore.get();
  const p = new URLSearchParams();
  if (s.country) p.set('c', s.country);
  if (s.leftTab !== 'news') p.set('tab', s.leftTab);
  const qs = p.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  if (next !== lastUrl) {
    lastUrl = next;
    window.history.replaceState(null, '', next);
  }
});

export function toggleSaved(id: string): void {
  appStore.set((s) => ({ saved: s.saved.includes(id) ? s.saved.filter((x) => x !== id) : [...s.saved, id] }));
}

export function selectCountry(iso3: string | null): void {
  appStore.set({ country: iso3, drawerTab: 'overview' });
}

export function openCamera(id: string | null): void {
  appStore.set({ camera: id });
}

/** Plays a live TV channel in the Live TV tab. */
export function openLiveStream(id: string): void {
  appStore.set({ liveStreamId: id, leftTab: 'live', leftOpen: true });
}

export function addCustomStream(stream: LiveStream): void {
  const list = appStore.get().customStreams.filter((s) => s.channelId !== stream.channelId);
  const next = [stream, ...list].slice(0, 20);
  try {
    window.localStorage.setItem(CUSTOM_STREAMS_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the channel still works for this visit.
  }
  appStore.set({ customStreams: next });
}

export function removeCustomStream(channelId: string): void {
  const next = appStore.get().customStreams.filter((s) => s.channelId !== channelId);
  try {
    window.localStorage.setItem(CUSTOM_STREAMS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  appStore.set({ customStreams: next });
}

export function requestFocus(lat: number, lng: number, alt = 1.4): void {
  appStore.set({ focus: { lat, lng, alt, nonce: Date.now() } });
}
