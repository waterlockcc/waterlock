'use client';
import { clsx } from 'clsx';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { Moon, Search, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { links } from '@/lib/shared';
import { GitHubIcon, NpmIcon } from './brand-icons';
import { Dither } from './dither';
import { band, button, container, iconButton, Mark } from './ui';

export function SiteHeader() {
  return (
    <header className={`site-header sticky top-0 z-40 ${band}`}>
      <nav className={`${container} flex h-16 items-center gap-2 sm:h-20`}>
        <Link href="/" className="pressable flex shrink-0 items-center gap-3" aria-label="waterlock home">
          <Mark className="size-8 shrink-0" />
          {/* Wide screens only, so the nav fits on one line. */}
          <span className="display hidden text-2xl md:inline">waterlock</span>
        </Link>
        <div className="ms-3 me-auto flex items-center gap-4 sm:ms-8 sm:gap-6">
          <Section href={links.blog}>Blog</Section>
          <Section href={links.docs}>Docs</Section>
          {/* Phones: in the footer instead, so the nav fits on one line. */}
          <span className="max-sm:hidden">
            <Section href={links.changelog}>Changelog</Section>
          </span>
        </div>
        <SearchIcon />
        <a href={links.npm} className={`${iconButton} max-sm:hidden`} aria-label="npm" title="npm">
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

/** Blog / Docs. Underlined while you're in that section. */
function Section({ href, children }: { href: string; children: string }) {
  const here = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      aria-current={here ? 'page' : undefined}
      className={clsx('label underline-offset-[6px] hover:underline', here && 'underline decoration-2')}
    >
      {children}
    </Link>
  );
}

function SearchIcon() {
  const { setOpenSearch } = useSearchContext();
  return (
    <button type="button" onClick={() => setOpenSearch(true)} className={iconButton} aria-label="Search docs" title="Search docs (⌘K)">
      <Search className="size-4" aria-hidden />
    </button>
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
