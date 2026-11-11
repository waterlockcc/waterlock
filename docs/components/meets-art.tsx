// "waterlock meets <provider>": the mark and the provider's mark as two
// tiles, joined through a gate, in the cover-art style (ink outlines, hard
// shadows, the --art-* palette).
import { c, MARK, Shape } from './cover-art';
import { providerMarks, type ProviderId } from './provider-icons';

const W = 1600;
const H = 900;

export function MeetsArt({ provider }: { provider: ProviderId }) {
  const size = 460;
  const y = (H - size) / 2;
  const left = 170;
  const right = W - 170 - size;
  const mid = W / 2;
  const icon = size * 0.5;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={`waterlock and ${providerMarks[provider].name}`} className="size-full">
      {/* The wire between them, through the gate. */}
      <line x1={left + size} x2={right} y1={H / 2} y2={H / 2} stroke={c.ink} strokeWidth={2} strokeDasharray="10 10" vectorEffect="non-scaling-stroke" />

      {/* The gate: the mark's pillar and leg, standing on the wire. */}
      <rect x={mid - 60} y={H / 2 - 170} width={56} height={340} fill={c.ink} transform="translate(12 12)" />
      <rect x={mid - 60} y={H / 2 - 170} width={56} height={340} fill={c.mid} stroke={c.ink} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <rect x={mid + 16} y={H / 2 - 100} width={30} height={270} fill={c.ink} transform="translate(12 12)" />
      <rect x={mid + 16} y={H / 2 - 100} width={30} height={270} fill={c.deep} stroke={c.ink} strokeWidth={2} vectorEffect="non-scaling-stroke" />

      {/* waterlock */}
      <Shape d={MARK} x={left} y={y} size={size} fill={c.deep} outline shadow={20} />

      {/* The provider, on a light tile. */}
      <rect x={right + 20} y={y + 20} width={size} height={size} rx={size * 0.22} fill={c.ink} />
      <rect x={right} y={y} width={size} height={size} rx={size * 0.22} fill={c.hi} stroke={c.ink} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <path
        d={providerMarks[provider].path}
        fill={c.deep}
        transform={`translate(${right + (size - icon) / 2} ${y + (size - icon) / 2}) scale(${icon / 24})`}
      />
    </svg>
  );
}
