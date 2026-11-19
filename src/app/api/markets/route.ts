import { DEFAULT_WATCHLIST, getMarkets, type WatchItem } from '@server/lib/markets';
import { fail, handle, json, param } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/markets                    -> default watchlist
// GET /api/markets?symbols=AAPL,^GSPC -> custom symbols (max 40)
export const GET = handle(async (req) => {
  const raw = param(req, 'symbols');
  let items: WatchItem[] = DEFAULT_WATCHLIST;
  if (raw) {
    const symbols = raw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z0-9^=.\-]{1,15}$/.test(s))
      .slice(0, 40);
    if (symbols.length === 0) return fail(400, 'No valid symbols supplied');
    items = symbols.map((symbol) => {
      const known = DEFAULT_WATCHLIST.find((w) => w.symbol === symbol);
      return known ?? { symbol, name: symbol, group: 'stock' as const };
    });
  }
  return json(await getMarkets(items), { maxAge: 60, swr: 120 });
});
