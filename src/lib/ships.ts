// Live ship positions from AISStream.io (free key, WebSocket). Only active when
// VITE_AISSTREAM_API_KEY is set at build time. The key is public by design for browser streams.
import { useEffect, useState } from 'react';

export interface ShipPoint {
  mmsi: string;
  name: string;
  lat: number;
  lng: number;
  sog: number | null; // speed over ground, knots
  cog: number | null; // course over ground, degrees
}

export type ShipStatus = 'off' | 'no-key' | 'connecting' | 'live' | 'error';

const MAX_SHIPS = 2500;
const KEY = import.meta.env.VITE_AISSTREAM_API_KEY as string | undefined;

export function useShips(enabled: boolean): { ships: ShipPoint[]; status: ShipStatus } {
  const [ships, setShips] = useState<ShipPoint[]>([]);
  const [status, setStatus] = useState<ShipStatus>('off');

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return;
    }
    if (!KEY) {
      setStatus('no-key');
      return;
    }
    const byMmsi = new Map<string, ShipPoint>();
    let ws: WebSocket | null = null;
    let closed = false;
    setStatus('connecting');

    const flush = window.setInterval(() => {
      setShips(Array.from(byMmsi.values()));
    }, 2000);

    try {
      ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
      ws.onopen = () => {
        ws?.send(
          JSON.stringify({
            APIKey: KEY,
            BoundingBoxes: [[[-90, -180], [90, 180]]],
            FilterMessageTypes: ['PositionReport'],
          }),
        );
        setStatus('live');
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as {
            MetaData?: { MMSI?: number; ShipName?: string; latitude?: number; longitude?: number };
            Message?: { PositionReport?: { Latitude?: number; Longitude?: number; Sog?: number; Cog?: number } };
          };
          const meta = msg.MetaData;
          const pos = msg.Message?.PositionReport;
          const lat = pos?.Latitude ?? meta?.latitude;
          const lng = pos?.Longitude ?? meta?.longitude;
          if (meta?.MMSI === undefined || typeof lat !== 'number' || typeof lng !== 'number') return;
          if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
          const id = String(meta.MMSI);
          if (byMmsi.size >= MAX_SHIPS && !byMmsi.has(id)) {
            byMmsi.delete(byMmsi.keys().next().value as string);
          }
          byMmsi.set(id, {
            mmsi: id,
            name: (meta.ShipName ?? '').trim() || `MMSI ${id}`,
            lat,
            lng,
            sog: pos?.Sog ?? null,
            cog: pos?.Cog ?? null,
          });
        } catch {
          // ignore malformed frames
        }
      };
      ws.onerror = () => {
        if (!closed) setStatus('error');
      };
      ws.onclose = () => {
        if (!closed) setStatus('error');
      };
    } catch {
      setStatus('error');
    }

    return () => {
      closed = true;
      window.clearInterval(flush);
      ws?.close();
      setShips([]);
    };
  }, [enabled]);

  return { ships, status };
}
