import { useMemo, useState, type FormEvent } from 'react';
import { addCustomStream, appStore, removeCustomStream } from '../lib/appState';
import { useStore } from '../lib/store';
import { LIVE_REGIONS, LIVE_STREAMS, liveEmbedUrl, parseChannelId, type LiveRegion, type LiveStream } from '../data/liveStreams';

// Live TV and webcams from YouTube channels. The player loads only the selected channel, so the
// panel stays light no matter how many options are listed.
export function LivePanel() {
  const selectedId = useStore(appStore, (s) => s.liveStreamId);
  const custom = useStore(appStore, (s) => s.customStreams);
  const [region, setRegion] = useState<LiveRegion | 'all'>('all');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => [...LIVE_STREAMS, ...custom], [custom]);
  const shown = useMemo(() => all.filter((s) => region === 'all' || s.region === region), [all, region]);
  const selected = all.find((s) => s.id === selectedId || s.channelId === selectedId) ?? shown[0] ?? all[0] ?? null;

  const choose = (s: LiveStream) => appStore.set({ liveStreamId: s.id });

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    const channelId = parseChannelId(draft);
    if (!channelId) {
      setError('Paste a YouTube channel link that contains /channel/UC… or the channel ID (starts with UC).');
      return;
    }
    if (LIVE_STREAMS.some((s) => s.channelId === channelId) || custom.some((s) => s.channelId === channelId)) {
      setError('That channel is already in the list.');
      return;
    }
    const stream: LiveStream = {
      id: `custom-${channelId}`,
      title: 'Your channel',
      operator: 'Added by you',
      region: 'other',
      countries: [],
      channelId,
      custom: true,
    };
    addCustomStream(stream);
    setDraft('');
    setError(null);
    appStore.set({ liveStreamId: stream.id });
  };

  return (
    <div className="live-panel">
      <div className="live-player">
        {selected ? (
          <>
            <iframe
              key={selected.channelId}
              src={liveEmbedUrl(selected.channelId)}
              title={`${selected.title} live`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
            <div className="live-caption small">
              <strong>{selected.title}</strong>
              <span className="muted"> · {selected.operator} · shows the channel&apos;s live stream. If it is offline, YouTube shows its own message.</span>
            </div>
          </>
        ) : (
          <div className="live-empty small muted">No live channels yet.</div>
        )}
      </div>

      <div className="live-regions" role="tablist" aria-label="Filter live channels by region">
        {LIVE_REGIONS.map((r) => (
          <button
            key={r.id}
            role="tab"
            aria-selected={region === r.id}
            className={`chip ${region === r.id ? 'chip-on' : ''}`}
            onClick={() => setRegion(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <ul className="live-grid">
        {shown.map((s) => (
          <li key={s.id} className={`live-card ${selected?.channelId === s.channelId ? 'is-on' : ''}`}>
            <div className="live-card-meta">
              {s.custom ? <span className="live-tag">your channel</span> : <span className="live-tag">{s.region.replace('-', ' ')}</span>}
              <strong>{s.title}</strong>
              <span className="muted small">{s.operator}{s.countries.length ? ` · ${s.countries.join(', ')}` : ''}</span>
            </div>
            <div className="btn-row">
              <button className="btn btn-sm" onClick={() => choose(s)}>
                {selected?.channelId === s.channelId ? 'Playing' : 'Watch live'}
              </button>
              {s.custom && (
                <button className="btn btn-ghost btn-sm" onClick={() => removeCustomStream(s.channelId)}>
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <form className="live-add" onSubmit={onAdd}>
        <label className="small" htmlFor="live-add-input">
          <strong>Add a channel</strong> — paste a YouTube channel link (for example a city or news channel for your country).
        </label>
        <div className="live-add-row">
          <input
            id="live-add-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://www.youtube.com/channel/UC…"
            maxLength={200}
          />
          <button className="btn btn-sm" type="submit">
            Add
          </button>
        </div>
        {error && <p className="small live-error">{error}</p>}
        <p className="small muted">Saved in this browser only. Streams are YouTube&apos;s; each broadcaster owns its content.</p>
      </form>
    </div>
  );
}
