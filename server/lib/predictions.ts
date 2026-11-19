// Prediction markets from Polymarket's public market API (no key). Shows the markets with the most
// trading in the last 24 hours. Prices are the market's implied probabilities, not forecasts from us.
import { fetchWithTimeout, UpstreamError } from './http';
import { remember } from './cache';
import type { PredictionsResponse } from '../../shared/types';

const URL_BASE = 'https://gamma-api.polymarket.com/markets';

interface RawMarket {
  id: string;
  question: string;
  slug: string;
  outcomes?: string; // JSON string array
  outcomePrices?: string; // JSON string array, e.g. ["0.9915","0.0085"]
  volume24hr?: number;
  liquidityNum?: number;
  endDate?: string;
  closed?: boolean;
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function getPredictions(): Promise<PredictionsResponse> {
  return remember('predictions', 5 * 60e3, async () => {
    const params = new URLSearchParams({ active: 'true', closed: 'false', limit: '30', order: 'volume24hr', ascending: 'false' });
    const res = await fetchWithTimeout(`${URL_BASE}?${params}`, { timeoutMs: 8000 });
    if (!res.ok) throw new UpstreamError(`Polymarket ${res.status}`, 502);
    const raw = (await res.json()) as RawMarket[];
    const markets = raw
      .map((m) => {
        let outcomes: string[] = [];
        let prices: number[] = [];
        try {
          outcomes = JSON.parse(m.outcomes ?? '[]') as string[];
          prices = (JSON.parse(m.outcomePrices ?? '[]') as unknown[]).map(num).filter((p): p is number => p !== null);
        } catch {
          return null;
        }
        // Binary markets: show the "Yes" price. Multi-outcome markets: show the leading outcome.
        const yesIndex = outcomes.indexOf('Yes');
        const lead = yesIndex >= 0 ? yesIndex : prices.indexOf(Math.max(...prices));
        if (lead < 0 || prices[lead] === undefined) return null;
        return {
          id: String(m.id),
          question: m.question,
          url: `https://polymarket.com/market/${m.slug}`,
          leading: outcomes[lead] ?? 'Yes',
          probability: Math.round(prices[lead] * 1000) / 10, // percent, one decimal
          volume24h: num(m.volume24hr),
          liquidity: num(m.liquidityNum),
          endDate: m.endDate ?? null,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null && !Number.isNaN(m.probability))
      .slice(0, 12);
    return { updatedAt: new Date().toISOString(), source: 'Polymarket (public market data)', markets };
  });
}
