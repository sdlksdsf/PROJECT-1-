import { useEffect, useRef } from 'react';
import { useResource } from '../lib/useResource';
import { appStore } from '../lib/appState';
import type { HealthResponse, SourceRating } from '../../shared/types';
import { Spinner, StandingBadge } from './ui';

interface SourcesResponse {
  sources: SourceRating[];
}

const ENDPOINTS: { path: string; what: string }[] = [
  { path: '/api/news', what: 'Clustered stories, outlets, standing, factuality score' },
  { path: '/api/archive?q=…&days=30', what: 'Search the stored news archive (needs database)' },
  { path: '/api/sources', what: 'Outlet registry with editorial standing' },
  { path: '/api/markets?symbols=AAPL,^GSPC', what: 'Quotes and 30-day closes (max 40 symbols)' },
  { path: '/api/disasters', what: 'USGS earthquakes (24 h, M2.5+) and NASA EONET events' },
  { path: '/api/flights', what: 'Airborne aircraft positions (OpenSky)' },
  { path: '/api/weather?lat=…&lon=…', what: 'Current conditions and 3-day forecast (Open-Meteo)' },
  { path: '/api/geocode?q=…', what: 'Place search (Open-Meteo geocoding)' },
  { path: '/api/country?iso3=PAK', what: 'Country profile, World Bank indicators, Wikidata leaders' },
  { path: '/api/country-news?iso3=PAK', what: 'Country-tagged coverage (GDELT), clustered and scored' },
  { path: '/api/cameras?cca2=PK', what: 'Public webcams (needs a Windy key)' },
  { path: '/api/health', what: 'Which optional services are configured' },
  { path: '/api/ships', what: 'Recent AIS vessel positions (AISStream, needs a key)' },
  { path: '/api/oil?iso3=…', what: 'Proved crude-oil reserves (OPEC ASB 2026; US EIA when it publishes a match)' },
  { path: '/api/connections?from=&to=&date=', what: 'Onward flight connections (OAG, needs a key)' },
];

const SOURCES: { name: string; use: string; license: string }[] = [
  { name: 'RSS/Atom feeds of public broadcasters, wires and newsrooms', use: 'News stories', license: 'Headlines and short excerpts linked to the original publisher' },
  { name: 'GDELT 2.0 DOC API', use: 'Country-specific coverage', license: 'Open index of news metadata (gdeltproject.org)' },
  { name: 'USGS Earthquake Hazards feed', use: 'Earthquakes', license: 'US Government work, public domain' },
  { name: 'NASA EONET v3', use: 'Natural events', license: 'NASA open data' },
  { name: 'OpenSky Network', use: 'Aircraft positions', license: 'Open data, non-commercial terms; attribution required' },
  { name: 'Open-Meteo', use: 'Weather and geocoding', license: 'Free for non-commercial use (CC BY 4.0 data)' },
  { name: 'World Bank Indicators & WGI', use: 'Economy, governance, oil rents', license: 'CC BY 4.0' },
  { name: 'OPEC Annual Statistical Bulletin 2026', use: 'Proved crude-oil reserves by country (year-end 2025)', license: 'OPEC; non-commercial reuse with acknowledgement' },
  { name: 'OAG developer APIs', use: 'Flight status and connections', license: 'Subscription terms of OAG; free tier with monthly call limits' },
  { name: 'Wikidata', use: 'Heads of state and government', license: 'CC0' },
  { name: 'REST Countries', use: 'Country basics', license: 'Open source (MPL-2.0)' },
  { name: 'Yahoo Finance chart data', use: 'Markets', license: 'Unofficial public endpoint; may be delayed or change' },
  { name: 'Natural Earth (via three-globe)', use: 'Country boundaries and globe textures', license: 'Public domain' },
  { name: 'Windy Webcams API (optional)', use: 'Public cameras', license: 'Requires free API key; follow Windy terms' },
  { name: 'AISStream.io (optional)', use: 'Ship positions', license: 'Requires free API key; follow AISStream terms' },
];

const LIMITS = [
  'The factuality score measures corroboration (independent outlets reporting the same event), outlet standing and recency. It does not verify facts. Use it to decide what to check next.',
  'Clustering groups headlines by shared keywords. Two different events with similar headlines can be merged, and one event can occasionally split.',
  'Country tagging is keyword-based. Common words can match a country name (for example, a person named “Chad”).',
  'Outlet standing grades are editorial placeholders based on process (broadcaster, wire, newsroom, aggregator). They are not a judgement of political leaning. Edit them in the database or in server/lib/feeds.ts.',
  'Conflict markers are a curated list, not live data. Use the status labels and check the linked sources.',
  'Flight data shows positions and direction only. Routes need a commercial flight-data licence.',
  'Corruption is shown as the World Bank Control of Corruption percentile, not the Transparency International CPI score.',
  'Oil: reserves are the OPEC year-end 2025 table (a stock, not production). Oil rents are a World Bank proxy for oil income.',
];

