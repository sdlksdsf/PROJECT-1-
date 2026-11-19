import { useMemo, useState } from 'react';
import type { MarketsResponse, Quote, QuoteGroup } from '../../shared/types';
import { appStore } from '../lib/appState';
import { useStore } from '../lib/store';
import { useResource } from '../lib/useResource';
import { fmtPct, fmtPrice } from '../lib/format';
import { Empty, ErrorState, Section, Sparkline, Spinner } from './ui';
import type { PredictionsResponse } from '../../shared/types';
import { fmtNumber } from '../lib/format';

const GROUP_TITLES: Record<QuoteGroup, string> = {
  index: 'Indices',
  stock: 'Stocks',
  commodity: 'Commodities & energy',
  crypto: 'Crypto',
  fx: 'Currencies',
};
const GROUP_ORDER: QuoteGroup[] = ['index', 'commodity', 'stock', 'crypto', 'fx'];

function QuoteRow({ q, active, onSelect, onRemove }: { q: Quote; active: boolean; onSelect: () => void; onRemove?: () => void }) {
  const up = q.changePct === null ? null : q.changePct >= 0;
  return (
    <div className={`quote ${active ? 'quote-active' : ''}`}>
      <button className="quote-main" onClick={onSelect} aria-pressed={active}>
        <span className="quote-name">
          {q.name}
          <small>{q.symbol}</small>
        </span>
        <Sparkline values={q.series} up={up} />
        <span className="quote-price">
          {fmtPrice(q.price)}
          <small className={up === null ? 'muted' : up ? 'up' : 'down'}>{fmtPct(q.changePct)}</small>
        </span>
      </button>
      {onRemove && (
        <button className="icon-btn" onClick={onRemove} aria-label={`Remove ${q.symbol}`} title="Remove from watchlist">
          ×
        </button>
      )}
    </div>
  );
}

function Detail({ q }: { q: Quote }) {
  const up = q.changePct === null ? null : q.changePct >= 0;
  const hi = q.series.length ? Math.max(...q.series) : null;
  const lo = q.series.length ? Math.min(...q.series) : null;
  return (
    <div className="quote-detail">
      <div className="detail-head">
        <div>
          <strong>{q.name}</strong>
          <span className="muted small"> {q.symbol}</span>
        </div>
        <div className="detail-price">
          {fmtPrice(q.price, q.currency)}
          <small className={up === null ? 'muted' : up ? 'up' : 'down'}>
            {q.change === null ? '' : `${q.change >= 0 ? '+' : ''}${fmtPrice(q.change)} `}({fmtPct(q.changePct)})
          </small>
        </div>
      </div>
      <Sparkline values={q.series} up={up} width={340} height={70} />
      <div className="detail-range muted small">
        30-day range: {lo === null ? '—' : fmtPrice(lo)} – {hi === null ? '—' : fmtPrice(hi)} · previous close {fmtPrice(q.prevClose)}
      </div>
    </div>
  );
}

function normaliseSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  return /^[A-Z0-9^=.\-]{1,15}$/.test(s) ? s : null;
}

export function MarketsPanel() {
  const watchlist = useStore(appStore, (s) => s.watchlist);
  const [selected, setSelected] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  const main = useResource<MarketsResponse>('/api/markets', 60_000);
  const customUrl = watchlist.length ? `/api/markets?symbols=${encodeURIComponent(watchlist.join(','))}` : null;
  const custom = useResource<MarketsResponse>(customUrl, 60_000);

  const grouped = useMemo(() => {
    const map = new Map<QuoteGroup, Quote[]>();
    for (const q of main.data?.quotes ?? []) {
      const arr = map.get(q.group) ?? [];
      arr.push(q);
      map.set(q.group, arr);
    }
    return map;
  }, [main.data]);

  const allQuotes = [...(main.data?.quotes ?? []), ...(custom.data?.quotes ?? [])];
  const active = allQuotes.find((q) => q.symbol === selected) ?? allQuotes[0] ?? null;

  const addSymbol = () => {
    const s = normaliseSymbol(input);
    if (!s) return setInputError('Use a ticker like AAPL, ^GSPC or BTC-USD');
    if (watchlist.includes(s)) return setInputError('Already in your watchlist');
    if (watchlist.length >= 16) return setInputError('Watchlist limit is 16 symbols');
    appStore.set((st) => ({ watchlist: [...st.watchlist, s] }));
    setInput('');
    setInputError(null);
  };

  return (
    <div className="panel-body">
      <PredictionsCard />
      {main.loading && !main.data && <Spinner label="Fetching quotes" />}
      {main.error && !main.data && <ErrorState message={main.error} onRetry={main.reload} />}
      {main.data?.error && <ErrorState message={main.data.error} onRetry={main.reload} />}

      {active && <Detail q={active} />}

      {GROUP_ORDER.map((g) => {
        const items = grouped.get(g);
        if (!items?.length) return null;
        return (
          <Section key={g} title={GROUP_TITLES[g]}>
            <div className="quote-list">
              {items.map((q) => (
                <QuoteRow key={q.symbol} q={q} active={active?.symbol === q.symbol} onSelect={() => setSelected(q.symbol)} />
              ))}
            </div>
          </Section>
        );
      })}

      <Section
        title="My watchlist"
        aside={<span className="muted small">{watchlist.length}/16</span>}
      >
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            addSymbol();
          }}
        >
          <input
            className="input"
            placeholder="Add ticker, e.g. NVDA"
            aria-label="Add ticker symbol"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={15}
          />
          <button className="btn btn-sm" type="submit">
            Add
          </button>
        </form>
        {inputError && <p className="form-error small">{inputError}</p>}
        {watchlist.length === 0 && <Empty>Add any stock, index, commodity or currency to track it here.</Empty>}
        {custom.loading && !custom.data && watchlist.length > 0 && <Spinner label="Loading watchlist" />}
        <div className="quote-list">
          {(custom.data?.quotes ?? []).map((q) => (
            <QuoteRow
              key={q.symbol}
              q={q}
              active={active?.symbol === q.symbol}
              onSelect={() => setSelected(q.symbol)}
              onRemove={() => appStore.set((st) => ({ watchlist: st.watchlist.filter((x) => x !== q.symbol) }))}
            />
          ))}
        </div>
      </Section>

      <p className="disclaimer">
        Quotes come from Yahoo Finance’s public chart data and can be delayed. Some exchanges are delayed by 15–20 minutes. Last
        update: {main.data?.updatedAt ? new Date(main.data.updatedAt).toLocaleTimeString('en-GB') : '—'}. Not investment advice.
      </p>
    </div>
  );
}

/** Most-traded prediction markets (Polymarket). Prices are what traders pay, not our forecast. */
function PredictionsCard() {
  const { data, error, loading, reload } = useResource<PredictionsResponse>('/api/predictions', 300_000);
  return (
    <Section title="Prediction markets" aside={<span className="muted small">{data?.source ?? 'Polymarket'}</span>}>
      {loading && !data && <Spinner label="Loading markets" />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {data && data.markets.length === 0 && <Empty>No active markets right now.</Empty>}
      {data && data.markets.length > 0 && (
        <ul className="pred-list">
          {data.markets.map((m) => (
            <li key={m.id} className="pred">
              <a href={m.url} target="_blank" rel="noopener noreferrer">{m.question}</a>
              <div className="small muted">
                <strong className="pred-p">{m.probability.toFixed(1)}%</strong> {m.leading}
                {m.volume24h !== null && <> · ${fmtNumber(Math.round(m.volume24h))} traded in 24h</>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">Market prices reflect what people bet, not a forecast from this site.</p>
    </Section>
  );
}
