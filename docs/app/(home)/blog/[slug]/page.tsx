import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CopyLink } from '@/components/copy-link';
import { CoverArt } from '@/components/cover-art';
import { JsonLd } from '@/components/json-ld';
import { getMDXComponents } from '@/components/mdx';
import { container } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { appName, siteUrl } from '@/lib/shared';
import { blog } from '@/lib/source';

export default async function Post(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params;
  const post = blog.getPage([slug]);
  if (!post) notFound();
  const { title, description, author, category, date, art, image, body: Body } = post.data;

  // One column: the hero and the body share a reading-width column.
  const column = 'mx-auto w-full max-w-[640px]';
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: title,
          description,
          datePublished: date,
          // Authors are GitHub handles.
          author: { '@type': 'Person', name: author, url: `https://github.com/${author}` },
          publisher: { '@type': 'Organization', name: appName, url: siteUrl, logo: `${siteUrl}/logo.svg` },
          mainEntityOfPage: `${siteUrl}${post.url}`,
          image: `${siteUrl}${image ?? '/og.png'}`,
        }}
      />
      {/* The card's cover fills the hero, in teal (the band's colours, in
          both themes), faded into the band under the text. */}
      <section className="post-hero relative isolate overflow-hidden bg-band text-on-band">
        <div aria-hidden className="absolute inset-0 -z-10">
          {image ? (
            <img src={image} alt="" className="size-full object-cover" />
          ) : (
            <div className="dots size-full">
              <CoverArt seed={post.url} style={art} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-band from-25% via-band/85 via-55% to-band/10" />
        </div>
        <div className={`${container} pt-40 pb-16 sm:pt-64 sm:pb-20`}>
          <div className={column}>
            <p className="label opacity-80">
              {category} · <time dateTime={date}>{formatDate(date)}</time>
            </p>
            <h1 dir="auto" className="display mt-6 text-[40px] leading-[46px] [overflow-wrap:anywhere] sm:text-[56px] sm:leading-[62px]">
              {title}
            </h1>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
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

      <div className={`${container} py-16 sm:py-20`}>
        <div className={`${column} flex flex-col gap-12`}>
          {/* Install lives in the closing call to action, after the post. */}
          <aside className="border border-ink p-6 sm:p-8">
            <p className="display text-2xl">TL;DR</p>
            <p className="mt-3">{description}</p>
          </aside>
          <article className="post-body prose min-w-0 max-w-none">
            <Body components={getMDXComponents()} />
          </article>
        </div>
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
  return pageMetadata({
    title: post.data.title,
    description: post.data.description,
    path: post.url,
    type: 'article',
    image: post.data.image,
  });
}
