// Provider marks (Simple Icons 16.37.0, CC0; the marks are their owners'
// trademarks, used to say "works with"). 24x24 paths.
export const providerMarks = {
  gmail: {
    name: 'Gmail',
    path: 'M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z',
  },
  linear: {
    name: 'Linear',
    path: 'M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z',
  },
} as const;

export type ProviderId = keyof typeof providerMarks;
export const isProvider = (id: string | undefined): id is ProviderId => !!id && id in providerMarks;

export function ProviderIcon({ id, className }: { id: ProviderId; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d={providerMarks[id].path} />
    </svg>
  );
}
