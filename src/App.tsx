import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { CamerasResponse, CountryResponse, DisastersResponse, FlightsResponse, NewsResponse } from '../shared/types';
import { appStore, openCamera, requestFocus, selectCountry, TIME_RANGES, type Layers, type LeftTab, type MapMode, type Theme, type TimeRange, type WeatherMap } from './lib/appState';
import { RadarMap } from './components/RadarMap';
import { useStore } from './lib/store';
import { useResource } from './lib/useResource';
import { useShips } from './lib/ships';
import { GlobeView, type CountryFeature } from './components/GlobeView';
import { NewsPanel, TickerBar, NEWS_REFRESH_MS } from './components/NewsPanel';
import { MarketsPanel } from './components/MarketsPanel';
import { WeatherPanel } from './components/WeatherPanel';
import { DisastersPanel } from './components/DisastersPanel';
import { TrafficPanel } from './components/TrafficPanel';
import { ConflictsPanel } from './components/ConflictsPanel';
import { CountryDrawer } from './components/CountryDrawer';
import { MethodologyModal } from './components/MethodologyModal';
import { CameraViewer } from './components/CameraViewer';
import { LivePanel } from './components/LivePanel';

const LEFT_TABS: { id: LeftTab; label: string }[] = [
  { id: 'news', label: 'News' },
  { id: 'markets', label: 'Markets' },
  { id: 'weather', label: 'Weather' },
  { id: 'disasters', label: 'Disasters' },
  { id: 'traffic', label: 'Traffic' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'live', label: 'Live TV' },
];

const LAYER_TOGGLES: { key: keyof Layers; label: string }[] = [
  { key: 'conflicts', label: 'Conflict zones' },
  { key: 'disasters', label: 'Earthquakes & events' },
  { key: 'aircraft', label: 'Aircraft' },
  { key: 'headings', label: 'Heading vectors' },
  { key: 'ships', label: 'Ships (AIS)' },
  { key: 'cameras', label: 'Cameras' },
  { key: 'rain', label: 'Rain radar' },
  { key: 'radar', label: 'Radar sweep (animation)' },
  { key: 'autorotate', label: 'Auto-rotate' },
];

function useCountryFeatures(): CountryFeature[] {
  const [features, setFeatures] = useState<CountryFeature[]>([]);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/data/countries.geojson', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((geo: { features: CountryFeature[] }) => setFeatures(geo.features))
      .catch(() => {
        /* the globe still works without polygons; search will be empty */
      });
    return () => ctrl.abort();
  }, []);
  return features;
}

