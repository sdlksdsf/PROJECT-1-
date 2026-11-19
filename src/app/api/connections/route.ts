import { oagConnections } from '@server/lib/oag';
import { fail, handle, json, param } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/connections?from=LHR&to=ATH&date=2026-11-20 -> onward connection options (requires OAG_CONNECTIONS_KEY)
export const GET = handle(async (req) => {
  const from = (param(req, 'from') ?? '').toUpperCase();
  const to = (param(req, 'to') ?? '').toUpperCase();
  const date = param(req, 'date') ?? new Date().toISOString().slice(0, 10);
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return fail(400, 'from and to must be 3-letter IATA airport codes');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, 'date must be YYYY-MM-DD');
  return json(await oagConnections(from, to, date), { maxAge: 3600, swr: 6 * 3600 });
});
