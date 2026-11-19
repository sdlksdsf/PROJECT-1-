import { getCountryNews } from '@server/lib/countryNews';
import { fail, handle, json, param, UpstreamError } from '@server/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/country-news?iso3=PAK
export const GET = handle(async (req) => {
  const iso3 = param(req, 'iso3');
  if (!iso3 || !/^[A-Za-z]{3}$/.test(iso3)) return fail(400, 'iso3 must be an ISO alpha-3 code');
  const data = await getCountryNews(iso3);
  if (!data) throw new UpstreamError('No country news', 502);
  return json(data, { maxAge: 600, swr: 1200 });
});
