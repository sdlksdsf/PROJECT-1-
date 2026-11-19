// Thin fetch wrapper for the /api functions. All calls are same-origin (no CORS, no keys in the browser).
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { accept: 'application/json' } });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}
