import { useMemo, useState } from 'react';
import type { DisastersResponse } from '../../shared/types';
import { requestFocus } from '../lib/appState';
import { fmtDateTime, timeAgo } from '../lib/format';
import { Empty, ErrorState, Section, Spinner, Stat } from './ui';

type Filter = 'all' | 'm45' | 'tsunami' | 'events';

export function DisastersPanel({ disasters }: { disasters: { data: DisastersResponse | null; error: string | null; loading: boolean; reload: () => void } }) {
  const [filter, setFilter] = useState<Filter>('all');
  const data = disasters.data;

  const quakes = useMemo(() => {
    if (!data) return [];
    if (filter === 'events') return [];
    if (filter === 'm45') return data.quakes.filter((q) => q.mag >= 4.5);
    if (filter === 'tsunami') return data.quakes.filter((q) => q.tsunami);
    return data.quakes;
  }, [data, filter]);

  const eventGroups = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data?.events ?? []) m.set(e.category, (m.get(e.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const strongest = data?.quakes[0];

  return (
    <div className="panel-body">
      {disasters.loading && !data && <Spinner label="Checking USGS and NASA feeds" />}
      {disasters.error && !data && <ErrorState message={disasters.error} onRetry={disasters.reload} />}

      {data && (
        <>
          <div className="stats-grid">
            <Stat label="Earthquakes (24 h)" value={data.quakes.length} sub="M2.5+" />
            <Stat label="Strongest" value={strongest ? `M${strongest.mag.toFixed(1)}` : '—'} sub={strongest ? timeAgo(strongest.time) : ''} />
            <Stat label="Open natural events" value={data.events.length} sub="NASA EONET" />
          </div>

          <div className="chips" role="tablist" aria-label="Disaster filters">
            {(
              [
                ['all', 'All quakes'],
                ['m45', 'M4.5+'],
                ['tsunami', 'Tsunami alerts'],
                ['events', 'Natural events'],
              ] as [Filter, string][]
            ).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={filter === id} className={`chip ${filter === id ? 'chip-on' : ''}`} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>

          {filter !== 'events' && (
            <Section title="Earthquakes">
              {quakes.length === 0 && <Empty>No earthquakes match this filter in the last 24 hours.</Empty>}
              <ul className="event-list">
                {quakes.slice(0, 40).map((q) => (
                  <li key={q.id}>
                    <button className="event-row" onClick={() => requestFocus(q.lat, q.lon, 1.25)}>
                      <span className={`mag mag-${q.mag >= 6 ? 'high' : q.mag >= 5 ? 'mid' : 'low'}`}>{q.mag.toFixed(1)}</span>
                      <span className="event-text">
                        <strong>{q.place}</strong>
                        <small className="muted">
                          {timeAgo(q.time)} · depth {q.depth.toFixed(0)} km{q.tsunami ? ' · tsunami alert' : ''}
                        </small>
                      </span>
                    </button>
                    <a className="small" href={q.url} target="_blank" rel="noopener noreferrer">
                      USGS
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(filter === 'all' || filter === 'events') && (
            <Section title="Natural events (open)">
              {eventGroups.length > 0 && (
                <div className="tag-cloud">
                  {eventGroups.map(([cat, n]) => (
                    <span key={cat} className="tag">
                      {cat} · {n}
                    </span>
                  ))}
                </div>
              )}
              {data.events.length === 0 && <Empty>No open natural events reported right now.</Empty>}
              <ul className="event-list">
                {data.events.slice(0, 40).map((e) => (
                  <li key={e.id}>
                    <button className="event-row" onClick={() => requestFocus(e.lat, e.lon, 1.6)}>
                      <span className="mag mag-event">◉</span>
                      <span className="event-text">
                        <strong>{e.title}</strong>
                        <small className="muted">
                          {e.category} · {fmtDateTime(e.date)}
                        </small>
                      </span>
                    </button>
                    <a className="small" href={e.link} target="_blank" rel="noopener noreferrer">
                      Source
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {data.errors.length > 0 && <p className="form-error small">Partial data: {data.errors.join(' · ')}</p>}
        </>
      )}
      <p className="disclaimer">Earthquakes: USGS past-day feed (M2.5+). Natural events: NASA EONET open events. Times shown relative to your device clock.</p>
    </div>
  );
}
