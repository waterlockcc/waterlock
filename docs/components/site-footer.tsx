import { links } from '@/lib/shared';
import { CopyCommand } from './copy-command';
import { Dither } from './dither';
import { band, button, container } from './ui';

const columns = [
  {
    title: 'Project',
    items: [
      ['GitHub', links.github],
      ['npm', links.npm],
      ['Changelog', links.changelog],
      ['Releases', links.releases],
    ],
  },
  {
    title: 'Docs',
    items: [
      ['Introduction', links.docs],
      ['Quickstart', links.quickstart],
      ['Policies', links.policies],
    ],
  },
  {
    title: 'Community',
    items: [
      ['Issues', links.issues],
      ['Blog', links.blog],
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className={`mt-auto ${band}`}>
      {/* CTA, with the mark on the left (the hero has it on the right) */}
      <div className="watermark">
        <div className={`${container} flex flex-col items-center gap-4 py-24 text-center sm:py-32`}>
          <h2 className="brand-display text-4xl sm:text-[56px] sm:leading-[60px]">keep the keys out of the agent</h2>
          <p className="max-w-xl text-lg font-medium">
            Open source, MIT licensed. Rules in TypeScript or natural language.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <CopyCommand />
            <a href={links.quickstart} className={button({ intent: 'outline-band' })}>
              <Dither />
              Quickstart
            </a>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="border-t border-on-band/40 bg-band">
        <div className={`${container} grid gap-10 py-12 sm:grid-cols-3`}>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="label border-b border-on-band/40 pb-3">/ {col.title}</p>
              <ul className="mt-4 flex flex-col gap-2">
                {col.items.map(([text, href]) => (
                  <li key={text}>
                    <a href={href} className="label hover:underline underline-offset-4">
                      {text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={`${container} pb-10 text-sm`}>© {new Date().getFullYear()} waterlock contributors</div>
      </div>
    </footer>
  );
}
