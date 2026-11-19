// Supabase (PostgREST) access without the full SDK. Server-side only: the
// service-role key must never reach the browser.
import { fetchWithTimeout, UpstreamError } from './http';

export interface DbConfig {
  url: string;
  key: string;
}

export function dbConfig(): DbConfig | null {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function headers(cfg: DbConfig, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: cfg.key,
    authorization: `Bearer ${cfg.key}`,
    'content-type': 'application/json',
    ...extra,
  };
}

export async function dbSelect<T>(cfg: DbConfig, path: string): Promise<T[]> {
  const res = await fetchWithTimeout(`${cfg.url}/rest/v1/${path}`, {
    timeoutMs: 6000,
    headers: headers(cfg, { accept: 'application/json' }),
  });
  if (!res.ok) throw new UpstreamError(`database responded ${res.status}`, 502);
  return (await res.json()) as T[];
}

export async function dbUpsert(cfg: DbConfig, table: string, rows: unknown[], onConflict: string): Promise<void> {
  if (rows.length === 0) return;
  const res = await fetchWithTimeout(`${cfg.url}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    timeoutMs: 8000,
    body: JSON.stringify(rows),
    headers: headers(cfg, { prefer: 'resolution=merge-duplicates,return=minimal' }),
  });
  if (!res.ok) throw new UpstreamError(`database upsert into ${table} failed (${res.status})`, 502);
}
