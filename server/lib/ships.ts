// Live ship positions from AISStream.io. The API key stays on the server (AISSTREAM_API_KEY).
// AISStream is WebSocket-only, so each refresh opens the socket for a short window, collects
// position reports, and closes it. The result is cached, so the upstream is hit at most once a minute.
import { remember } from './cache';
import { UpstreamError } from './http';
import type { ShipPoint, ShipsResponse } from '../../shared/types';

const WINDOW_MS = 10_000;
const MAX_SHIPS = 2500;
const URL = 'wss://stream.aisstream.io/v0/stream';

export function getShips(): Promise<ShipsResponse> {
  const key = process.env.AISSTREAM_API_KEY;
  if (!key) {
    return Promise.resolve({
      configured: false,
      updatedAt: new Date().toISOString(),
      ships: [],
      message: 'Ship tracking needs a free AISStream.io key. Add AISSTREAM_API_KEY on the server and redeploy.',
    });
  }
  return remember('ships', 60e3, () => collect(key));
}

function collect(key: string): Promise<ShipsResponse> {
  return new Promise((resolve, reject) => {
    const ships = new Map<string, ShipPoint>();
    let settled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(URL);
    } catch {
      reject(new UpstreamError('stream.aisstream.io connection failed', 502));
      return;
    }

    let lastError: string | null = null;
    let frames = 0;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      if (ships.size === 0 && (err || lastError)) {
        reject(err ?? new UpstreamError(`AISStream: ${lastError}`, 502));
        return;
      }
      const note =
        ships.size > 0
          ? undefined
          : frames === 0
            ? `Connected to AISStream but it sent no messages in ${WINDOW_MS / 1000} s.`
            : `AISStream sent ${frames} messages, none with a usable position, in ${WINDOW_MS / 1000} s.`;
      resolve({ configured: true, updatedAt: new Date().toISOString(), ships: [...ships.values()], note });
    };

    const timer = setTimeout(() => finish(), WINDOW_MS + 2000);

    ws.onopen = () => {
      // AISStream expects the subscription within 3 seconds of connecting.
      ws.send(
        JSON.stringify({
          APIKey: key,
          BoundingBoxes: [
            [
              [-90, -180],
              [90, 180],
            ],
          ],
          FilterMessageTypes: ['PositionReport'],
        }),
      );
      setTimeout(() => finish(), WINDOW_MS);
    };

    ws.onmessage = (ev: MessageEvent) => {
      frames++;
      try {
        const msg = JSON.parse(String(ev.data)) as {
          MessageType?: string;
          error?: string;
          MetaData?: { MMSI?: number; ShipName?: string; latitude?: number; longitude?: number };
          Message?: { PositionReport?: { UserID?: number; Latitude?: number; Longitude?: number; Sog?: number; Cog?: number } };
        };
        if (msg.error) {
          lastError = msg.error;
          return;
        }
        if (msg.MessageType !== 'PositionReport') return;
        const p = msg.Message?.PositionReport;
        const meta = msg.MetaData;
        const lat = p?.Latitude ?? meta?.latitude;
        const lng = p?.Longitude ?? meta?.longitude;
        // 91 / 181 are AIS "not available" sentinels.
        if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
        const mmsi = String(meta?.MMSI ?? p?.UserID ?? '');
        if (!mmsi) return;
        ships.set(mmsi, {
          mmsi,
          name: (meta?.ShipName ?? '').trim() || `MMSI ${mmsi}`,
          lat,
          lng,
          sog: typeof p?.Sog === 'number' ? p.Sog : null,
          cog: typeof p?.Cog === 'number' ? p.Cog : null,
        });
        if (ships.size >= MAX_SHIPS) finish();
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onerror = () => finish(new UpstreamError('stream.aisstream.io error', 502));
    ws.onclose = () => finish(new UpstreamError('stream.aisstream.io closed before data arrived', 502));
  });
}
