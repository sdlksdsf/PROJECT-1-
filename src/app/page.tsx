'use client';

import dynamic from 'next/dynamic';

// The whole dashboard depends on window (WebGL globe, localStorage, the URL), so it renders only in the browser.
const UnbiasedStats = dynamic(() => import('../App').then((m) => m.App), {
  ssr: false,
  loading: () => <div className="boot">Loading the globe…</div>,
});

export default function Page() {
  return <UnbiasedStats />;
}
