import { useState } from 'react';
import type { CamerasResponse, CountryResponse, Indicator, Leader, NewsResponse, OilResponse, WeatherResponse } from '../../shared/types';
import { appStore, openCamera, openLiveStream, selectCountry, type DrawerTab } from '../lib/appState';
import { LIVE_STREAMS } from '../data/liveStreams';
import { useStore } from '../lib/store';
import { useResource } from '../lib/useResource';
import { fmtBig, fmtNumber } from '../lib/format';
import { Empty, ErrorState, Section, Spinner, Stat } from './ui';
import { StoryCard } from './NewsPanel';
import { WeatherSummary } from './WeatherPanel';

const TABS: { id: DrawerTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'leaders', label: 'Leaders' },
  { id: 'news', label: 'News' },
  { id: 'cameras', label: 'Cameras' },
  { id: 'weather', label: 'Weather' },
];

function formatIndicator(i: Indicator): string {
  if (i.value === null) return 'No data';
  switch (i.key) {
    case 'corruption':
      return `${i.value.toFixed(1)} / 100`;
    case 'gdp':
      return `$${fmtBig(i.value)}`;
    case 'gdpPc':
      return `$${fmtNumber(Math.round(i.value))}`;
    case 'unemployment':
      return `${i.value.toFixed(1)}%`;
    case 'oilRents':
      return `${i.value.toFixed(2)}% of GDP`;
    case 'lifeExp':
      return `${i.value.toFixed(1)} yrs`;
    default:
      return i.value.toString();
  }
}

function countryCsv(p: CountryResponse): string {
  const rows = [['country', 'iso3', 'indicator', 'value', 'year', 'unit', 'source_note']];
  for (const i of p.indicators) {
    rows.push([p.name, p.iso3, i.label, i.value === null ? '' : String(i.value), i.year === null ? '' : String(i.year), i.unit, i.note]);
  }
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
}

