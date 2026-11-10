import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CopyLink } from '@/components/copy-link';
import { getMDXComponents } from '@/components/mdx';
import { TryPanel } from '@/components/try-panel';
import { container, heroBand } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { blog } from '@/lib/source';

export default async function Post(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params;
  const post = blog.getPage([slug]);
  if (!post) notFound();
  const { title, description, author, category, date, body: Body } = post.data;

  return (
    <>
      <section className={heroBand}>
        <div className={`${container} grid grid-cols-1 gap-10 pt-14 pb-20 sm:pt-20 sm:pb-28 lg:grid-cols-2 lg:items-end`}>
          <h1 dir="auto" className="display text-[40px] leading-[46px] [overflow-wrap:anywhere] sm:text-5xl sm:leading-[56px]">
            {title}
          </h1>
          <div>
            <p className="label opacity-80">
              {category} · <time dateTime={date}>{formatDate(date)}</time>
            </p>
            <p className="mt-4 max-w-xl text-lg leading-6 font-medium">{description}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <span className="flex items-center gap-3">
                <Initials name={author} />
                <span dir="auto" className="text-lg font-medium">
                  {author}
                </span>
              </span>
              <CopyLink />
            </div>
          </div>
        </div>
      </section>

      <div className={`${container} grid grid-cols-1 gap-14 py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-[100px]`}>
        <div className="order-last lg:order-first">
          <div className="lg:sticky lg:top-32">
            <TryPanel>
              <p className="display text-2xl">TL;DR</p>
              <p className="mt-3">{description}</p>
            </TryPanel>
          </div>
        </div>
        <article className="post-body prose min-w-0 max-w-none">
          <Body components={getMDXComponents()} />
        </article>
      </div>
    </>
  );
}

// First letters of the first and last words, by grapheme, so accents and
// emoji stay whole.
function Initials({ name }: { name: string }) {
  const words = name.trim().split(/\s+/);
  const first = (w = '') => [...new Intl.Segmenter().segment(w)][0]?.segment ?? '';
  const text = (first(words[0]) + (words.length > 1 ? first(words.at(-1)) : '')).toUpperCase();
  return (
    <span aria-hidden className="label grid size-11 shrink-0 place-items-center border border-band-line bg-band text-sm">
      {text}
    </span>
  );
}

export function generateStaticParams() {
  return blog.getPages().map((post) => ({ slug: post.slugs[0]! }));
}

export async function generateMetadata(props: PageProps<'/blog/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const post = blog.getPage([slug]);
  if (!post) notFound();
  return { title: post.data.title, description: post.data.description };
}
