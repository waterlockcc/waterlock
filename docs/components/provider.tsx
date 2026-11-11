'use client';
import { RootProvider } from 'fumadocs-ui/provider/next';
import DocsSearch from './search';
import { useTheme } from 'next-themes';
import { type ReactNode } from 'react';
import { Toaster } from 'sonner';

export function Provider({ children }: { children: ReactNode }) {
  return (
    <RootProvider search={{ SearchDialog: DocsSearch }}>
      {children}
      <Toasts />
    </RootProvider>
  );
}

// The one Toaster for the whole site. Sonner defaults to the light theme,
// so it follows the theme fumadocs resolves instead.
function Toasts() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-center"
    />
  );
}
