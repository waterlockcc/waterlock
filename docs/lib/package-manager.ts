'use client';
import { useSyncExternalStore } from 'react';

// The reader's package manager: the choice made on any ```npm code-block
// tab (fumadocs saves it in localStorage under this key), npm until then.
const KEY = 'package-manager';
export const packageManagers = ['npm', 'pnpm', 'bun'] as const;
export type PackageManager = (typeof packageManagers)[number];

const isManager = (v: string | null): v is PackageManager =>
  !!v && (packageManagers as readonly string[]).includes(v);

function read(): PackageManager {
  try {
    const v = localStorage.getItem(KEY);
    return isManager(v) ? v : 'npm';
  } catch {
    return 'npm'; // storage blocked (private mode, sandboxed preview)
  }
}

// fumadocs doesn't announce tab changes, so re-read after any click (the
// tab handler has run by then) and on changes from other browser tabs.
function subscribe(onChange: () => void) {
  const later = () => setTimeout(onChange, 0);
  document.addEventListener('click', later);
  window.addEventListener('storage', onChange);
  return () => {
    document.removeEventListener('click', later);
    window.removeEventListener('storage', onChange);
  };
}

export function usePackageManager(): PackageManager {
  return useSyncExternalStore(subscribe, read, () => 'npm');
}

export const installCommands: Record<PackageManager, string> = {
  npm: 'npm i @waterlock/gateway',
  pnpm: 'pnpm add @waterlock/gateway',
  bun: 'bun add @waterlock/gateway',
};
