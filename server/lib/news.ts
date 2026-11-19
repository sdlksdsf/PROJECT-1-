// News pipeline: fetch every configured feed in parallel, tolerate individual failures,
// cluster the articles into stories, and optionally archive them to Supabase.
import { FEEDS, type FeedDef } from './feeds';
import { fetchWithTimeout } from './http';
import { parseFeed } from './rss';
import { buildStories, type RawArticle } from './story';
import { dbConfig, dbUpsert } from './db';
import { remember } from './cache';
import type { FeedStatus, NewsResponse, Story } from '../../shared/types';

const MAX_AGE_MS = 72 * 3600e3;

async function loadFeed(feed: FeedDef): Promise<{ status: FeedStatus; articles: RawArticle[] }> {
  try {
    const res = await fetchWithTimeout(feed.url, {
      timeoutMs: 7000,
      headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const entries = parseFeed(await res.text());
    const articles: RawArticle[] = entries
      .filter((e) => e.published && Date.now() - e.published.getTime() <= MAX_AGE_MS)
      .map((e) => ({
        title: e.title,
        link: e.link,
        summary: e.summary,
        publishedAt: e.published as Date,
        outletName: feed.name,
        domain: feed.domain,
        outletCountry: feed.country,
        ownership: feed.ownership,
        standing: feed.standing,
        category: feed.category,
      }));
    return { status: { id: feed.id, name: feed.name, ok: true, count: articles.length }, articles };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    return { status: { id: feed.id, name: feed.name, ok: false, count: 0, error: message }, articles: [] };
  }
}

async function archive(stories: Story[]): Promise<void> {
  const cfg = dbConfig();
  if (!cfg) return;
  const rows = stories.flatMap((s) =>
    s.outlets.map((o) => ({
      id: o.id,
      title: o.title,
      link: o.link,
      summary: s.summary.slice(0, 300),
      source_name: o.name,
      source_domain: o.domain,
      standing: o.standing,
      category: s.category,
      published_at: o.publishedAt,
      story_id: s.id,
      corroboration: s.corroboration,
      factuality_score: s.factuality.score,
      countries: s.countries,
    })),
  );
  try {
    await dbUpsert(cfg, 'news_items', rows.slice(0, 500), 'id');
  } catch (err) {
    console.warn('archive failed', err);
  }
}

/** Builds the full news payload. Cached per warm instance for 3 minutes. */
export function getNews(): Promise<NewsResponse> {
  return remember('news', 3 * 60e3, async () => {
    const results = await Promise.all(FEEDS.map(loadFeed));
    const articles = results.flatMap((r) => r.articles);
    const stories = buildStories(articles);
    const ok = results.filter((r) => r.status.ok).length;
    if (ok === 0) throw new Error('All news feeds are unreachable right now');
    await archive(stories.slice(0, 200));
    return {
      updatedAt: new Date().toISOString(),
      stories,
      feeds: results.map((r) => r.status),
    };
  });
}
