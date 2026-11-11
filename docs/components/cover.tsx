import { clsx } from 'clsx';
import { CoverArt, type ArtStyle } from './cover-art';

/** 16:9 post cover in an ink frame: the post's image, or generated art. */
export function Cover({
  src,
  seed,
  art,
  className,
}: {
  src?: string;
  seed: string;
  art?: ArtStyle;
  className?: string;
}) {
  return (
    <div className={clsx('cover relative aspect-video overflow-hidden border border-ink bg-[var(--art-bg)]', className)}>
      {src ? (
        // Plain img: static export, and covers are already sized.
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="art dots size-full text-ink">
          <CoverArt seed={seed} style={art} />
        </div>
      )}
    </div>
  );
}
