// Generated cover art from the logo mark. Seeded by the post slug, so a post
// keeps the same cover across builds, and different posts get different
// ones. Colours are CSS variables (global.css), so covers follow dark mode.
import type { ReactNode } from 'react';

const W = 1600;
const H = 900;

// The mark on a 256 grid, whole and as its four parts: the rounded frame,
// the centre pillar, and the two blocks either side of it.
export const OUTER =
  'M72 16 H184 A56 56 0 0 1 240 72 V184 A56 56 0 0 1 184 240 H72 A56 56 0 0 1 16 184 V72 A56 56 0 0 1 72 16 Z';
const HOLE =
  'M72 40 A32 32 0 0 0 40 72 V172 H102 V216 H116 V72 H140 V216 H154 V108 H216 V72 A32 32 0 0 0 184 40 Z';
const INNER =
  'M72 40 A32 32 0 0 0 40 72 V184 A32 32 0 0 0 72 216 H184 A32 32 0 0 0 216 184 V72 A32 32 0 0 0 184 40 Z';
export const MARK = `${OUTER} ${HOLE}`;
const PARTS = {
  frame: `${OUTER} ${INNER}`,
  left: 'M40 172 H102 V216 H72 A32 32 0 0 1 40 184 Z',
  pillar: 'M116 72 H140 V216 H116 Z',
  right: 'M154 108 H216 V184 A32 32 0 0 1 184 216 H154 Z',
};

export const c = {
  light: 'var(--art-light)',
  mid: 'var(--art-mid)',
  deep: 'var(--art-deep)',
  ink: 'var(--art-ink)',
  hi: 'var(--art-hi)',
};
const FILLS = [c.hi, c.mid, c.deep] as const;

type Rand = () => number;

function seeded(text: string): Rand {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  // mulberry32
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(rand: Rand, items: readonly T[]) => items[Math.floor(rand() * items.length)]!;

type ShapeProps = {
  d?: string;
  x: number;
  y: number;
  size: number;
  turn?: number;
  fill?: string;
  outline?: boolean;
  /** Hard ink shadow, offset down-right by this many units. */
  shadow?: number;
};

/** A path on the 256 grid, placed at (x, y), `size` wide, quarter-turned. */
export function Shape({ d = MARK, x, y, size, turn = 0, fill, outline, shadow }: ShapeProps) {
  const s = size / 256;
  const at = (dx: number) =>
    `translate(${x + dx} ${y + dx}) scale(${s}) rotate(${turn * 90} 128 128)`;
  return (
    <>
      {shadow ? <path d={d} fillRule="evenodd" fill={c.ink} transform={at(shadow)} /> : null}
      <path
        d={d}
        fillRule="evenodd"
        fill={fill ?? 'none'}
        stroke={outline ? c.ink : undefined}
        strokeWidth={outline ? 2 : undefined}
        vectorEffect="non-scaling-stroke"
        transform={at(0)}
      />
    </>
  );
}

// The mark pulled apart into its parts, like an assembly drawing, with
// dashed lines back to where each part sits.
function Exploded(rand: Rand) {
  const size = 560;
  const s = size / 256;
  const spread = 1 + rand() * 0.4;
  const moves = {
    left: [-84 * spread, 36 * spread],
    pillar: [0, 48 * spread],
    right: [86 * spread, 30 * spread],
  } as const;
  const lift = -28 * spread; // the frame rises as the parts drop
  // Centre on the exploded bounds: frame top to pillar bottom.
  const top = 16 + lift;
  const bottom = 216 + moves.pillar[1];
  const x = (W - size) / 2 + (rand() - 0.5) * 240;
  const y = (H - (bottom - top) * s) / 2 - top * s;
  const out: ReactNode[] = [];
  // Guides from each part's home corner to where it went.
  const homes = { left: [40, 172], pillar: [116, 72], right: [216, 108] } as const;
  for (const part of ['left', 'pillar', 'right'] as const) {
    const [hx, hy] = homes[part];
    const [dx, dy] = moves[part];
    out.push(
      <line
        key={`g-${part}`}
        x1={x + hx * s}
        y1={y + (hy + lift) * s}
        x2={x + (hx + dx) * s}
        y2={y + (hy + dy) * s}
        stroke={c.ink}
        strokeWidth={2}
        strokeDasharray="8 8"
        vectorEffect="non-scaling-stroke"
      />,
    );
  }
  const fills = pick(rand, [
    [c.deep, c.hi, c.mid, c.hi],
    [c.hi, c.deep, c.mid, c.deep],
    [c.mid, c.deep, c.hi, c.deep],
  ]);
  out.push(<Shape key="frame" d={PARTS.frame} x={x} y={y + lift * s} size={size} fill={fills[0]} outline shadow={14} />);
  (['left', 'pillar', 'right'] as const).forEach((part, i) => {
    const [dx, dy] = moves[part];
    out.push(
      <Shape key={part} d={PARTS[part]} x={x + dx * s} y={y + dy * s} size={size} fill={fills[i + 1]} outline shadow={14} />,
    );
  });
  return out;
}

// A few marks stacked like cards, stepping diagonally.
function Stack(rand: Rand) {
  const n = pick(rand, [3, 4]);
  const size = 400;
  const dx = pick(rand, [84, -84]);
  const dy = -64;
  const turn = Math.floor(rand() * 4);
  const x0 = (W - size - dx * (n - 1)) / 2 + (dx < 0 ? -dx * (n - 1) : 0);
  const y0 = (H - size - dy * (n - 1)) / 2;
  const start = Math.floor(rand() * FILLS.length);
  // Only the front card shows the gate; cut-outs overlapping read as noise.
  return Array.from({ length: n }, (_, i) => (
    <Shape
      key={i}
      d={i === n - 1 ? MARK : OUTER}
      x={x0 + dx * i}
      y={y0 + dy * i}
      size={size}
      turn={turn}
      fill={FILLS[(start + i) % FILLS.length]}
      outline
      shadow={12}
    />
  ));
}

// A sparse grid of marks, turned, with room to breathe.
function Tiles(rand: Rand) {
  const cell = H / 3;
  const cols = Math.ceil(W / cell);
  const ox = (W - cols * cell) / 2;
  const pad = cell * 0.16;
  const out: ReactNode[] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < cols; col++) {
      const r = rand();
      const turn = Math.floor(rand() * 4);
      const props = { x: ox + col * cell + pad, y: row * cell + pad, size: cell - pad * 2, turn };
      const key = `${row}-${col}`;
      if (r < 0.4) continue;
      if (r < 0.62) out.push(<Shape key={key} {...props} fill={c.deep} outline shadow={8} />);
      else if (r < 0.78) out.push(<Shape key={key} {...props} fill={c.mid} outline shadow={8} />);
      else if (r < 0.9) out.push(<Shape key={key} {...props} fill={c.hi} outline shadow={8} />);
      else out.push(<Shape key={key} {...props} d={OUTER} fill={c.light} />);
    }
  return out;
}

