import { getDisasters } from '../server/lib/disasters';
import { safeHandler, sendJson } from '../server/lib/http';

// GET /api/disasters -> USGS earthquakes (24h, M2.5+) and NASA EONET open natural events
export default safeHandler(async (_req, res) => {
  const data = await getDisasters();
  sendJson(res, data, { maxAge: 120, swr: 300 });
});
