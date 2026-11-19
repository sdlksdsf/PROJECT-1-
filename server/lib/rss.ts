// RSS 2.0, Atom and RDF (RSS 1.0) parser built on fast-xml-parser.
import { XMLParser } from 'fast-xml-parser';

export interface ParsedEntry {
  title: string;
  link: string;
  summary: string;
  published: Date | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true, // dc:date -> date, content:encoded -> encoded
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
});

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('#text' in o) return text(o['#text']);
    if ('@_href' in o) return String(o['@_href']);
  }
  return '';
}

export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function toDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseFeed(xml: string): ParsedEntry[] {
  const doc = parser.parse(xml) as Record<string, any>;
  let raw: any[] = [];

  if (doc.rss) {
    raw = asArray(doc.rss.channel).flatMap((c: any) => asArray(c.item));
  } else if (doc.feed) {
    raw = asArray(doc.feed.entry);
  } else if (doc.RDF) {
    raw = asArray(doc.RDF.item);
  } else {
    return [];
  }

  const out: ParsedEntry[] = [];
  for (const it of raw) {
    const title = stripHtml(text(it.title));
    if (!title) continue;
    const linkCandidates = asArray(it.link).map(text).filter(Boolean);
    const link =
      linkCandidates.find((l) => /^https?:\/\//.test(l)) ??
      (typeof it.link === 'object' && it.link && '@_href' in it.link ? String(it.link['@_href']) : '') ??
      text(it.guid);
    if (!/^https?:\/\//.test(link)) continue;
    const summary = stripHtml(text(it.description) || text(it.summary) || text(it.encoded) || text(it.content));
    const published = toDate(text(it.pubDate) || text(it.published) || text(it.updated) || text(it.date));
    out.push({ title, link, summary: summary.slice(0, 400), published });
  }
  return out;
}
