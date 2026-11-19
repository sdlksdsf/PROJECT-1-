// Stock, index, commodity, crypto and FX quotes from Yahoo Finance's public chart endpoint.
import { getJson } from './http';
import { remember } from './cache';
import type { MarketsResponse, Quote, QuoteGroup } from '../../shared/types';

export interface WatchItem {
  symbol: string;
  name: string;
  group: QuoteGroup;
}

export const DEFAULT_WATCHLIST: WatchItem[] = [
  { symbol: '^GSPC', name: 'S&P 500', group: 'index' },
  { symbol: '^DJI', name: 'Dow Jones', group: 'index' },
  { symbol: '^IXIC', name: 'Nasdaq', group: 'index' },
  { symbol: '^FTSE', name: 'FTSE 100', group: 'index' },
  { symbol: '^GDAXI', name: 'DAX', group: 'index' },
  { symbol: '^N225', name: 'Nikkei 225', group: 'index' },
  { symbol: '^HSI', name: 'Hang Seng', group: 'index' },
  { symbol: '^NSEI', name: 'Nifty 50', group: 'index' },
  { symbol: 'AAPL', name: 'Apple', group: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft', group: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA', group: 'stock' },
  { symbol: 'AMZN', name: 'Amazon', group: 'stock' },
  { symbol: 'TSLA', name: 'Tesla', group: 'stock' },
  { symbol: '2222.SR', name: 'Saudi Aramco', group: 'stock' },
  { symbol: 'CL=F', name: 'WTI Crude Oil', group: 'commodity' },
  { symbol: 'BZ=F', name: 'Brent Crude Oil', group: 'commodity' },
  { symbol: 'NG=F', name: 'Natural Gas', group: 'commodity' },
  { symbol: 'GC=F', name: 'Gold', group: 'commodity' },
  { symbol: 'SI=F', name: 'Silver', group: 'commodity' },
  { symbol: 'BTC-USD', name: 'Bitcoin', group: 'crypto' },
  { symbol: 'ETH-USD', name: 'Ethereum', group: 'crypto' },
  { symbol: 'EURUSD=X', name: 'EUR / USD', group: 'fx' },
  { symbol: 'USDPKR=X', name: 'USD / PKR', group: 'fx' },
  { symbol: 'GBPUSD=X', name: 'GBP / USD', group: 'fx' },
];

interface ChartResponse {
  chart: {
    result?: {
      meta: {
        currency?: string;
        symbol: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
      };
      indicators?: { quote?: { close?: (number | null)[] }[] };
    }[];
    error?: { description?: string } | null;
  };
}

async function quoteFor(item: WatchItem): Promise<Quote> {
  const empty: Quote = {
    symbol: item.symbol,
    name: item.name,
    group: item.group,
    price: null,
    prevClose: null,
    change: null,
    changePct: null,
    currency: null,
    series: [],
  };
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.symbol)}?range=1mo&interval=1d`;
    const data = await getJson<ChartResponse>(url, { timeoutMs: 7000 });
    const r = data.chart.result?.[0];
    if (!r) return empty;
    const closes = (r.indicators?.quote?.[0]?.close ?? []).filter((v): v is number => typeof v === 'number');
    const price = r.meta.regularMarketPrice ?? closes[closes.length - 1] ?? null;
    const prev = r.meta.chartPreviousClose ?? r.meta.previousClose ?? (closes.length > 1 ? closes[closes.length - 2] : null);
    const change = price !== null && prev !== null ? price - prev : null;
    return {
      ...empty,
      price,
      prevClose: prev,
      change,
      changePct: change !== null && prev ? (change / prev) * 100 : null,
      currency: r.meta.currency ?? null,
      series: closes.slice(-30),
    };
  } catch {
    return empty;
  }
}

export function getMarkets(items: WatchItem[] = DEFAULT_WATCHLIST): Promise<MarketsResponse> {
  const key = `markets:${items.map((i) => i.symbol).join(',')}`;
  return remember(key, 60e3, async () => {
    const quotes = await Promise.all(items.map(quoteFor));
    const live = quotes.filter((q) => q.price !== null).length;
    return {
      updatedAt: new Date().toISOString(),
      quotes,
      error: live === 0 ? 'No market quotes available right now' : undefined,
    };
  });
}
