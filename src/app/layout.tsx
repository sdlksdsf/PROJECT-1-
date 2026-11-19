import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'UNBIASED STATS | Watch the world, verified',
  description: 'A live 3D globe of world news, conflicts, disasters, flights, ships, markets, weather and country statistics, with transparent source and factuality scoring.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
