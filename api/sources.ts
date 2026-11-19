import { dbConfig, dbSelect } from '../server/lib/db';
import { safeHandler, sendJson } from '../server/lib/http';
import { FEEDS } from '../server/lib/feeds';
import type { SourceRating } from '../shared/types';

// GET /api/sources -> outlet registry used for editorial-standing grades.
// Uses the `source_ratings` table when the database is configured, otherwise the code defaults.
export default safeHandler(async (_req, res) => {
  const cfg = dbConfig();
  if (cfg) {
    try {
      const rows = await dbSelect<{
        id: string;
        name: string;
        domain: string;
        country: string;
        standing: 'A' | 'B' | 'C';
        ownership: string | null;
        category: SourceRating['category'];
      }>(cfg, 'source_ratings?select=*&order=name.asc');
      if (rows.length > 0) {
        return sendJson(
          res,
          { sources: rows.map((r) => ({ ...r, source: 'database' as const })) },
          { maxAge: 900, swr: 3600 },
        );
      }
    } catch {
      // fall through to defaults
    }
  }
  const sources: SourceRating[] = FEEDS.map((f) => ({
    id: f.id,
    name: f.name,
    domain: f.domain,
    country: f.country,
    standing: f.standing,
    ownership: f.ownership,
    category: f.category,
    source: 'defaults' as const,
  }));
  sendJson(res, { sources }, { maxAge: 900, swr: 3600 });
});