function Health() {
  const { data, error, loading } = useResource<HealthResponse>('/api/health');
  if (loading && !data) return <Spinner label="Checking services" />;
  if (error) return <p className="form-error small">{error}</p>;
  if (!data) return null;
  return (
    <ul className="health">
      <li className={data.services.database ? 'ok' : 'bad'}>
        <span className="dot" /> News archive database {data.services.database ? 'connected' : 'not connected'}
      </li>
      <li className={data.services.cameras ? 'ok' : 'bad'}>
        <span className="dot" /> Live cameras {data.services.cameras ? 'connected' : 'not connected (needs WINDY_API_KEY)'}
      </li>
      <li className={data.services.ships ? 'ok' : 'bad'}>
        <span className="dot" /> Ship tracking {data.services.ships ? 'connected' : 'not connected (needs AISSTREAM_API_KEY)'}
      </li>
      <li className={data.services.oil ? 'ok' : 'bad'}>
        <span className="dot" /> Oil reserves {data.services.oil ? 'connected' : 'not connected (needs EIA_API_KEY)'}
      </li>
      <li className={data.services.flights ? 'ok' : 'bad'}>
        <span className="dot" /> Aircraft feed {data.services.flights ? 'registered OpenSky client' : 'anonymous (400 requests/day budget)'}
      </li>
    </ul>
  );
}

export function MethodologyModal() {
  const dialogRef = useRef<HTMLDivElement>(null);
  const sources = useResource<SourcesResponse>('/api/sources');

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const close = () => appStore.set({ methodologyOpen: false });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="method-title" tabIndex={-1} ref={dialogRef}>
        <header className="modal-head">
          <h2 id="method-title">Methodology, sources and limits</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <section>
            <h3>How the factuality score works</h3>
            <p className="small">
              Each story is a cluster of articles about the same event. The score (0–100) combines three measurable parts:
            </p>
            <ul className="small">
              <li>
                <strong>50%: corroboration.</strong> Distinct outlets reporting it, capped at four.
              </li>
              <li>
                <strong>30%: outlet standing.</strong> Average of the editorial grades (A = 1, B = 0.75, C = 0.5).
              </li>
              <li>
                <strong>20%: freshness.</strong> Full marks within 12 hours, falling to zero by about 72 hours.
              </li>
            </ul>
            <p className="small">
              A score shows how well a story is corroborated. It does not confirm that the story is true. Stories with one outlet are marked
              “verify before sharing”. Use the Fact-check link to search independent fact-check sites.
            </p>
          </section>

          <section>
            <h3>Editorial standing grades</h3>
            <ul className="small grades">
              <li>
                <StandingBadge standing="A" /> Public-service broadcaster, intergovernmental body or primary source
              </li>
              <li>
                <StandingBadge standing="B" /> Established newsroom with published editorial standards
              </li>
              <li>
                <StandingBadge standing="C" /> Aggregator, specialist or unrated outlet
              </li>
            </ul>
            <p className="small muted">
              Each outlet also shows its country and any disclosed ownership, such as “state-affiliated”, so you can judge the source yourself.
            </p>
          </section>

          <section>
            <h3>Outlet registry ({sources.data?.sources.length ?? '…'})</h3>
            <p className="small muted">
              Source: {sources.data?.sources[0]?.source === 'database' ? 'database (editable)' : 'built-in defaults in server/lib/feeds.ts'}.
            </p>
            {sources.loading && !sources.data && <Spinner label="Loading registry" />}
            {sources.data && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Outlet</th>
                      <th>Country</th>
                      <th>Standing</th>
                      <th>Ownership</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.data.sources.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.country}</td>
                        <td>
                          <StandingBadge standing={s.standing} />
                        </td>
                        <td className="muted">{s.ownership ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h3>Data sources</h3>
            <ul className="small sources">
              {SOURCES.map((s) => (
                <li key={s.name}>
                  <strong>{s.name}</strong> <span className="muted">· {s.use}</span>
                  <div className="muted">{s.license}</div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Limits you should know</h3>
            <ul className="small">
              {LIMITS.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Service status</h3>
            <Health />
          </section>

          <section>
            <h3>Public JSON API</h3>
            <p className="small muted">All endpoints are read-only, CORS-enabled and cached at the edge. Use them for research.</p>
            <ul className="endpoints">
              {ENDPOINTS.map((e) => (
                <li key={e.path}>
                  <code>{e.path}</code>
                  <span className="small muted">{e.what}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Keyboard shortcuts</h3>
            <ul className="small shortcuts">
              <li>
                <kbd>/</kbd> search countries
              </li>
              <li>
                <kbd>Esc</kbd> close panels
              </li>
              <li>
                <kbd>R</kbd> toggle radar scan
              </li>
              <li>
                <kbd>T</kbd> toggle dark / light theme
              </li>
              <li>
                <kbd>[</kbd> toggle the left panel
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
