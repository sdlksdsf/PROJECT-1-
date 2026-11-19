import { useMemo, useState } from 'react';
import type { ConnectionsResponse, FlightsResponse, FlightStatusResponse } from '../../shared/types';
import { appStore } from '../lib/appState';
import { useStore } from '../lib/store';
import { fmtNumber, timeAgo } from '../lib/format';
import type { ShipStatus, ShipPoint } from '../lib/ships';
import { useResource } from '../lib/useResource';
import { Empty, ErrorState, Section, Spinner, Stat } from './ui';

function ConnectionsLookup() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState<string | null>(null);
  const res = useResource<ConnectionsResponse>(query, 3_600_000);
  const data = res.data;
  const clock = (iso: string | null) => (iso ? iso.replace('T', ' ').slice(11, 16) : '—');
  return (
    <Section title="Connections" aside={<span className="muted small">{data?.source ?? 'OAG Flight Info Connections'}</span>}>
      <form
        className="flight-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = from.trim().toUpperCase();
          const t = to.trim().toUpperCase();
          if (/^[A-Z]{3}$/.test(f) && /^[A-Z]{3}$/.test(t) && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
            setQuery(`/api/connections?from=${f}&to=${t}&date=${date}`);
          }
        }}
      >
        <input className="search-input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From, e.g. LHR" aria-label="From airport" maxLength={3} />
        <input className="search-input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To, e.g. ATH" aria-label="To airport" maxLength={3} />
        <input className="search-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        <button className="btn" type="submit">Find</button>
      </form>
      {query && res.loading && !data && <Spinner label="Finding connections" />}
      {query && res.error && !data && <ErrorState message={res.error} onRetry={res.reload} />}
      {data && !data.configured && <Empty>{data.message}</Empty>}
      {data?.configured && data.message && <ErrorState message={data.message} onRetry={res.reload} />}
      {data?.configured && !data.message && data.options.length === 0 && <Empty>No connections found for that route and date.</Empty>}
      {data?.options.map((o, i) => (
        <div className="flight-card" key={i}>
          <div className="flight-head">
            <strong>{o.stops === 0 ? 'Direct' : `${o.stops} stop${o.stops > 1 ? 's' : ''}`}</strong>
            <span className="pill pill-gray">{o.totalDuration ?? '—'}</span>
          </div>
          {o.segments.map((s, j) => (
            <div className="small" key={`${s.flight}-${j}`}>
              {s.flight}: {s.from ?? '—'} {clock(s.departs)} → {s.to ?? '—'} {clock(s.arrives)}
            </div>
          ))}
        </div>
      ))}
    </Section>
  );
}

function FlightLookup() {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState<string | null>(null);
  const res = useResource<FlightStatusResponse>(query ? `/api/flight-status?flight=${encodeURIComponent(query)}` : null, 900_000);
  const data = res.data;
  return (
    <Section title="Flight status" aside={<span className="muted small">{data?.source ?? 'OAG · AviationStack'}</span>}>
      <form
        className="flight-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = draft.trim().toUpperCase().replace(/\s+/g, '');
          if (f) setQuery(f);
        }}
      >
        <input
          className="search-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Flight number, e.g. PK300"
          aria-label="Flight number"
          maxLength={8}
        />
        <button className="btn" type="submit">Look up</button>
      </form>
      {query && res.loading && !data && <Spinner label="Checking the flight" />}
      {query && res.error && !data && <ErrorState message={res.error} onRetry={res.reload} />}
      {data && !data.configured && <Empty>{data.message}</Empty>}
      {data?.configured && data.message && <ErrorState message={data.message} onRetry={res.reload} />}
      {data?.configured && !data.message && data.flights.length === 0 && <Empty>No scheduled flight found for {query}.</Empty>}
      {data?.flights.map((f, i) => (
        <div className="flight-card" key={`${f.flight}-${f.date}-${i}`}>
          <div className="flight-head">
            <strong>{f.flight}</strong>
            <span className="pill pill-gray">{f.status ?? 'unknown'}</span>
          </div>
          <div className="small muted">{[f.airline, f.date].filter(Boolean).join(' · ')}</div>
          <div className="small">
            {f.departure.iata ?? '—'} → {f.arrival.iata ?? '—'}
            {f.arrival.delay ? ` · arrival delay ${f.arrival.delay} min` : ''}
          </div>
          {f.live && (
            <div className="small muted">
              Live: {f.live.altitude === null ? '—' : `${Math.round(f.live.altitude)} m`} · {f.live.onGround ? 'on the ground' : 'airborne'}
            </div>
          )}
        </div>
      ))}
    </Section>
  );
}

