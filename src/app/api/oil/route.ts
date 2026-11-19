import { getOilReserves } from '@server/lib/oil';
import { fail, handle, json, param } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/oil?iso3=SAU -> proved crude-oil reserves (US EIA, requires EIA_API_KEY)
export const GET = handle(async (req) => {
  const iso3 = param(req, 'iso3');
  if (!iso3 || !/^[A-Za-z]{3}$/.test(iso3)) return fail(400, 'iso3 must be an ISO alpha-3 code');
  return json(await getOilReserves(iso3), { maxAge: 86400, swr: 86400 });
});
