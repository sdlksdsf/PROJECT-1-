// Tiny per-instance TTL cache with in-flight de-duplication.
// Vercel's CDN (s-maxage) handles most caching; this protects upstream APIs
// when a warm function instance receives bursts of requests.

interface Entry<T> {
  value?: T;
  expires: number;
  pending?: Promise<T>;
}

const store = new Map<string, Entry<unknown>>();

export async function remember<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.value !== undefined && hit.expires > now) return hit.value;
  if (hit?.pending) return hit.pending;

  const entry: Entry<T> = { value: hit?.value, expires: hit?.expires ?? 0 };
  entry.pending = load()
    .then((value) => {
      entry.value = value;
      entry.expires = Date.now() + ttlMs;
      return value;
    })
    .catch((err) => {
      // Serve the last good value (even if expired) when upstream fails.
      if (entry.value !== undefined) return entry.value;
      throw err;
    })
    .finally(() => {
      entry.pending = undefined;
    });
  store.set(key, entry as Entry<unknown>);
  return entry.pending;
}
