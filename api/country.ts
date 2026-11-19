import { getCountry } from '../server/lib/country';
import { qs, safeHandler, sendError, sendJson } from '../server/lib/http';

// GET /api/country?iso3=PAK -> profile, indicators and current leaders
export default safeHandler(async (req, res) => {
  const iso3 = qs(req, 'iso3');
  if (!iso3 || !/^[A-Za-z]{3}$/.test(iso3)) return sendError(res, 400, 'iso3 must be an ISO alpha-3 code');
  const data = await getCountry(iso3);
  sendJson(res, data, { maxAge: 3600, swr: 21600 });
});
