// AI brief of the top stories. Uses OpenRouter (free models are available) with the key kept in
// OPENROUTER_API_KEY on the server. Without the key this returns configured:false and the UI stays
// neutral. Every brief cites the stories it used, and the output is labelled as AI-generated.
import { fetchWithTimeout, UpstreamError } from './http';
import { remember } from './cache';
import { getNews } from './news';
import type { InsightsResponse, NewsResponse, Story } from '../../shared/types';


const MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
const MAX_STORIES = 20;

function pick(stories: Story[]): Story[] {
  // Most corroborated first, then the newest.
  return [...stories]
    .sort((a, b) => b.corroboration - a.corroboration || a.ageHours - b.ageHours)
    .slice(0, MAX_STORIES);
}

function promptFor(stories: Story[]): string {
  const lines = stories.map((s, i) => `[${i + 1}] (${s.category}, ${s.outlets.length} outlets, ${Math.round(s.ageHours)}h ago) ${s.title}`);
  return [
    'You write a neutral briefing for a news dashboard.',
    'Use only the numbered headlines below. Do not add facts. Do not name a race, religion or nationality as a cause.',
    'Write 3 to 4 sentences. Cite each claim with its number in square brackets, like [3].',
    'Say when the headlines disagree or come from one outlet only.',
    '',
    ...lines,
  ].join('\n');
}

async function callModel(prompt: string, key: string): Promise<string> {
  const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    timeoutMs: 25000,
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'x-title': 'UNBIASED STATS',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new UpstreamError(`AI service ${res.status}`, 502);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new UpstreamError('AI service returned no text', 502);
  return text;
}

export function getInsights(): Promise<InsightsResponse> {
  return remember('insights', 15 * 60e3, async () => {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      return {
        configured: false,
        generatedAt: null,
        model: null,
        brief: null,
        sources: [],
        message: 'The AI brief is not switched on yet.',
      };
    }
    const news: NewsResponse = await getNews();
    const top = pick(news.stories);
    if (top.length === 0) throw new UpstreamError('no stories to brief', 503);
    const brief = await callModel(promptFor(top), key);
    return {
      configured: true,
      generatedAt: new Date().toISOString(),
      model: MODEL,
      brief,
      sources: top.map((s, i) => ({ n: i + 1, title: s.title, link: s.link, outlets: s.outlets.length })),
    };
  });
}
