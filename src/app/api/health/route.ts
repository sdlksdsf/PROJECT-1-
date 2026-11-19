import { dbConfig } from '@server/lib/db';
import { handle, json } from '@server/lib/http';
import type { HealthResponse } from '@shared/types';

export const dynamic = 'force-dynamic';

// GET /api/health -> which optional services are configured on this deployment
export const GET = handle(async () => {
  const body: HealthResponse = {
    ok: true,
    time: new Date().toISOString(),
    services: {
      database: dbConfig() !== null,
      cameras: Boolean(process.env.WINDY_API_KEY || process.env.WEBCAMDB_API_KEY),
      ships: Boolean(process.env.AISSTREAM_API_KEY),
      oil: true,
      flights: Boolean(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET),
      weather: Boolean(process.env.OPENWEATHER_API_KEY),
      flightStatus: Boolean(process.env.OAG_FLIGHT_INFO_KEY || process.env.AVIATIONSTACK_API_KEY),
      connections: Boolean(process.env.OAG_CONNECTIONS_KEY),
    },
  };
  return json(body, { maxAge: 30, swr: 60 });
});