function OverviewTab({ p }: { p: CountryResponse }) {
  const corruption = p.indicators.find((i) => i.key === 'corruption');
  const reserves = useResource<OilResponse>(`/api/oil?iso3=${p.iso3}`, 86_400_000);
  const rd = reserves.data;
  const download = () => {
    const blob = new Blob([countryCsv(p)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.iso3}-indicators.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <div className="stats-grid">
        <Stat label="Population" value={p.population === null ? '—' : fmtBig(p.population)} />
        <Stat label="Area" value={p.area === null ? '—' : `${fmtNumber(Math.round(p.area))} km²`} />
        <Stat label="Capital" value={p.capital ?? '—'} />
        <Stat label="Region" value={p.subregion ?? p.region ?? '—'} />
      </div>
      <dl className="kv">
        <dt>Languages</dt>
        <dd>{p.languages.join(', ') || '—'}</dd>
        <dt>Currency</dt>
        <dd>{p.currencies.join(', ') || '—'}</dd>
        <dt>Official name</dt>
        <dd>{p.official ?? '—'}</dd>
      </dl>

      <Section title="Oil reserves">
        {reserves.loading && !rd && <Spinner label="Loading reserves" />}
        {reserves.error && !rd && <ErrorState message={reserves.error} onRetry={reserves.reload} />}
        {rd && !rd.configured && <Empty>{rd.message}</Empty>}
        {rd?.configured && rd.value === null && <Empty>{rd.message ?? 'No reserves figure for this country.'}</Empty>}
        {rd?.configured && rd.value !== null && (
          <Stat
            label={`Proved crude reserves${rd.year ? ` (end ${rd.year})` : ''}`}
            value={rd.unit === 'million barrels' ? `${(rd.value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} billion barrels` : `${fmtBig(rd.value)} ${rd.unit ?? ''}`}
            sub={rd.source ?? undefined}
          />
        )}
        <p className="disclaimer">Reserves are a year-end stock, not production. Oil rents (% of GDP) above is the World Bank measure of oil income.</p>
      </Section>

      {corruption && corruption.value !== null && (
        <div className="corruption">
          <div className="corruption-head">
            <strong>Control of corruption</strong>
            <span>{corruption.value.toFixed(1)} / 100</span>
          </div>
          <div className="meter" role="img" aria-label={`Control of corruption percentile ${corruption.value.toFixed(0)} out of 100`}>
            <span style={{ width: `${Math.max(0, Math.min(100, corruption.value))}%` }} />
          </div>
          <p className="small muted">
            Percentile rank{corruption.year ? ` (${corruption.year})` : ''}. Higher means stronger control of corruption. Source: World Bank
            Worldwide Governance Indicators, not Transparency International.
          </p>
        </div>
      )}

      <Section
        title="Indicators"
        aside={
          <button className="btn btn-ghost btn-sm" onClick={download}>
            CSV
          </button>
        }
      >
        <ul className="indicator-list">
          {p.indicators.map((i) => (
            <li key={i.key} title={i.note}>
              <span>
                {i.label}
                <small className="muted">{i.year ? ` · ${i.year}` : ''}</small>
              </span>
              <strong>{formatIndicator(i)}</strong>
            </li>
          ))}
        </ul>
      </Section>

      {p.notes.length > 0 && (
        <ul className="notes">
          {p.notes.map((n) => (
            <li key={n} className="small muted">
              {n}
            </li>
          ))}
        </ul>
      )}
      <div className="btn-row">
        {p.cca2 && (
          <a className="btn btn-ghost btn-sm" href={`https://data.worldbank.org/country/${p.cca2.toLowerCase()}`} target="_blank" rel="noopener noreferrer">
            World Bank data
          </a>
        )}
      </div>
    </>
  );
}

function LeadersTab({ leaders }: { leaders: Leader[] }) {
  if (leaders.length === 0) return <Empty>No current head of state or government is listed in Wikidata for this country.</Empty>;
  return (
    <ul className="leaders">
      {leaders.map((l) => (
        <li key={`${l.name}-${l.role}`}>
          {l.image ? (
            <img src={l.image} alt="" loading="lazy" width={48} height={48} />
          ) : (
            <span className="avatar" aria-hidden="true">
              {l.name[0]}
            </span>
          )}
          <div>
            <strong>{l.name}</strong>
            <span className="muted small">{l.role}</span>
          </div>
          <a className="small" href={l.wikidata} target="_blank" rel="noopener noreferrer">
            Wikidata
          </a>
        </li>
      ))}
    </ul>
  );
}

function NewsTab({ iso3 }: { iso3: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useResource<NewsResponse>(`/api/country-news?iso3=${iso3}`);
  if (loading && !data) return <Spinner label="Searching global coverage" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data || data.stories.length === 0) return <Empty>No coverage found in the last 3 days for this country.</Empty>;
  return (
    <>
      <p className="small muted">
        Coverage from many outlets worldwide (GDELT index). Check the outlet-country list on each story to see who is reporting.
      </p>
      <div className="story-list">
        {data.stories.map((s) => (
          <StoryCard key={s.id} story={s} expanded={open === s.id} onToggle={() => setOpen((c) => (c === s.id ? null : s.id))} />
        ))}
      </div>
    </>
  );
}

type Res<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };

/** Live TV channels for this country (from the Live TV list), then its webcams. */
function CamerasTab({ cca2, cameras }: { cca2: string | null; cameras: Res<CamerasResponse> }) {
  const live = cca2 ? LIVE_STREAMS.filter((s) => s.countries.includes(cca2)) : [];
  return (
    <>
      {live.length > 0 && (
        <div className="live-country">
          <p className="small muted">Live TV for this country (plays in the Live TV tab)</p>
          <ul className="live-country-list">
            {live.map((s) => (
              <li key={s.id}>
                <button className="btn btn-sm" onClick={() => openLiveStream(s.id)}>
                  Watch {s.title} live
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <CamerasList cca2={cca2} cameras={cameras} />
    </>
  );
}

function CamerasList({ cca2, cameras }: { cca2: string | null; cameras: Res<CamerasResponse> }) {
  const { data, error, loading, reload } = cameras;
  if (!cca2) return <Empty>No camera coverage code for this territory.</Empty>;
  if (loading && !data) return <Spinner label="Looking for public cameras" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  if (!data.configured) {
    return (
      <Empty>
        <strong>Live cameras are not connected yet.</strong>
        <br />
        {data.message} Windy (windy.com) and OpenWebcamDB both offer free keys.
      </Empty>
    );
  }
  const badSources = (Object.keys(data.sources) as (keyof typeof data.sources)[]).filter((k) => data.sources[k] !== 'ok');
  const sourceNote = badSources.length
    ? badSources.map((k) => `${k === 'windy' ? 'Windy' : 'OpenWebcamDB'}: ${data.sources[k] === 'auth-failed' ? 'key rejected' : 'unavailable'}`).join(' · ')
    : null;
  if (data.cameras.length === 0) {
    return (
      <Empty>
        No public webcams are indexed for this country.
        {sourceNote && <span className="small muted"><br />{sourceNote}</span>}
      </Empty>
    );
  }
  return (
    <>
    {sourceNote && <p className="small muted">{sourceNote}</p>}
    <ul className="cam-list">
      {data.cameras.map((c) => (
        <li key={c.id} className="cam">
          {c.preview ? <img src={c.preview} alt="" loading="lazy" /> : <div className="cam-placeholder">No preview</div>}
          <div className="cam-meta">
            <strong>{c.title}</strong>
            <span className="muted small">{c.city ?? ''}</span>
            <div className="btn-row">
              <button className="btn btn-sm" onClick={() => openCamera(c.id)}>
                View live
              </button>
              {c.attribution && <span className="cam-credit small muted">{c.attribution}</span>}
            </div>
          </div>
        </li>
      ))}
    </ul>
    </>
  );
}

function WeatherTab({ p }: { p: CountryResponse }) {
  const cap = p.capitalLatLng;
  const { data, error, loading, reload } = useResource<WeatherResponse>(cap ? `/api/weather?lat=${cap[0]}&lon=${cap[1]}` : null, 600_000);
  if (!cap) return <Empty>No capital coordinates for {p.name}.</Empty>;
  if (loading && !data) return <Spinner label="Loading weather" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <>
      <p className="small muted">
        Weather in {p.capital ?? 'the capital'}, {p.name}.
      </p>
      <WeatherSummary w={data} />
    </>
  );
}

export function CountryDrawer({
  iso3,
  profile,
  cameras,
}: {
  iso3: string;
  profile: Res<CountryResponse>;
  cameras: Res<CamerasResponse>;
}) {
  const tab = useStore(appStore, (s) => s.drawerTab);
  const p = profile.data;

  return (
    <div className="drawer-inner">
      <header className="drawer-head">
        {p?.flag ? (
          <img className="flag" src={p.flag} alt="" width={44} height={30} />
        ) : (
          <span className="flag flag-fallback" aria-hidden="true">
            {iso3}
          </span>
        )}
        <div className="drawer-title">
          <h2>{p?.name ?? iso3}</h2>
          <span className="muted small">{p?.official ?? (profile.loading ? 'Loading profile…' : '')}</span>
        </div>
        <button className="icon-btn" onClick={() => selectCountry(null)} aria-label="Close country panel" title="Close (Esc)">
          ×
        </button>
      </header>

      <nav className="tabs" role="tablist" aria-label="Country sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'tab-on' : ''}`}
            onClick={() => appStore.set({ drawerTab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="drawer-body">
        {profile.loading && !p && <Spinner label="Loading country statistics" />}
        {profile.error && !p && <ErrorState message={profile.error} onRetry={profile.reload} />}
        {p && (
          <>
            {tab === 'overview' && <OverviewTab p={p} />}
            {tab === 'leaders' && <LeadersTab leaders={p.leaders} />}
            {tab === 'news' && <NewsTab iso3={iso3} />}
            {tab === 'cameras' && <CamerasTab cca2={p.cca2} cameras={cameras} />}
            {tab === 'weather' && <WeatherTab p={p} />}
          </>
        )}
      </div>
    </div>
  );
}
