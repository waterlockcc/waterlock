import type { ReactNode } from 'react';
import { CopyCommand } from './copy-command';

/** Ink-framed box: some text on top, the install command on a teal band. */
export function TryPanel({ children }: { children: ReactNode }) {
  return (
    <aside className="border border-ink">
      <div className="p-6 sm:p-8">{children}</div>
      <div className="dots flex flex-wrap items-center justify-between gap-4 border-t border-ink bg-band p-4 text-on-band sm:p-6">
        <p className="display text-xl">Try it</p>
        <CopyCommand size="sm" />
      </div>
    </aside>
  );
}
