import { dbConfig, dbSelect } from '@server/lib/db';
import { fail, handle, json, param } from '@server/lib/http';
import type { ArchiveItem } from '@shared/types';

export const dynamic = 'force-dynamic';

// GET /api/archive?q=ukraine&days=30&limit=50
// Searches the Supabase news archive written by /api/news (research & journalism use).
export const GET = handle(async (req) => {
  const cfg = dbConfig();
  if (!cfg) return fail(503, 'The news archive database is not configured yet.');
  const rawQ = param(req, 'q') ?? '';
  const q = rawQ.replace(/[*%,()"'\\]/g, '').slice(0, 80);
  const days = Math.min(Math.max(Number(param(req, 'days') ?? 30) || 30, 1), 365);
  const limit = Math.min(Math.max(Number(param(req, 'limit') ?? 50) || 50, 1), 200);
  const since = new Date(Date.now() - days * 86400e3).toISOString();

  const params = new URLSearchParams({
    select: 'id,title,link,source_name,published_at,standing,factuality_score,category',
    published_at: `gte.${since}`,
    order: 'published_at.desc',
    limit: String(limit),
  });
  if (q) params.set('title', `ilike.*${q}*`);
  const rows = await dbSelect<ArchiveItem>(cfg, `news_items?${params.toString()}`);
  return json({ count: rows.length, items: rows }, { maxAge: 120, swr: 300 });
});
