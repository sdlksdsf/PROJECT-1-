import { useMemo } from 'react';
import type { FlightsResponse } from '../../shared/types';
import { appStore } from '../lib/appState';
import { useStore } from '../lib/store';
import { fmtNumber, timeAgo } from '../lib/format';
import type { ShipStatus, ShipPoint } from '../lib/ships';
import { Empty, ErrorState, Section, Spinner, Stat } from './ui';

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
