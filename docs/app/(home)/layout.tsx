import { preload } from 'react-dom';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export default function Layout({ children }: LayoutProps<'/'>) {
  // Every page opens on a hero band whose background, the watermark, is the
  // largest paint. It's only found once the CSS loads; preloading it starts
  // the download with the HTML.
  preload('/watermark.svg', { as: 'image', fetchPriority: 'high' });
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col bg-paper text-ink">{children}</main>
      <SiteFooter />
    </>
  );
}
