'use client';
import { BookOpen, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { links } from '@/lib/shared';
import { GitHubIcon, NpmIcon } from './brand-icons';
import { Dither } from './dither';
import { band, button, container, iconButton, Mark } from './ui';

export function SiteHeader() {
  return (
    <header className={`sticky top-0 z-40 border-b border-band-line/40 ${band}`}>
      <nav className={`${container} flex h-16 items-center gap-2 sm:h-20`}>
        <Link href={links.blog} className="pressable me-auto flex shrink-0 items-center gap-3" aria-label="waterlock blog">
          <Mark className="size-8 shrink-0" />
          {/* Below 420px the mark alone, so the nav fits on one line. */}
          <span className="display hidden text-2xl min-[420px]:inline">waterlock</span>
        </Link>
        <a href={links.wiki} className={iconButton} aria-label="Wiki" title="Wiki">
          <BookOpen className="size-4" aria-hidden />
        </a>
        <a href={links.npm} className={iconButton} aria-label="npm" title="npm">
          <NpmIcon className="size-4" />
        </a>
        <a href={links.github} className={iconButton} aria-label="GitHub" title="GitHub">
          <GitHubIcon className="size-4" />
        </a>
        <ThemeToggle />
        <a href={links.quickstart} className={button({ intent: 'inverse', size: 'sm', className: 'ms-2 max-sm:hidden' })}>
          <Dither />
          Get started
        </a>
      </nav>
    </header>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is only known after mount; render a stable icon until then.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === 'dark';
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
  const Icon = dark ? Sun : Moon;

  return (
    <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className={iconButton} aria-label={label} title={label}>
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
