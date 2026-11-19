import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { ArchiveItem, Category, NewsResponse, Story } from '../../shared/types';
import { appStore, toggleSaved } from '../lib/appState';
import { useStore } from '../lib/store';
import { useResource } from '../lib/useResource';
import { fmtDateTime, timeAgo } from '../lib/format';
import { Empty, ErrorState, FactBadge, Spinner, StandingBadge } from './ui';
import { CATEGORY_LABELS } from '../../shared/categories';

export const NEWS_REFRESH_MS = 120_000;

const CATEGORY_CHIPS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'breaking', label: 'Breaking' },
  { id: 'world', label: CATEGORY_LABELS.world },
  { id: 'politics', label: CATEGORY_LABELS.politics },
  { id: 'tech', label: CATEGORY_LABELS.tech },
  { id: 'sports', label: CATEGORY_LABELS.sports },
  { id: 'business', label: CATEGORY_LABELS.business },
  { id: 'science', label: CATEGORY_LABELS.science },
  { id: 'health', label: CATEGORY_LABELS.health },
  { id: 'conflict', label: CATEGORY_LABELS.conflict },
  { id: 'regional', label: CATEGORY_LABELS.regional },
  { id: 'saved', label: 'Saved' },
];

const CAT_TONE: Record<Category, string> = {
  world: 'blue',
  politics: 'violet',
  tech: 'teal',
  sports: 'green',
  business: 'amber',
  science: 'blue',
  health: 'green',
  conflict: 'red',
  regional: 'gray',
};

export function factcheckUrl(title: string): string {
  return `https://toolbox.google.com/factcheck/explorer/search/${encodeURIComponent(title)}`;
}

export function citationFor(story: Story): string {
  const o = story.outlets[0];
  const date = new Date(o.publishedAt).toISOString().slice(0, 10);
  return `${o.name}. "${o.title}". ${date}. ${o.link}`;
}

