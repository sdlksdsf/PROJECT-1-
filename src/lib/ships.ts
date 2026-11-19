// Ship positions come from our own /api/ships (AISStream key stays on the server).
// The endpoint listens to AISStream for about 10 seconds and caches the result, so the browser polls once a minute.
import { useEffect, useState } from 'react';
import type { ShipPoint, ShipsResponse } from '../../shared/types';
import { apiGet } from './api';

export type { ShipPoint };
export type ShipStatus = 'off' | 'no-key' | 'connecting' | 'live' | 'error';

const REFRESH_MS = 60_000;

export function useShips(enabled: boolean): { ships: ShipPoint[]; status: ShipStatus } {
  const [state, setState] = useState<{ ships: ShipPoint[]; status: ShipStatus }>({ ships: [], status: 'off' });

  useEffect(() => {
    if (!enabled) {
      setState({ ships: [], status: 'off' });
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    const load = () => {
      apiGet<ShipsResponse>('/api/ships')
        .then((r) => {
          if (cancelled) return;
          setState(r.configured ? { ships: r.ships, status: 'live' } : { ships: [], status: 'no-key' });
        })
        .catch(() => {
          if (!cancelled) setState((s) => ({ ...s, status: 'error' }));
        })
        .finally(() => {
          if (!cancelled) timer = window.setTimeout(load, REFRESH_MS);
        });
    };

    setState((s) => ({ ...s, status: 'connecting' }));
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled]);

  return state;
}
