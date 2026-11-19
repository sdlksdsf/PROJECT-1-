import { CONFLICTS, CONFLICT_LAST_REVIEWED, type ConflictStatus } from '../data/conflicts';
import { requestFocus, selectCountry } from '../lib/appState';
import { Pill, Section } from './ui';

const STATUS: Record<ConflictStatus, { label: string; tone: 'red' | 'amber' | 'gray' }> = {
  active: { label: 'Active', tone: 'red' },
  ceasefire: { label: 'Ceasefire', tone: 'amber' },
  verify: { label: 'Verify status', tone: 'gray' },
};

export function ConflictsPanel() {
  return (
    <div className="panel-body">
      <p className="disclaimer top">
        A curated list for orientation, not a live feed. <strong>{CONFLICT_LAST_REVIEWED}.</strong> Entries marked “Verify status” must be checked
        against current reporting before use. Connect an ACLED key to make this list live.
      </p>
      <Section title={`Armed conflicts (${CONFLICTS.length})`}>
        <ul className="conflict-list">
          {CONFLICTS.map((c) => (
            <li key={c.id} className="conflict">
              <div className="conflict-head">
                <button className="link-btn" onClick={() => requestFocus(c.lat, c.lng, 2.2)}>
                  <strong>{c.name}</strong>
                </button>
                <Pill tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Pill>
              </div>
              <p className="small muted">
                Since {c.since} · {c.countries.join(', ')}
              </p>
              <p className="small">{c.summary}</p>
              <div className="conflict-links">
                {c.countries.slice(0, 3).map((iso) => (
                  <button key={iso} className="btn btn-ghost btn-sm" onClick={() => selectCountry(iso)}>
                    Profile · {iso}
                  </button>
                ))}
                {c.sources.map((s) => (
                  <a key={s.url} className="small" href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.label}
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
