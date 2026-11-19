import { useMemo } from 'react';
import { CONFLICTS } from '../data/conflicts';
import { requestFocus, selectCountry } from '../lib/appState';
import type { Story } from '../../shared/types';
import { Section } from './ui';

// Live reporting for each conflict: news stories from the feed that mention one of the conflict's countries.
export function ConflictsPanel({ stories, updatedAt }: { stories: Story[]; updatedAt: string | null }) {
  const related = useMemo(
    () =>
      CONFLICTS.map((c) => ({
        conflict: c,
        items: stories.filter((s) => s.countries.some((iso) => c.countries.includes(iso))).slice(0, 4),
      })),
    [stories],
  );

  return (
    <div className="panel-body">
      <p className="disclaimer top">
        Conflict locations are a fixed list. The reports under each one come from the live news feed, matched by country.
        {updatedAt && <> News updated {new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</>}
      </p>
      <Section title={`Armed conflicts (${CONFLICTS.length})`}>
        <ul className="conflict-list">
          {related.map(({ conflict: c, items }) => (
            <li key={c.id} className="conflict">
              <div className="conflict-head">
                <button className="link-btn" onClick={() => requestFocus(c.lat, c.lng, 2.2)}>
                  <strong>{c.name}</strong>
                </button>
              </div>
              <p className="small muted">{c.countries.join(', ')}</p>
              {items.length === 0 ? (
                <p className="small muted">No recent stories in the live feed mention these countries.</p>
              ) : (
                <ul className="conflict-news">
                  {items.map((s) => (
                    <li key={s.id}>
                      <a className="small" href={s.link} target="_blank" rel="noopener noreferrer">
                        {s.title}
                      </a>
                      <span className="small muted"> · {s.factuality.label}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="conflict-links">
                {c.countries.slice(0, 3).map((iso) => (
                  <button key={iso} className="btn btn-ghost btn-sm" onClick={() => selectCountry(iso)}>
                    Profile · {iso}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