// A canal lock: chambers stepping down, each held at its own water level by
// gates drawn from the mark's pillars.
function Lock(rand: Rand) {
  const n = pick(rand, [4, 5]);
  const w = W / n;
  const step = H * 0.09;
  const ltr = rand() < 0.5;
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const level = ltr ? i : n - 1 - i;
    const floor = H * 0.5 + level * step;
    const water = floor - H * (0.1 + rand() * 0.1);
    const x = i * w;
    out.push(<rect key={`w${i}`} x={x} y={water} width={w} height={floor - water} fill={c.mid} />);
    // Ripples.
    for (let k = 1; k <= 2; k++) {
      const ry = water + ((floor - water) * k) / 3;
      const rx = x + w * (0.15 + rand() * 0.3);
      out.push(
        <line key={`r${i}-${k}`} x1={rx} x2={rx + w * 0.3} y1={ry} y2={ry} stroke={c.hi} strokeWidth={4} strokeLinecap="round" />,
      );
    }
    out.push(
      <line key={`l${i}`} x1={x} x2={x + w} y1={water} y2={water} stroke={c.ink} strokeWidth={2} vectorEffect="non-scaling-stroke" />,
      <rect key={`g${i}`} x={x} y={floor} width={w} height={H - floor} fill={c.deep} />,
      <line key={`f${i}`} x1={x} x2={x + w} y1={floor} y2={floor} stroke={c.ink} strokeWidth={2} vectorEffect="non-scaling-stroke" />,
    );
  }
  // Gates between chambers: a wide pillar and a thin leg, like the mark.
  for (let i = 1; i < n; i++) {
    const x = i * w;
    const top = H * 0.32 - rand() * H * 0.08;
    out.push(
      <rect key={`p${i}`} x={x - 14} y={top} width={28} height={H - top} fill={c.deep} stroke={c.ink} strokeWidth={2} vectorEffect="non-scaling-stroke" />,
      <rect key={`q${i}`} x={x + 24} y={top + 48} width={14} height={H - top} fill={c.deep} stroke={c.ink} strokeWidth={2} vectorEffect="non-scaling-stroke" />,
    );
  }
  const size = 180;
  out.push(<Shape key="m" x={ltr ? 110 : W - 110 - size} y={70} size={size} fill={c.hi} outline shadow={10} />);
  return out;
}

const STYLES = { exploded: Exploded, stack: Stack, tiles: Tiles, lock: Lock };
export type ArtStyle = keyof typeof STYLES;
export const artStyles = Object.keys(STYLES) as ArtStyle[];

/** Cover art for `seed` (the post URL). `style` overrides the seeded pick. */
export function CoverArt({ seed, style }: { seed: string; style?: ArtStyle }) {
  const rand = seeded(seed);
  const chosen = style ?? pick(rand, artStyles);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden className="size-full">
      {STYLES[chosen](rand)}
    </svg>
  );
}
