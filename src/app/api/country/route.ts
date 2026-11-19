import { getCountry } from '@server/lib/country';
import { fail, handle, json, param } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/country?iso3=PAK -> profile, indicators and current leaders
export const GET = handle(async (req) => {
  const iso3 = param(req, 'iso3');
  if (!iso3 || !/^[A-Za-z]{3}$/.test(iso3)) return fail(400, 'iso3 must be an ISO alpha-3 code');
  return json(await getCountry(iso3), { maxAge: 3600, swr: 21600 });
});
