import { DEFAULT_WATCHLIST, getMarkets, type WatchItem } from '../server/lib/markets';
import { qs, safeHandler, sendError, sendJson } from '../server/lib/http';

// GET /api/markets                  -> default watchlist
// GET /api/markets?symbols=AAPL,^GSPC -> custom symbols (max 40)
export default safeHandler(async (req, res) => {
  const raw = qs(req, 'symbols');
  let items: WatchItem[] = DEFAULT_WATCHLIST;
  if (raw) {
    const symbols = raw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z0-9^=.\-]{1,15}$/.test(s))
      .slice(0, 40);
    if (symbols.length === 0) return sendError(res, 400, 'No valid symbols supplied');
    items = symbols.map((symbol) => {
      const known = DEFAULT_WATCHLIST.find((w) => w.symbol === symbol);
      return known ?? { symbol, name: symbol, group: 'stock' as const };
    });
  }
  const data = await getMarkets(items);
  sendJson(res, data, { maxAge: 60, swr: 120 });
});
