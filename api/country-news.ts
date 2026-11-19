import { qs, safeHandler, sendError, sendJson, UpstreamError } from '../server/lib/http';
import { getCountryNews } from '../server/lib/countryNews';

// GET /api/country-news?iso3=PAK
export default safeHandler(async (req, res) => {
  const iso3 = qs(req, 'iso3');
  if (!iso3 || !/^[A-Za-z]{3}$/.test(iso3)) return sendError(res, 400, 'iso3 must be an ISO alpha-3 code');
  const data = await getCountryNews(iso3);
  if (!data) throw new UpstreamError('No country news', 502);
  sendJson(res, data, { maxAge: 600, swr: 1200 });
});
