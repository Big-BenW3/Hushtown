import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/pirata-one/400.css';
import '@fontsource/rock-salt/400.css';
import '@fontsource/special-elite/400.css';
import '@/styles/base.css';
import '@/styles/components.css';
import '@/styles/screens.css';
import '@/styles/landing.css';

export const metadata: Metadata = {
  title: 'Hushtown: someone here is lying',
  description: 'A realtime online Mafia game for 5 to 15 friends. One phone each. No account. No mercy.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0707',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