function download(name: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function StoryCard({ story, expanded, onToggle }: { story: Story; expanded: boolean; onToggle: () => void }) {
  const saved = useStore(appStore, (s) => s.saved.includes(story.id));
  const [copied, setCopied] = useState(false);
  const primary = story.outlets[0];
  const tone = CAT_TONE[story.category];

  const copyCitation = async (e: ReactMouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(citationFor(story));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className={`story ${expanded ? 'story-open' : ''}`}>
      <div className="story-meta">
        <span className={`cat cat-${tone}`}>{CATEGORY_LABELS[story.category]}</span>
        {story.breaking && <span className="pill pill-red pill-live">Breaking</span>}
        <time dateTime={story.publishedAt} className="muted">
          {timeAgo(story.publishedAt)}
        </time>
      </div>
      <h3 className="story-title">
        <a href={primary.link} target="_blank" rel="noopener noreferrer">
          {primary.title}
        </a>
      </h3>
      {story.summary && !expanded && <p className="story-summary">{story.summary}</p>}
      <FactBadge factuality={story.factuality} />
      <div className="outlets" aria-label="Outlets reporting this story">
        {story.outlets.slice(0, expanded ? 20 : 4).map((o) => (
          <a key={o.id} className="outlet" href={o.link} target="_blank" rel="noopener noreferrer" title={o.title}>
            <StandingBadge standing={o.standing} />
            <span>{o.name}</span>
          </a>
        ))}
        {!expanded && story.outlets.length > 4 && (
          <button className="outlet outlet-more" onClick={onToggle}>
            +{story.outlets.length - 4} more
          </button>
        )}
      </div>
      <div className="story-actions">
        <button className="btn btn-ghost btn-sm" onClick={onToggle} aria-expanded={expanded}>
          {expanded ? 'Less' : 'Details'}
        </button>
        <button className={`btn btn-ghost btn-sm ${saved ? 'is-on' : ''}`} onClick={() => toggleSaved(story.id)} aria-pressed={saved}>
          {saved ? '★ Saved' : '☆ Save'}
        </button>
        <a className="btn btn-ghost btn-sm" href={factcheckUrl(primary.title)} target="_blank" rel="noopener noreferrer">
          Fact-check
        </a>
        <button className="btn btn-ghost btn-sm" onClick={copyCitation}>
          {copied ? 'Copied' : 'Cite'}
        </button>
      </div>
      {expanded && (
        <div className="story-detail">
          <p className="muted small">
            Reasons: {story.factuality.reasons.join(' · ')}. Outlet countries: {story.outletCountries.join(', ') || 'unknown'}.
          </p>
          <ul className="outlet-table">
            {story.outlets.map((o) => (
              <li key={o.id}>
                <StandingBadge standing={o.standing} />
                <a href={o.link} target="_blank" rel="noopener noreferrer">
                  {o.name}
                </a>
                <span className="muted small">
                  {' '}
                  · {o.outletCountry || 'country n/a'}
                  {o.ownership ? ` · ${o.ownership}` : ''} · {fmtDateTime(o.publishedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function ArchiveResults({ query }: { query: string }) {
  const url = query.trim().length >= 2 ? `/api/archive?q=${encodeURIComponent(query.trim())}&days=90&limit=40` : null;
  const { data, error, loading, reload } = useResource<{ count: number; items: ArchiveItem[] }>(url);
  if (!url) return <Empty>Type at least two characters to search the archive.</Empty>;
  if (loading && !data) return <Spinner label="Searching archive" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data || data.items.length === 0) return <Empty>No archived headlines match “{query}” in the last 90 days.</Empty>;
  return (
    <ul className="archive-list">
      {data.items.map((it) => (
        <li key={it.id}>
          <a href={it.link} target="_blank" rel="noopener noreferrer">
            {it.title}
          </a>
          <span className="muted small">
            {it.source_name} · {fmtDateTime(it.published_at)}
            {it.factuality_score !== null ? ` · score ${it.factuality_score}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function NewsPanel({ news }: { news: { data: NewsResponse | null; error: string | null; loading: boolean; reload: () => void } }) {
  const category = useStore(appStore, (s) => s.newsCategory);
  const query = useStore(appStore, (s) => s.newsQuery);
  const savedIds = useStore(appStore, (s) => s.saved);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [archiveMode, setArchiveMode] = useState(false);
  const [archiveQuery, setArchiveQuery] = useState('');

  const stories = useMemo(() => {
    if (!news.data) return [];
    const q = query.trim().toLowerCase();
    return news.data.stories.filter((s) => {
      if (category === 'breaking' && !s.breaking) return false;
      if (category === 'saved' && !savedIds.includes(s.id)) return false;
      if (!['all', 'breaking', 'saved'].includes(category) && s.category !== category) return false;
      if (q) {
        const hay = `${s.title} ${s.summary} ${s.outlets.map((o) => o.name).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [news.data, category, query, savedIds]);

  const exportStories = (format: 'json' | 'csv') => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'json') {
      download(`unbiased-stats-news-${stamp}.json`, 'application/json', JSON.stringify(stories, null, 2));
      return;
    }
    const rows = [['title', 'category', 'published_at', 'corroboration', 'factuality_score', 'factuality_label', 'primary_link', 'outlets']];
    for (const s of stories) {
      rows.push([
        s.title,
        s.category,
        s.publishedAt,
        String(s.corroboration),
        String(s.factuality.score),
        s.factuality.label,
        s.outlets[0]?.link ?? s.link,
        s.outlets.map((o) => o.name).join('; '),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    download(`unbiased-stats-news-${stamp}.csv`, 'text/csv', csv);
  };

  const feedsOk = news.data ? news.data.feeds.filter((f) => f.ok).length : 0;
  const feedsTotal = news.data ? news.data.feeds.length : 0;

  return (
    <div className="panel-body">
      <div className="toolbar">
        <input
          className="input"
          type="search"
          placeholder={archiveMode ? 'Search the archive…' : 'Filter headlines, outlets…'}
          aria-label={archiveMode ? 'Search archive' : 'Filter headlines'}
          value={archiveMode ? archiveQuery : query}
          onChange={(e) => (archiveMode ? setArchiveQuery(e.target.value) : appStore.set({ newsQuery: e.target.value }))}
        />
        <button className={`btn btn-ghost btn-sm ${archiveMode ? 'is-on' : ''}`} onClick={() => setArchiveMode((v) => !v)} aria-pressed={archiveMode} title="Search past headlines stored in the database">
          Archive
        </button>
      </div>

      {!archiveMode && (
        <div className="chips" role="tablist" aria-label="News categories">
          {CATEGORY_CHIPS.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={category === c.id}
              className={`chip ${category === c.id ? 'chip-on' : ''}`}
              onClick={() => appStore.set({ newsCategory: c.id })}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {archiveMode ? (
        <ArchiveResults query={archiveQuery} />
      ) : (
        <>
          <div className="list-head">
            <span className="muted small">
              {news.data ? `${stories.length} stories · ${feedsOk}/${feedsTotal} sources reachable` : 'Gathering stories…'}
            </span>
            <div className="btn-row">
              <button className="btn btn-ghost btn-sm" onClick={() => exportStories('csv')} disabled={!stories.length}>
                CSV
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => exportStories('json')} disabled={!stories.length}>
                JSON
              </button>
            </div>
          </div>
          {news.loading && !news.data && <Spinner label="Gathering stories from public feeds" />}
          {news.error && !news.data && <ErrorState message={news.error} onRetry={news.reload} />}
          {news.data && stories.length === 0 && (
            <Empty>{category === 'saved' ? 'Nothing saved yet. Use “Save” on any story.' : 'No stories match these filters.'}</Empty>
          )}
          <div className="story-list">
            {stories.map((s) => (
              <StoryCard
                key={s.id}
                story={s}
                expanded={expanded === s.id}
                onToggle={() => setExpanded((cur) => (cur === s.id ? null : s.id))}
              />
            ))}
          </div>
          {news.data && (
            <details className="feed-health">
              <summary>
                Source health: {feedsOk} of {feedsTotal} feeds reachable
              </summary>
              <ul>
                {news.data.feeds.map((f) => (
                  <li key={f.id} className={f.ok ? 'ok' : 'bad'}>
                    <span className="dot" /> {f.name} {f.ok ? `· ${f.count} recent` : `· ${f.error ?? 'unreachable'}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

export function TickerBar({ stories }: { stories: Story[] }) {
  const items = useMemo(() => {
    const breaking = stories.filter((s) => s.breaking);
    const pool = breaking.length ? breaking : stories;
    return pool.slice(0, 14);
  }, [stories]);
  if (items.length === 0) return <div className="ticker ticker-empty">Waiting for the first headlines…</div>;
  const row = items.map((s, i) => (
    <a key={`${s.id}-${i}`} className="ticker-item" href={s.outlets[0].link} target="_blank" rel="noopener noreferrer">
      {s.breaking && <span className="ticker-tag">BREAKING</span>}
      <span>{s.outlets[0].title}</span>
      <span className="ticker-meta">
        {s.outlets[0].name} · {s.corroboration} outlet{s.corroboration === 1 ? '' : 's'}
      </span>
    </a>
  ));
  return (
    <div className="ticker" aria-label="Breaking headlines">
      <div className="ticker-track">
        <div className="ticker-group">{row}</div>
        <div className="ticker-group" aria-hidden="true">
          {row}
        </div>
      </div>
    </div>
  );
}
