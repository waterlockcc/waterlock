'use client';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatDate } from '@/lib/format';
import type { PostItem } from '@/lib/post-item';
import { Cover } from './cover';
import { useDevData } from './dev-data';
import { Dither } from './dither';
import { button, Chip, container } from './ui';

const PAGE = 9; // three rows of three

export function BlogIndex({ posts: real }: { posts: PostItem[] }) {
  // Real posts in production. In dev, ?data= swaps in a test fixture.
  const { posts, toggle } = useDevData(real);
  const [shown, setShown] = useState(PAGE);
  const [latest, ...rest] = posts;

  return (
    <section className={`${container} flex flex-col gap-6 py-16 sm:py-20`}>
      {toggle}
      {!latest ? (
        <p className="py-8 text-lg">No posts yet.</p>
      ) : (
        <>
          <Featured post={latest} />
          {rest.length > 0 && (
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rest.slice(0, shown).map((post) => (
                <li key={post.url} className="flex">
                  <Card post={post} />
                </li>
              ))}
            </ul>
          )}
          {rest.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className={button({ intent: 'outline', className: 'mt-4 self-center' })}
            >
              <Dither />
              Load more +
            </button>
          )}
        </>
      )}
    </section>
  );
}

// The newest post, across the full width: cover left, text right.
function Featured({ post }: { post: PostItem }) {
  return (
    <Link
      href={post.url}
      className="card grid grid-cols-1 gap-6 border border-ink p-3 hover:bg-tint/40 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-10"
    >
      <div className="relative">
        <Cover src={post.image} seed={post.url} art={post.art} />
        <span className="absolute top-3 left-3 flex gap-1.5">
          <span className="label bg-ink px-2 py-1 text-xs leading-none text-paper">Latest</span>
          <Chip>{post.category}</Chip>
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-4 px-2 pb-3 lg:py-6 lg:pe-6">
        <h2 dir="auto" className="card-title display text-[32px] leading-9 [overflow-wrap:anywhere] sm:text-[40px] sm:leading-[46px]">
          {post.title}
        </h2>
        <p className="line-clamp-3 text-lg leading-7 opacity-75">{post.description}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-4 pt-4">
          <span className="label flex flex-wrap gap-x-3 gap-y-1 opacity-75">
            <span dir="auto">{post.author}</span>
            <time dateTime={post.date} className="whitespace-nowrap">
              {formatDate(post.date)}
            </time>
          </span>
          {/* Not a button: the whole card is the link. */}
          <span className={button({ intent: 'solid', size: 'sm' })}>
            Read
            <ArrowRight className="size-4" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}

function Card({ post }: { post: PostItem }) {
  return (
    <Link href={post.url} className="card flex w-full flex-col border border-ink p-3 hover:bg-tint/40">
      <div className="relative">
        <Cover src={post.image} seed={post.url} art={post.art} />
        <span className="absolute top-3 left-3">
          <Chip>{post.category}</Chip>
        </span>
      </div>
      <h2 dir="auto" className="card-title mt-4 px-1 text-xl leading-6 font-medium tracking-[-0.03em] [overflow-wrap:anywhere]">
        {post.title}
      </h2>
      <p className="mt-2 line-clamp-2 px-1 opacity-75">{post.description}</p>
      <time dateTime={post.date} className="label mt-auto px-1 pt-6 pb-1 opacity-75">
        {formatDate(post.date)}
      </time>
    </Link>
  );
}
