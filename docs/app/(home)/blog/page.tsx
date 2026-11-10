import type { Metadata } from 'next';
import { BlogIndex } from '@/components/blog-index';
import { Dither } from '@/components/dither';
import { button, container, heroBand } from '@/components/ui';
import { getPostItems } from '@/lib/posts';
import { links } from '@/lib/shared';

const intro =
  'How we keep AI agents away from real credentials, and what we learn building the gateway that does it.';

export const metadata: Metadata = { title: 'Blog', description: intro };

export default function BlogPage() {
  return (
    <>
      <section className={heroBand}>
        <div className={`${container} grid grid-cols-1 gap-10 pt-14 pb-20 sm:pt-20 sm:pb-28 lg:grid-cols-2 lg:items-end`}>
          <h1 className="display text-[44px] leading-[48px] sm:text-6xl sm:leading-[64px]">Notes from the gateway</h1>
          <div>
            <p className="label opacity-80">Blog</p>
            <p className="mt-4 max-w-xl text-lg leading-6 font-medium">{intro}</p>
            <a href={links.quickstart} className={button({ intent: 'inverse', className: 'mt-8' })}>
              <Dither />
              Get started
            </a>
          </div>
        </div>
      </section>
      <BlogIndex posts={getPostItems()} />
    </>
  );
}
