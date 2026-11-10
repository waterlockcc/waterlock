import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import { Provider } from '@/components/provider';
import { appName } from '@/lib/shared';
import './global.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
});
// Brand headlines only (lowercase, like the wordmark).
const grotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-grotesk',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: { template: `%s · ${appName}`, default: `${appName} blog` },
  icons: { icon: '/logo.svg' },
};

// Mobile browser toolbars match the band.
export const viewport: Viewport = { themeColor: '#1d6670' };

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${grotesk.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-paper font-sans text-ink antialiased">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
