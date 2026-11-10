import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

// Square buttons. Put <Dither /> first inside for the hover texture.
// `inverse` and `outline-band` are for use on the teal band.
export const button = cva(
  'label pressable relative isolate inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap',
  {
    variants: {
      intent: {
        solid: 'bg-ink text-paper',
        outline: 'border border-ink text-ink',
        inverse: 'bg-on-band text-band',
        'outline-band': 'border border-band-line bg-band text-on-band',
      },
      size: {
        md: 'h-11 px-5',
        sm: 'h-9 px-4',
      },
    },
    defaultVariants: { intent: 'solid', size: 'md' },
  },
);
export type ButtonProps = VariantProps<typeof button>;

/** Square icon button for the navbar. */
export const iconButton =
  'pressable grid size-9 shrink-0 place-items-center border border-band-line bg-band hover:bg-on-band/15';

/** Small square tag, e.g. the category on a cover. */
export function Chip({ children }: { children: ReactNode }) {
  return <span className="label border border-ink bg-paper px-2 py-1 text-xs leading-none text-ink">{children}</span>;
}

/** The logo mark, in the current text colour (white on the band). */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" aria-hidden className={className}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M72 16 H184 A56 56 0 0 1 240 72 V184 A56 56 0 0 1 184 240 H72 A56 56 0 0 1 16 184 V72 A56 56 0 0 1 72 16 Z M72 40 A32 32 0 0 0 40 72 V172 H102 V216 H116 V72 H140 V216 H154 V108 H216 V72 A32 32 0 0 0 184 40 Z"
      />
    </svg>
  );
}

export const container = 'mx-auto w-full max-w-[1400px] px-4 sm:px-8 lg:px-[100px]';

/** Teal band with the dot grid, for the header and footer. */
export const band = 'dots dots-fixed bg-band text-on-band';

/** The hero's band: the dot grid plus the watermark mark. */
export const heroBand = 'hero-band bg-band text-on-band';
