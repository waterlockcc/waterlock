'use client';
import { Menu } from '@base-ui/react/menu';
import { clsx } from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Version } from '@/lib/versions';

/**
 * Square version picker. Each version links to the same page in that
 * version when it has one, else to the version's first page.
 */
export function VersionSelect({ versions, pages }: { versions: Version[]; pages: string[] }) {
  const pathname = usePathname();
  const current =
    versions.find((v) => !v.latest && !v.external && (pathname === v.url || pathname.startsWith(`${v.url}/`))) ??
    versions.find((v) => v.latest)!;
  const rest = pathname.slice(current.url.length); // e.g. /concepts/actions
  const hrefFor = (v: Version) => {
    if (v.external) return v.url;
    const same = v.url + rest;
    return pages.includes(same) ? same : v.url;
  };

  return (
    <Menu.Root>
      <Menu.Trigger
        className="label group pressable flex h-10 w-full items-center gap-2 border border-ink bg-paper px-3 hover:bg-tint/50 data-[popup-open]:bg-tint/50"
        aria-label={`Docs version: ${current.label}`}
      >
        <span className="opacity-60">/</span>
        <span className="normal-case">{current.label}</span>
        <Tag version={current} />
        <ChevronDown
          className="ms-auto size-4 transition-transform duration-150 group-data-[popup-open]:rotate-180"
          aria-hidden
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="start" className="z-50">
          <Menu.Popup
            className={clsx(
              'w-[var(--anchor-width)] border border-ink bg-paper py-1 text-ink shadow-[4px_4px_0_var(--wl-ink)]',
              // Scales in from the trigger; out faster than in.
              'origin-[var(--transform-origin)] transition-[transform,opacity] duration-150 ease-[var(--ease-out)]',
              'data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0',
              'data-[ending-style]:opacity-0 data-[ending-style]:duration-100',
            )}
          >
            <p className="label px-3 pt-2 pb-1.5 text-xs opacity-60">/ Version</p>
            {versions.map((v) => {
              const on = v === current;
              const href = hrefFor(v);
              return (
                <Menu.LinkItem
                  key={v.label}
                  render={v.external ? <a href={href} /> : <Link href={href} />}
                  aria-current={on ? 'page' : undefined}
                  className={clsx(
                    'label flex h-10 items-center gap-2 border-l-2 px-3 outline-none data-[highlighted]:border-brand data-[highlighted]:bg-tint data-[highlighted]:text-brand',
                    on ? 'border-brand text-brand' : 'border-transparent',
                  )}
                >
                  <span className="normal-case">{v.label}</span>
                  <Tag version={v} />
                  {on && <Check className="ms-auto size-4" aria-hidden />}
                </Menu.LinkItem>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** LATEST / UNRELEASED / README ↗ tag beside a version. */
function Tag({ version }: { version: Version }) {
  if (version.next)
    return <span className="label border border-current px-1.5 py-0.5 text-[10px] leading-none">Unreleased</span>;
  if (version.latest)
    return <span className="label bg-ink px-1.5 py-0.5 text-[10px] leading-none text-paper">Latest</span>;
  if (version.external)
    return <span className="label border border-current px-1.5 py-0.5 text-[10px] leading-none">Readme ↗</span>;
  return null;
}
