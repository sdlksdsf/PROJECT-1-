// Small HTTP helpers shared by every Next.js route handler in src/app/api.
// Web-standard Request/Response only, so the same code runs on Vercel and locally.

export const USER_AGENT = 'UnbiasedStats/1.0 (public news & data dashboard)';

export class UpstreamError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
}

export async function fetchWithTimeout(url: string, opts: FetchOptions = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    return await fetch(url, {
      method: opts.method ?? 'GET',
      body: opts.body,
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'user-agent': USER_AGENT, accept: '*/*', ...(opts.headers ?? {}) },
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timed out' : 'network error';
    throw new UpstreamError(`${hostOf(url)} ${reason}`, 504);
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetchWithTimeout(url, {
    ...opts,
    headers: { accept: 'application/json', ...(opts.headers ?? {}) },
  });
  if (!res.ok) throw new UpstreamError(`${hostOf(url)} responded ${res.status}`, res.status >= 500 ? 502 : res.status);
  return (await res.json()) as T;
}

export async function getText(url: string, opts: FetchOptions = {}): Promise<string> {
  const res = await fetchWithTimeout(url, opts);
  if (!res.ok) throw new UpstreamError(`${hostOf(url)} responded ${res.status}`, res.status >= 500 ? 502 : res.status);
  return res.text();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'upstream';
  }
}

export interface CachePolicy {
  /** CDN / shared cache lifetime in seconds. */
  maxAge: number;
  /** How long a stale copy may be served while revalidating. */
  swr: number;
}

export function json(body: unknown, cache: CachePolicy = { maxAge: 60, swr: 300 }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, s-maxage=${cache.maxAge}, stale-while-revalidate=${cache.swr}`,
    },
  });
}

export function fail(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

/** Reads a trimmed, non-empty query parameter. */
export function param(req: Request, key: string): string | undefined {
  const s = new URL(req.url).searchParams.get(key)?.trim();
  return s ? s : undefined;
}

export type Handler = (req: Request) => Promise<Response>;

/** Wraps a handler so unexpected errors come back as JSON instead of an HTML 500 page. */
export function handle(fn: Handler): Handler {
  return async (req) => {
    try {
      return await fn(req);
    } catch (err) {
      const status = err instanceof UpstreamError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'Unexpected error';
      return fail(status, message);
    }
  };
}