export function TrafficPanel({
  flights,
  shipStatus,
  ships,
}: {
  flights: { data: FlightsResponse | null; error: string | null; loading: boolean; reload: () => void };
  shipStatus: ShipStatus;
  ships: ShipPoint[];
}) {
  const layers = useStore(appStore, (s) => s.layers);
  const data = flights.data;

  const bands = useMemo(() => {
    const b = { low: 0, mid: 0, high: 0, unknown: 0 };
    for (const a of data?.aircraft ?? []) {
      if (a.alt === null) b.unknown++;
      else if (a.alt < 3000) b.low++;
      else if (a.alt < 9000) b.mid++;
      else b.high++;
    }
    return b;
  }, [data]);

  const maxCountry = data?.byCountry[0]?.count ?? 1;

  const shipNote: Record<ShipStatus, string> = {
    off: 'Turn the Ships layer on to start tracking.',
    'no-key': 'Ship tracking needs a free AISStream.io key. Add AISSTREAM_API_KEY on the server and redeploy.',
    connecting: 'Connecting to the AIS stream…',
    live: `${fmtNumber(ships.length)} vessels reporting positions in the last few minutes.`,
    error: 'The ship feed could not be reached. It retries every minute.',
  };

  return (
    <div className="panel-body">
      <FlightLookup />
      <ConnectionsLookup />
      <Section title="Aircraft (live positions)" aside={<span className="muted small">OpenSky · {data ? timeAgo(data.updatedAt) : '—'}</span>}>
        {flights.loading && !data && <Spinner label="Reading aircraft transponders" />}
        {flights.error && !data && <ErrorState message={flights.error} onRetry={flights.reload} />}
        {data?.error && <ErrorState message={data.error} onRetry={flights.reload} />}
        {data && !data.error && (
          <>
            <div className="stats-grid">
              <Stat label="Airborne now" value={fmtNumber(data.airborne)} sub={`of ${fmtNumber(data.total)} reporting`} />
              <Stat label="Low (<3 km)" value={fmtNumber(bands.low)} />
              <Stat label="Mid (3–9 km)" value={fmtNumber(bands.mid)} />
              <Stat label="High (>9 km)" value={fmtNumber(bands.high)} />
            </div>
            <div className="toggle-row">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={layers.headings}
                  onChange={(e) => appStore.set((s) => ({ layers: { ...s.layers, headings: e.target.checked } }))}
                />
                <span>Show heading vectors on the globe (next 5 minutes)</span>
              </label>
            </div>
            <h4 className="subhead">Registered in (top 15)</h4>
            <ul className="bars">
              {data.byCountry.map((c) => (
                <li key={c.country}>
                  <span className="bar-label">{c.country}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(c.count / maxCountry) * 100}%` }} />
                  </span>
                  <span className="bar-value">{fmtNumber(c.count)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="disclaimer">
          Free public data gives position, altitude, speed and heading. It does not include origin or destination airports, so the globe
          shows direction of travel, not routes.
        </p>
      </Section>

      <Section title="Ships (AIS)" aside={<span className={`pill ${shipStatus === 'live' ? 'pill-green' : 'pill-gray'}`}>{shipStatus.replace('-', ' ')}</span>}>
        <p className="small">{shipNote[shipStatus]}</p>
        {shipStatus === 'live' && ships.length === 0 && <Empty>Waiting for the first position reports…</Empty>}
        {ships.length > 0 && (
          <ul className="ship-list">
            {ships.slice(0, 12).map((s) => (
              <li key={s.mmsi}>
                <span>{s.name}</span>
                <span className="muted small">{s.sog === null ? '' : `${s.sog.toFixed(1)} kn`}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