function CountrySearch({ features }: { features: CountryFeature[] }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return features
      .filter((f) => f.properties.NAME.toLowerCase().includes(term))
      .sort((a, b) => {
        const aStarts = a.properties.NAME.toLowerCase().startsWith(term) ? 0 : 1;
        const bStarts = b.properties.NAME.toLowerCase().startsWith(term) ? 0 : 1;
        return aStarts - bStarts || a.properties.NAME.localeCompare(b.properties.NAME);
      })
      .slice(0, 8);
  }, [q, features]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === '/' && !isTyping(e.target)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (iso3: string) => {
    selectCountry(iso3);
    setQ('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && matches[0]) pick(matches[0].properties.ADM0_A3);
    if (e.key === 'Escape') {
      setQ('');
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="search">
      <input
        ref={inputRef}
        type="search"
        className="search-input"
        placeholder="Search a country  ( / )"
        aria-label="Search a country"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {open && matches.length > 0 && (
        <ul className="search-results" role="listbox">
          {matches.map((f) => (
            <li key={f.properties.ADM0_A3} role="option" aria-selected={false}>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(f.properties.ADM0_A3);
                }}
              >
                {f.properties.NAME}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

const WEATHER_MAP_OPTIONS: { value: WeatherMap; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'temp', label: 'Temperature' },
  { value: 'wind', label: 'Wind speed' },
  { value: 'clouds', label: 'Clouds' },
  { value: 'precip', label: 'Precipitation & snow' },
];

/** Earthquakes and events within the chosen time range (the rest of the data is untouched). */
function filterDisasters(data: DisastersResponse | null, range: TimeRange): DisastersResponse | null {
  if (!data) return null;
  const ms = TIME_RANGES.find((r) => r.id === range)?.ms ?? null;
  if (ms === null) return data;
  const cutoff = Date.now() - ms;
  return {
    ...data,
    quakes: data.quakes.filter((q) => Date.parse(q.time) >= cutoff),
    events: data.events.filter((e) => {
      const t = Date.parse(e.date);
      return Number.isNaN(t) || t >= cutoff;
    }),
  };
}

const REGION_VIEWS: { id: string; label: string; lat: number; lng: number; alt: number }[] = [
  { id: 'global', label: 'Global', lat: 20, lng: 0, alt: 2.2 },
  { id: 'americas', label: 'Americas', lat: 12, lng: -80, alt: 1.8 },
  { id: 'europe', label: 'Europe', lat: 50, lng: 12, alt: 1.2 },
  { id: 'mena', label: 'Middle East & N. Africa', lat: 27, lng: 30, alt: 1.4 },
  { id: 'africa', label: 'Africa', lat: 2, lng: 20, alt: 1.8 },
  { id: 'asia', label: 'Asia', lat: 30, lng: 100, alt: 1.8 },
  { id: 'oceania', label: 'Oceania', lat: -25, lng: 135, alt: 1.8 },
];

/** Time range and region jump for the map (top left of the map). */
function MapTools({ timeRange }: { timeRange: TimeRange }) {
  return (
    <div className="map-tools">
      <div className="time-range" role="group" aria-label="Time range for earthquakes and events">
        {TIME_RANGES.map((r) => (
          <button
            key={r.id}
            className={`chip ${timeRange === r.id ? 'chip-on' : ''}`}
            aria-pressed={timeRange === r.id}
            onClick={() => appStore.set({ timeRange: r.id })}
          >
            {r.label}
          </button>
        ))}
      </div>
      <select
        className="region-select"
        aria-label="Jump to region"
        defaultValue="global"
        onChange={(e) => {
          const v = REGION_VIEWS.find((r) => r.id === e.target.value);
          if (v) requestFocus(v.lat, v.lng, v.alt);
        }}
      >
        {REGION_VIEWS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function LayerDock() {
  const layers = useStore(appStore, (s) => s.layers);
  const weatherMap = useStore(appStore, (s) => s.weatherMap);
  const [open, setOpen] = useState(false);
  const set = (key: keyof Layers, value: boolean) => appStore.set((s) => ({ layers: { ...s.layers, [key]: value } }));
  return (
    <div className={`layer-dock ${open ? 'is-open' : ''}`}>
      <button className="btn btn-glass btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Layers
      </button>
      {open && (
        <ul className="layer-list">
          {LAYER_TOGGLES.map((t) => (
            <li key={t.key}>
              <label className="switch">
                <input type="checkbox" checked={layers[t.key]} onChange={(e) => set(t.key, e.target.checked)} />
                <span>{t.label}</span>
              </label>
            </li>
          ))}
          <li className="layer-select">
            <label>
              <span>Weather map</span>
              <select
                value={weatherMap}
                onChange={(e) => appStore.set({ weatherMap: e.target.value as WeatherMap })}
              >
                {WEATHER_MAP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </li>
        </ul>
      )}
    </div>
  );
}

export function App() {
  const theme = useStore(appStore, (s) => s.theme);
  const mapMode = useStore(appStore, (s) => s.mapMode);
  const timeRange = useStore(appStore, (s) => s.timeRange);
  const leftTab = useStore(appStore, (s) => s.leftTab);
  const leftOpen = useStore(appStore, (s) => s.leftOpen);
  const country = useStore(appStore, (s) => s.country);
  const layers = useStore(appStore, (s) => s.layers);
  const methodologyOpen = useStore(appStore, (s) => s.methodologyOpen);

  const features = useCountryFeatures();
  const news = useResource<NewsResponse>('/api/news', NEWS_REFRESH_MS);
  const flights = useResource<FlightsResponse>('/api/flights', 120_000);
  const disasters = useResource<DisastersResponse>('/api/disasters', 300_000);
  const mapDisasters = useMemo(() => filterDisasters(disasters.data, timeRange), [disasters.data, timeRange]);
  const ships = useShips(layers.ships);
  const profile = useResource<CountryResponse>(country ? `/api/country?iso3=${country}` : null);
  const cca2 = profile.data && profile.data.iso3 === country ? profile.data.cca2 : null;
  const cameras = useResource<CamerasResponse>(cca2 ? `/api/cameras?cca2=${cca2}` : null, 600_000);
  const worldCameras = useResource<CamerasResponse>(layers.cameras ? '/api/cameras/map' : null, 600_000);
  const camera = useStore(appStore, (s) => s.camera);

  // Only show the profile that belongs to the selected country.
  const currentProfile = profile.data && profile.data.iso3 === country ? profile.data : null;
  // Worldwide cameras plus the selected country's list, de-duplicated by id.
  const globeCameras = useMemo(() => {
    if (!layers.cameras) return [];
    const byId = new Map<string, CamerasResponse['cameras'][number]>();
    for (const c of [...(worldCameras.data?.cameras ?? []), ...(cameras.data?.cameras ?? [])]) {
      if (c.lat !== null && c.lon !== null && !byId.has(c.id)) byId.set(c.id, c);
    }
    return [...byId.values()];
  }, [layers.cameras, worldCameras.data, cameras.data]);

  // Theme on <html> so CSS variables switch everywhere, including the globe chrome.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme === 'dark' ? 'dark' : 'light');
  }, [theme]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const s = appStore.get();
      if (e.key === 'Escape') {
        if (s.camera) openCamera(null);
        else if (s.methodologyOpen) appStore.set({ methodologyOpen: false });
        else if (s.country) selectCountry(null);
      } else if (e.key === 'r' || e.key === 'R') {
        appStore.set((st) => ({ layers: { ...st.layers, radar: !st.layers.radar } }));
      } else if (e.key === 't' || e.key === 'T') {
        appStore.set((st) => ({ theme: (st.theme === 'dark' ? 'light' : 'dark') as Theme }));
      } else if (e.key === '[') {
        appStore.set((st) => ({ leftOpen: !st.leftOpen }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const breaking = useMemo(() => (news.data?.stories ?? []).filter((s) => s.breaking).slice(0, 12), [news.data]);

  return (
    <div className="app" data-left={leftOpen} data-drawer={Boolean(country)}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">UNBIASED STATS</span>
        </div>
        <CountrySearch features={features} />
        <div className="topbar-actions">
          <button
            className="btn btn-ghost btn-sm"
            aria-pressed={mapMode === 'flat'}
            onClick={() => appStore.set((s) => ({ mapMode: (s.mapMode === 'globe' ? 'flat' : 'globe') as MapMode }))}
            title="Switch between the 3D globe and a flat 2D radar map"
          >
            {mapMode === 'flat' ? '3D globe' : '2D map'}
          </button>
          <button className="btn btn-ghost btn-sm" aria-pressed={leftOpen} onClick={() => appStore.set((s) => ({ leftOpen: !s.leftOpen }))} title="Toggle panels ( [ )">
            Panels
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => appStore.set({ methodologyOpen: true })}>
            Method &amp; sources
          </button>
          <button
            className="icon-btn"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title="Toggle theme ( T )"
            onClick={() => appStore.set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' }))}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <TickerBar stories={breaking} />

      <aside className="left-panel" aria-label="Information panels" hidden={!leftOpen}>
        <nav className="tabs" role="tablist" aria-label="Panels">
          {LEFT_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={leftTab === t.id}
              className={`tab ${leftTab === t.id ? 'tab-on' : ''}`}
              onClick={() => appStore.set({ leftTab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="left-body" role="tabpanel">
          {leftTab === 'news' && <NewsPanel news={news} />}
          {leftTab === 'markets' && <MarketsPanel />}
          {leftTab === 'weather' && <WeatherPanel />}
          {leftTab === 'disasters' && <DisastersPanel disasters={disasters} />}
          {leftTab === 'traffic' && <TrafficPanel flights={flights} shipStatus={ships.status} ships={ships.ships} />}
          {leftTab === 'conflicts' && <ConflictsPanel stories={news.data?.stories ?? []} updatedAt={news.data?.updatedAt ?? null} />}
          {leftTab === 'live' && <LivePanel />}
        </div>
      </aside>

      <main className="stage">
        {mapMode === 'flat' ? (
          <RadarMap flights={flights.data} disasters={mapDisasters} ships={ships.ships} cameras={globeCameras} />
        ) : (
          <GlobeView
            features={features}
            disasters={mapDisasters}
            flights={flights.data}
            ships={ships.ships}
            cameras={globeCameras}
            sidebarOpen={leftOpen}
            drawerOpen={Boolean(country)}
          />
        )}
        <MapTools timeRange={timeRange} />
        <LayerDock />
        <p className="stage-hint small">
          {mapMode === 'flat' ? 'Drag to pan · scroll to zoom · click a camera to watch it' : 'Drag to rotate · scroll to zoom · click a country'}
        </p>
      </main>

      {country && (
        <aside className="drawer" aria-label={`Statistics for ${currentProfile?.name ?? country}`}>
          <CountryDrawer
            iso3={country}
            profile={{ ...profile, data: currentProfile }}
            cameras={{ ...cameras, data: cca2 ? cameras.data : null }}
          />
        </aside>
      )}

      {camera && <CameraViewer id={camera} />}
      {methodologyOpen && <MethodologyModal />}
    </div>
  );
}
