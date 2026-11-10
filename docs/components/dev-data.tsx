'use client';
import { useEffect, useState, type ReactNode } from 'react';
import type { PostItem } from '@/lib/post-item';
import { fixtures, type Fixture } from './dev-fixtures';

// Dev-only: a "Demo data / Worst case / ..." switch for the post list, so
// layouts get checked against realistic bad data, not just our own posts.
// The choice lives in ?data= so a reload keeps it. Production builds replace
// NODE_ENV, so this branch and the fixtures are dropped.
const DEV = process.env.NODE_ENV === 'development';

type State = 'demo' | Fixture;
const LABELS: Record<State, string> = {
  demo: 'Demo data',
  worst: 'Worst case',
  empty: 'Empty',
  one: 'One',
  many: '200 posts',
};
const isState = (s: string | null): s is State => !!s && s in LABELS;

export function useDevData(real: PostItem[]): {
  posts: PostItem[];
  toggle: ReactNode;
} {
  const [state, setState] = useState<State>('demo');

  useEffect(() => {
    if (!DEV) return;
    const s = new URLSearchParams(window.location.search).get('data');
    if (isState(s)) setState(s);
  }, []);

  if (!DEV) return { posts: real, toggle: null };

  function pick(next: State) {
    const url = new URL(window.location.href);
    if (next === 'demo') url.searchParams.delete('data');
    else url.searchParams.set('data', next);
    window.history.replaceState(null, '', url);
    setState(next);
  }

  const toggle = (
    <div
      role="radiogroup"
      aria-label="Post list data"
      className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 gap-0.5 overflow-x-auto rounded-full bg-neutral-200 p-1 font-sans text-xs text-neutral-700 shadow-sm"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      {(Object.keys(LABELS) as State[]).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={state === s}
          onClick={() => pick(s)}
          className={`whitespace-nowrap rounded-full px-3 py-1 ${state === s ? 'bg-white text-neutral-900 shadow-sm' : ''}`}
        >
          {LABELS[s]}
        </button>
      ))}
    </div>
  );

  return {
    posts: state === 'demo' ? real : fixtures[state](real),
    toggle,
  };
}
