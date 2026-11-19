import type { ReactNode } from 'react';
import type { Factuality, Standing } from '../../shared/types';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="state state-empty">{children}</div>;
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head">
        <h3>{title}</h3>
        {aside && <div className="section-aside">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/** Ring showing the 0–100 factuality score with a plain-language label. */
export function FactBadge({ factuality }: { factuality: Factuality }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  const dash = (factuality.score / 100) * c;
  return (
    <div className={`fact fact-${factuality.tone}`} title={factuality.reasons.join(' · ')}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r={r} className="fact-track" />
        <circle cx="14" cy="14" r={r} className="fact-arc" strokeDasharray={`${dash} ${c}`} transform="rotate(-90 14 14)" />
      </svg>
      <div className="fact-text">
        <strong>
          {factuality.score}
          <small>/100</small>
        </strong>
        <span>{factuality.label}</span>
      </div>
    </div>
  );
}

export function StandingBadge({ standing }: { standing: Standing }) {
  const text: Record<Standing, string> = {
    A: 'Standing A: public broadcaster, intergovernmental or primary source',
    B: 'Standing B: established newsroom with published editorial standards',
    C: 'Standing C: aggregator, specialist or unrated outlet',
  };
  return (
    <span className={`grade grade-${standing}`} title={text[standing]} aria-label={text[standing]}>
      {standing}
    </span>
  );
}

/** Tiny inline SVG chart. Colour follows the overall direction of the series. */
export function Sparkline({ values, up, width = 84, height = 28 }: { values: number[]; up: boolean | null; width?: number; height?: number }) {
  if (values.length < 2) return <span className="spark-empty">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 4) - 2).toFixed(1)}`)
    .join(' ');
  const cls = up === null ? 'spark-flat' : up ? 'spark-up' : 'spark-down';
  return (
    <svg className={`spark ${cls}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function Pill({ tone, children }: { tone: 'red' | 'amber' | 'green' | 'blue' | 'violet' | 'gray' | 'teal'; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
