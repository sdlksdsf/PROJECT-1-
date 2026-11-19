import { useEffect, useState } from 'react';
import { apiGet } from './api';

interface ResourceState {
  error: string | null;
  loading: boolean;
  version: number;
}

// Module-level cache keyed by URL. It is the single source of truth for data, so a hook never
// shows data from a previous URL (for example, the previous country) while the new one loads.
const cache = new Map<string, unknown>();

/**
 * Fetches a /api endpoint, re-fetches every `refreshMs` while the tab is visible,
 * and cancels in-flight requests when the URL changes or the component unmounts.
 */
export function useResource<T>(url: string | null, refreshMs = 0): {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
} {
  const [state, setState] = useState<ResourceState>({ error: null, loading: Boolean(url), version: 0 });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) {
      setState({ error: null, loading: false, version: 0 });
      return;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, error: null, loading: true }));
    apiGet<T>(url, controller.signal)
      .then((data) => {
        cache.set(url, data);
        setState((s) => ({ error: null, loading: false, version: s.version + 1 }));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Failed to load';
        setState((s) => ({ ...s, error: message, loading: false }));
      });
    return () => controller.abort();
  }, [url, tick]);

  useEffect(() => {
    if (!refreshMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1);
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);

  return {
    data: url ? ((cache.get(url) as T | undefined) ?? null) : null,
    error: state.error,
    loading: state.loading,
    reload: () => setTick((t) => t + 1),
  };
}
