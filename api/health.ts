import { dbConfig } from '../server/lib/db';
import { safeHandler, sendJson } from '../server/lib/http';
import type { HealthResponse } from '../shared/types';

// GET /api/health -> which optional services are configured on this deployment
export default safeHandler(async (_req, res) => {
  const body: HealthResponse = {
    ok: true,
    time: new Date().toISOString(),
    services: {
      database: dbConfig() !== null,
      cameras: Boolean(process.env.WINDY_API_KEY),
    },
  };
  sendJson(res, body, { maxAge: 30, swr: 60 });
});
