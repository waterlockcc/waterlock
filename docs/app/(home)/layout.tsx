import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <SiteHeader />
      <div className="flex flex-1 flex-col bg-paper text-ink">{children}</div>
      <SiteFooter />
    </>
  );
}
