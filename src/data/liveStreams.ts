// Live TV and webcams that play in the app. Each entry is a YouTube channel ID. The embed
// https://www.youtube.com/embed/live_stream?channel=ID shows whatever that channel is streaming
// right now, so no YouTube API key is needed. If a channel is offline, YouTube shows its own
// "not live" message and the user can pick another option.
//
// Every ID below was checked against YouTube before being added (the channel's live page resolved
// to that broadcaster's video). Add more with the "Add a channel" box in the Live TV tab.

export type LiveRegion = 'americas' | 'middle-east' | 'europe' | 'asia' | 'africa' | 'oceania' | 'space' | 'other';

export const LIVE_REGIONS: { id: LiveRegion | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'middle-east', label: 'Middle East' },
  { id: 'europe', label: 'Europe' },
  { id: 'americas', label: 'Americas' },
  { id: 'asia', label: 'Asia' },
  { id: 'africa', label: 'Africa' },
  { id: 'oceania', label: 'Oceania' },
  { id: 'space', label: 'Space' },
];

export interface LiveStream {
  id: string;
  title: string;
  operator: string;
  region: LiveRegion;
  countries: string[]; // ISO alpha-2 codes this stream is relevant to (empty for global or space)
  channelId: string; // YouTube channel ID, starts with UC
  custom?: boolean; // added by the user
}

export const LIVE_STREAMS: LiveStream[] = [
  { id: 'aljazeera', title: 'Al Jazeera English', operator: 'Al Jazeera', region: 'middle-east', countries: ['QA'], channelId: 'UCNye-wNBqNL5ZzHSJj3l8Bg' },
  { id: 'trt', title: 'TRT World', operator: 'TRT', region: 'middle-east', countries: ['TR'], channelId: 'UC7fWeaHhqgM4Ry-RMpM2YYw' },
  { id: 'france24', title: 'France 24 English', operator: 'France 24', region: 'europe', countries: ['FR'], channelId: 'UCQfwfsi5VrQ8yKZ-UWmAEFg' },
  { id: 'dw', title: 'DW News', operator: 'Deutsche Welle', region: 'europe', countries: ['DE'], channelId: 'UCknLrEdhRCp1aegoMqRaCZg' },
  { id: 'sky', title: 'Sky News', operator: 'Sky News', region: 'europe', countries: ['GB'], channelId: 'UCoMdktPbSTixAyNGwb-UYkQ' },
  { id: 'bloomberg', title: 'Bloomberg Television', operator: 'Bloomberg', region: 'americas', countries: ['US'], channelId: 'UCIALMKvObZNtJ6AmdCLP7Lg' },
  { id: 'cnn', title: 'CNN', operator: 'CNN', region: 'americas', countries: ['US'], channelId: 'UCupvZG-5ko_eiXAupbDfxWw' },
  { id: 'nasa', title: 'NASA live (ISS views when on air)', operator: 'NASA', region: 'space', countries: [], channelId: 'UCLA_DiR1FfKNvjuUpBHmylQ' },
];

const CHANNEL_RE = /UC[A-Za-z0-9_-]{22}/;

/** Pulls a channel ID out of a pasted YouTube channel URL (/channel/UC...) or a bare UC... ID. */
export function parseChannelId(input: string): string | null {
  const s = input.trim();
  const m = s.match(CHANNEL_RE);
  return m ? m[0] : null;
}

export function liveEmbedUrl(channelId: string): string {
  return `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(channelId)}&autoplay=1&rel=0&playsinline=1`;
}
