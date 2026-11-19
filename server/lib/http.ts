// Small HTTP helpers shared by every Vercel function in api/.
// Kept dependency-free so the functions stay fast to cold-start.

export const USER_AGENT =
  'UnbiasedStats/1.0 (+https://unbiased-stats.vercel.app; public news & data dashboard)';

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
  method?: 'GET' | 'POST' | 'PATCH';
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

/** Minimal shape of the Vercel request/response objects we use (works for the dev shim too). */
export interface ApiRequest {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
}
export interface ApiResponse {
  setHeader(name: string, value: string): unknown;
  status(code: number): ApiResponse;
  send(body: string): unknown;
  end(body?: string): unknown;
}

export function qs(req: ApiRequest, key: string): string | undefined {
  const v = req.query?.[key];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim() !== '' ? s.trim() : undefined;
}

export function rejectIfNotGet(req: ApiRequest, res: ApiResponse): boolean {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(405).send(JSON.stringify({ error: 'Method not allowed' }));
    return true;
  }
  return false;
}

export interface CachePolicy {
  /** CDN / shared cache lifetime in seconds. */
  maxAge: number;
  /** How long a stale copy may be served while revalidating. */
  swr: number;
}

export function sendJson(res: ApiResponse, body: unknown, cache: CachePolicy = { maxAge: 60, swr: 300 }): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', `public, s-maxage=${cache.maxAge}, stale-while-revalidate=${cache.swr}`);
  res.status(200).send(JSON.stringify(body));
}

export function sendError(res: ApiResponse, status: number, message: string): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify({ error: message }));
}

/** Wraps a handler so unexpected errors come back as JSON instead of an HTML 500 page. */
export function safeHandler(
  fn: (req: ApiRequest, res: ApiResponse) => Promise<void>,
): (req: ApiRequest, res: ApiResponse) => Promise<void> {
  return async (req, res) => {
    if (rejectIfNotGet(req, res)) return;
    try {
      await fn(req, res);
    } catch (err) {
      const status = err instanceof UpstreamError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'Unexpected error';
      sendError(res, status, message);
    }
  };
}
