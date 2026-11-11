'use client';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dither } from './dither';
import { button } from './ui';

export function CopyLink() {
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied');
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  return (
    <button type="button" onClick={copy} className={button({ intent: 'outline-band', size: 'sm' })}>
      <Dither />
      <Link2 className="size-4" aria-hidden />
      Copy link
    </button>
  );
}
