'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { installCommands, usePackageManager } from '@/lib/package-manager';
import { Dither } from './dither';
import { button, type ButtonProps } from './ui';

/**
 * A button showing the install command for the reader's package manager
 * (npm until they pick another on a code-block tab); click copies it.
 */
export function CopyCommand({ intent = 'inverse', size }: ButtonProps) {
  const [copied, setCopied] = useState(false);
  const installCommand = installCommands[usePackageManager()];

  async function copy() {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      toast.success('Copied to clipboard', { description: installCommand });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the command instead.");
    }
  }

  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${installCommand}`}
      className={button({ intent, size, className: 'max-w-full normal-case tracking-normal' })}
    >
      <Dither />
      <span className="opacity-60 max-[380px]:hidden">$</span>
      {/* On very narrow screens it ellipsizes rather than widen the page. */}
      <span className="truncate">{installCommand}</span>
      <Icon className="size-4 shrink-0" aria-hidden />
    </button>
  );
}
