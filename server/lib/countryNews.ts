// Country-specific coverage from the GDELT 2.0 DOC API (public, keyless).
// Results are clustered exactly like the main feed so every story still carries
// its corroboration and factuality score.
import { getJson } from './http';
import { remember } from './cache';
import { buildStories, type RawArticle } from './story';
import { countryNameFor } from './countries';
import type { NewsResponse } from '../../shared/types';
import { domainStanding } from './standing';

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  sourcecountry?: string;
  language?: string;
}

function parseSeen(s: string): Date {
  // GDELT format: 20251119T120000Z
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) return new Date();
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

export function getCountryNews(iso3: string): Promise<NewsResponse> {
  const code = iso3.toUpperCase();
  return remember(`country-news:${code}`, 15 * 60e3, async () => {
    const name = countryNameFor(code);
    if (!name) return { updatedAt: new Date().toISOString(), stories: [], feeds: [] };
    const q = `"${name}" sourcelang:english`;
    const data = await getJson<{ articles?: GdeltArticle[] }>(
      `https://api.gdeltproject.org/api/v2/doc/doc?${new URLSearchParams({
        query: q,
        mode: 'ArtList',
        maxrecords: '60',
        timespan: '3d',
        format: 'json',
      })}`,
      { timeoutMs: 9000 },
    );
    const articles: RawArticle[] = (data.articles ?? [])
      .filter((a) => a.url && a.title)
      .map((a) => {
        const standing = domainStanding(a.domain);
        return {
          title: a.title,
          link: a.url,
          summary: '',
          publishedAt: parseSeen(a.seendate),
          outletName: standing.name ?? a.domain,
          domain: a.domain.replace(/^www\./, ''),
          outletCountry: standing.country,
          ownership: standing.ownership,
          standing: standing.standing,
          category: 'world',
        };
      });
    const stories = buildStories(articles);
    return {
      updatedAt: new Date().toISOString(),
      stories,
      feeds: [{ id: 'gdelt', name: 'GDELT DOC 2.0', ok: true, count: articles.length }],
    };
  });
}
