import { useEffect, useState, type FormEvent } from 'react';
import type { WeatherResponse } from '../../shared/types';
import { appStore } from '../lib/appState';
import { useStore } from '../lib/store';
import { useResource } from '../lib/useResource';
import { apiGet } from '../lib/api';
import { weatherLabel } from '../lib/format';
import { MAJOR_CITIES, type City } from '../data/cities';
import { Empty, ErrorState, Section, Spinner } from './ui';

interface GeoResult {
  name: string;
  admin: string | null;
  country: string | null;
  lat: number;
  lon: number;
}

export function WeatherSummary({ w, compact = false }: { w: WeatherResponse; compact?: boolean }) {
  const cur = weatherLabel(w.current.code);
  return (
    <div className={`weather ${compact ? 'weather-compact' : ''}`}>
      <div className="weather-now">
        <span className="weather-icon" aria-hidden="true">
          {cur.icon}
        </span>
        <div>
          <strong className="weather-temp">{w.current.temp === null ? '—' : Math.round(w.current.temp)}°C</strong>
          <span className="muted small"> {cur.label}</span>
        </div>
      </div>
      <div className="weather-facts small muted">
        <span>Feels {w.current.feels === null ? '—' : Math.round(w.current.feels)}°</span>
        <span>Wind {w.current.wind === null ? '—' : Math.round(w.current.wind)} km/h</span>
        <span>Humidity {w.current.humidity ?? '—'}%</span>
      </div>
      {!compact && (
        <ol className="forecast" aria-label="3-day forecast">
          {w.daily.map((d) => (
            <li key={d.date}>
              <span className="muted small">
                {new Date(d.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' })}
              </span>
              <span aria-hidden="true">{weatherLabel(d.code).icon}</span>
              <span className="small">
                {d.max === null ? '—' : Math.round(d.max)}° / {d.min === null ? '—' : Math.round(d.min)}°
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function CityCard({ name, lat, lng, removable, onRemove }: City & { removable?: boolean; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  const { data, error, loading, reload } = useResource<WeatherResponse>(`/api/weather?lat=${lat}&lon=${lng}`, 600_000);
  return (
    <article className="city-card">
      <button className="city-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="city-name">{name}</span>
        {data ? (
          <span className="city-quick">
            {weatherLabel(data.current.code).icon} {data.current.temp === null ? '—' : Math.round(data.current.temp)}°C
          </span>
        ) : loading ? (
          <span className="muted small">…</span>
        ) : (
          <span className="muted small">n/a</span>
        )}
      </button>
      {removable && onRemove && (
        <button className="icon-btn city-remove" onClick={onRemove} aria-label={`Remove ${name}`}>
          ×
        </button>
      )}
      {open && (
        <div className="city-body">
          {error && !data && <ErrorState message={error} onRetry={reload} />}
          {data && <WeatherSummary w={data} />}
        </div>
      )}
    </article>
  );
}

export function WeatherPanel() {
  const country = useStore(appStore, (s) => s.country);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [places, setPlaces] = useState<City[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem('us.places') ?? '[]') as City[];
    } catch {
      return [];
    }
  });
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem('us.places', JSON.stringify(places));
  }, [places]);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const { results } = await apiGet<{ results: GeoResult[] }>(`/api/geocode?q=${encodeURIComponent(term)}`);
      setResults(results);
      if (results.length === 0) setSearchError('No places found. Try a different spelling.');
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const addPlace = (r: GeoResult) => {
    const label = [r.name, r.country].filter(Boolean).join(', ');
    if (places.some((p) => p.name === label)) return;
    setPlaces((p) => [...p, { name: label, lat: r.lat, lng: r.lon }].slice(0, 12));
    setResults(null);
    setQ('');
  };

  return (
    <div className="panel-body">
      <form className="toolbar" onSubmit={search}>
        <input
          className="input"
          placeholder="Search any city or town…"
          aria-label="Search weather by city"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-sm" type="submit" disabled={searching}>
          {searching ? '…' : 'Search'}
        </button>
      </form>
      {searchError && <p className="form-error small">{searchError}</p>}
      {results && results.length > 0 && (
        <ul className="geo-results">
          {results.map((r) => (
            <li key={`${r.name}-${r.lat}-${r.lon}`}>
              <button onClick={() => addPlace(r)}>
                <strong>{r.name}</strong>
                <span className="muted small">
                  {' '}
                  {[r.admin, r.country].filter(Boolean).join(', ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {country && <CountryCapitalWeather iso3={country} />}

      {places.length > 0 && (
        <Section title="My places">
          {places.map((p) => (
            <CityCard
              key={p.name}
              {...p}
              removable
              onRemove={() => setPlaces((arr) => arr.filter((x) => x.name !== p.name))}
            />
          ))}
        </Section>
      )}

      <Section title="Major cities">
        {MAJOR_CITIES.map((c) => (
          <CityCard key={c.name} {...c} />
        ))}
      </Section>
      <p className="disclaimer">Weather data: Open-Meteo (free, no key). Updated every 10 minutes. Times are local to each location.</p>
    </div>
  );
}

function CountryCapitalWeather({ iso3 }: { iso3: string }) {
  const profile = useResource<{ name: string; capital: string | null; capitalLatLng: [number, number] | null }>(
    `/api/country?iso3=${iso3}`,
  );
  const cap = profile.data?.capitalLatLng;
  const w = useResource<WeatherResponse>(cap ? `/api/weather?lat=${cap[0]}&lon=${cap[1]}` : null, 600_000);
  if (!profile.data) return profile.loading ? <Spinner label="Locating capital" /> : null;
  if (!cap) return <Empty>No capital coordinates available for {profile.data.name}.</Empty>;
  return (
    <Section title={`${profile.data.name}: ${profile.data.capital ?? 'capital'}`}>
      {w.loading && !w.data && <Spinner label="Loading weather" />}
      {w.error && !w.data && <ErrorState message={w.error} onRetry={w.reload} />}
      {w.data && <WeatherSummary w={w.data} />}
    </Section>
  );
}
