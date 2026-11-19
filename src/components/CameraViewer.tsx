import { useEffect, useRef } from 'react';
import type { CameraDetail } from '../../shared/types';
import { openCamera } from '../lib/appState';
import { useResource } from '../lib/useResource';
import { ErrorState, Spinner } from './ui';

// Live view of one public camera, shown inside the site (no redirect to another website).
// The server returns the stream address; still images are re-requested every 30 seconds.
export function CameraViewer({ id }: { id: string }) {
  const { data, error, loading, reload } = useResource<CameraDetail>(`/api/camera?id=${encodeURIComponent(id)}`, 30_000);

  return (
    <div className="camera-viewer" role="dialog" aria-modal="false" aria-label="Live camera" onClick={(e) => e.target === e.currentTarget && openCamera(null)}>
      <div className="camera-card">
        <header className="camera-head">
          <div>
            <strong>{data?.title ?? 'Camera'}</strong>
            {data?.city && <span className="small muted"> · {data.city}</span>}
          </div>
          <button className="icon-btn" aria-label="Close camera" onClick={() => openCamera(null)}>
            ×
          </button>
        </header>

        <div className="camera-stage">
          {loading && !data && <Spinner label="Opening camera" />}
          {error && !data && <ErrorState message={error} onRetry={reload} />}
          {data?.stream && data.kind === 'iframe' && (
            <iframe title={data.title} src={data.stream} allow="autoplay; fullscreen" loading="eager" referrerPolicy="strict-origin-when-cross-origin" />
          )}
          {data?.stream && (data.kind === 'image' || data.kind === 'mjpeg') && (
            <img src={data.stream} alt={data.title} />
          )}
          {data?.stream && data.kind === 'hls' && <HlsVideo src={data.stream} />}
          {data && !data.stream && <p className="camera-empty">{data.message ?? 'No picture is available for this camera.'}</p>}
        </div>

        <footer className="camera-foot small muted">
          {data?.attribution && <span>{data.attribution}</span>}
          {data?.kind === 'image' && <span>Still updates every 30 s</span>}
          {data?.permalink && (
            <a href={data.permalink} target="_blank" rel="noopener noreferrer">
              Camera page on {data.source === 'windy' ? 'Windy' : 'OpenWebcamDB'}
            </a>
          )}
        </footer>
      </div>
    </div>
  );
}

function HlsVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let cancelled = false;
    let destroy: (() => void) | null = null;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported()) return;
        const hls = new Hls({ lowLatencyMode: false });
        hls.loadSource(src);
        hls.attachMedia(video);
        destroy = () => hls.destroy();
      });
    }
    return () => {
      cancelled = true;
      destroy?.();
      video.removeAttribute('src');
      video.load();
    };
  }, [src]);
  return <video ref={ref} controls autoPlay muted playsInline />;
}
