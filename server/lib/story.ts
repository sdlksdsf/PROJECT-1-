// Pure story-level logic: groups articles that describe the same event across
// outlets and computes a transparent factuality heuristic. No I/O here, so it can be
// unit-tested offline (see scripts/test-story.ts).
import type { Category, Factuality, Outlet, Standing, Story } from '../../shared/types';
import { detectCountries } from './countries';

export interface RawArticle {
  title: string;
  link: string;
  summary: string;
  publishedAt: Date;
  outletName: string;
  domain: string;
  outletCountry: string;
  ownership: string | null;
  standing: Standing;
  category: Category;
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'has', 'had', 'was', 'were', 'are', 'will',
  'its', 'into', 'after', 'over', 'about', 'their', 'they', 'you', 'your', 'new', 'says', 'said', 'say',
  'amid', 'how', 'why', 'what', 'who', 'when', 'where', 'more', 'than', 'first', 'also', 'not', 'but',
  'out', 'can', 'could', 'would', 'back', 'just', 'week', 'year', 'today', 'live', 'update', 'latest',
  'news', 'report', 'reports', 'hits', 'set', 'his', 'her', 'him', 'she', 'he', 'off', 'top', 'all',
  'one', 'two', 'three', 'get', 'gets', 'make', 'makes', 'take', 'takes', 'show', 'shows', 'after',
  'before', 'could', 'may', 'might', 'must', 'use', 'uses', 'via', 'per', 'our', 'out', 'see', 'much',
]);

const STANDING_WEIGHT: Record<Standing, number> = { A: 1, B: 0.75, C: 0.5 };
const CLUSTER_WINDOW_MS = 36 * 3600e3;
const SIMILARITY_MIN = 0.34;
const MIN_SHARED_TOKENS = 3;

export function tokenize(title: string): Set<string> {
  const norm = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
  const out = new Set<string>();
  for (const w of norm.split(/\s+/)) {
    if (w.length >= 3 && !STOP.has(w)) out.add(w);
  }
  return out;
}

/** Jaccard similarity with a minimum-shared-token guard so short headlines don't cluster by accident. */
export function similarity(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  if (inter < MIN_SHARED_TOKENS) return 0;
  return inter / (a.size + b.size - inter);
}

interface Cluster {
  tokens: Set<string>;
  members: RawArticle[];
  newestMs: number;
}

export function clusterArticles(articles: RawArticle[]): Cluster[] {
  const sorted = [...articles].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const clusters: Cluster[] = [];
  for (const art of sorted) {
    const toks = tokenize(art.title);
    const ts = art.publishedAt.getTime();
    let best: Cluster | null = null;
    let bestSim = 0;
    for (const c of clusters) {
      if (Math.abs(c.newestMs - ts) > CLUSTER_WINDOW_MS) continue;
      const sim = similarity(toks, c.tokens);
      if (sim >= SIMILARITY_MIN && sim > bestSim) {
        best = c;
        bestSim = sim;
      }
    }
    if (best) {
      best.members.push(art);
    } else {
      clusters.push({ tokens: toks, members: [art], newestMs: ts });
    }
  }
  return clusters;
}

function ageLabel(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}

/**
 * Factuality heuristic (0-100). It measures how well a story is *corroborated*,
 * not whether it is true:
 *  - 50%: independent outlets (distinct domains) reporting the same event, capped at 4
 *  - 30%: average editorial standing of those outlets (A=1, B=0.75, C=0.5)
 *  - 20%: freshness (full marks within 12 h, fading to 0 by ~72 h)
 */
export function factualityFor(outletCount: number, avgStanding: number, ageHours: number): Factuality {
  const corroborationFactor = Math.min(outletCount, 4) / 4;
  const recencyFactor = ageHours <= 12 ? 1 : Math.max(0, 1 - (ageHours - 12) / 60);
  const score = Math.round(100 * (0.5 * corroborationFactor + 0.3 * avgStanding + 0.2 * recencyFactor));

  let label: string;
  let tone: Factuality['tone'];
  if (outletCount >= 3) {
    label = `Corroborated by ${outletCount} outlets`;
    tone = 'high';
  } else if (outletCount === 2) {
    label = 'Confirmed by 2 outlets';
    tone = 'medium';
  } else {
    label = 'Single outlet: verify before sharing';
    tone = 'low';
  }

  const grade = avgStanding >= 0.9 ? 'A' : avgStanding >= 0.6 ? 'B' : 'C';
  const reasons = [
    `${outletCount} independent outlet${outletCount === 1 ? '' : 's'} reporting`,
    `Average outlet standing: ${grade}`,
    `Latest report ${ageLabel(ageHours)} ago`,
  ];
  return { score, label, tone, reasons };
}

function hashId(input: string): string {
  // FNV-1a 32-bit: stable, dependency-free identifier.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function buildStories(articles: RawArticle[], nowMs = Date.now()): Story[] {
  const clusters = clusterArticles(articles);
  const stories: Story[] = [];

  for (const c of clusters) {
    // One outlet per domain; keep the most authoritative (then most recent) report.
    const byDomain = new Map<string, RawArticle>();
    const ranked = [...c.members].sort(
      (a, b) =>
        STANDING_WEIGHT[b.standing] - STANDING_WEIGHT[a.standing] ||
        b.publishedAt.getTime() - a.publishedAt.getTime(),
    );
    for (const m of ranked) if (!byDomain.has(m.domain)) byDomain.set(m.domain, m);
    const reps = [...byDomain.values()];

    const outlets: Outlet[] = reps.map((m) => ({
      id: hashId(m.link),
      name: m.outletName,
      domain: m.domain,
      link: m.link,
      title: m.title,
      publishedAt: m.publishedAt.toISOString(),
      standing: m.standing,
      outletCountry: m.outletCountry,
      ownership: m.ownership,
    }));

    const primary = reps[0];
    const newest = Math.max(...reps.map((m) => m.publishedAt.getTime()));
    const ageHours = Math.max(0, (nowMs - newest) / 3600e3);
    const avgStanding = reps.reduce((s, m) => s + STANDING_WEIGHT[m.standing], 0) / reps.length;
    const corroboration = reps.length;

    // Category: most common across outlets, ties broken by primary article.
    const counts = new Map<Category, number>();
    for (const m of reps) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
    let category: Category = primary.category;
    let best = -1;
    for (const [cat, n] of counts) {
      if (n > best) {
        best = n;
        category = cat;
      }
    }

    const countryHits = new Set<string>();
    for (const m of reps) for (const iso of detectCountries(`${m.title} ${m.summary}`)) countryHits.add(iso);

    const outletCountries = [...new Set(reps.map((m) => m.outletCountry).filter(Boolean))];

    stories.push({
      id: hashId(primary.link),
      title: primary.title,
      summary: primary.summary,
      link: primary.link,
      category,
      publishedAt: new Date(newest).toISOString(),
      ageHours: Math.round(ageHours * 10) / 10,
      breaking: (corroboration >= 2 && ageHours <= 6) || (corroboration >= 3 && ageHours <= 12),
      outlets,
      outletCountries,
      corroboration,
      countries: [...countryHits],
      factuality: factualityFor(corroboration, avgStanding, ageHours),
    });
  }

  return stories.sort((a, b) => {
    if (a.breaking !== b.breaking) return a.breaking ? -1 : 1;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}
