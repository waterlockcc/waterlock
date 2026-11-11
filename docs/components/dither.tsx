'use client';
import { useEffect, useRef } from 'react';

// Hover texture for buttons: an ordered (Bayer) dither in the button's text
// colour, densest under the pointer. Drawn at one canvas pixel per 2 CSS px
// and scaled up with `pixelated`, so the dots stay crisp.
//
// Put it as the first child of a `relative isolate overflow-hidden` element.
const CELL = 2;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export function Dither() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    // Mouse only: on touch, hover fires on tap and would stick.
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let progress = 0; // 0 at rest, 1 fully hovered
    let target = 0;
    let px = 0;
    let py = 0;
    let frame = 0;
    let last = 0;

    function draw() {
      const w = canvas!.width;
      const h = canvas!.height;
      const img = ctx!.createImageData(w, h);
      const [r, g, b] = (getComputedStyle(host!).color.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']).map(Number);
      const reach = Math.max(w, h) * 0.8;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const near = still ? 0.5 : Math.max(0, 1 - Math.hypot(x - px, y - py) / reach);
          const level = progress * (0.18 + 0.62 * near);
          if (level > BAYER[(y % 4) * 4 + (x % 4)]!) {
            const i = (y * w + x) * 4;
            img.data[i] = r!;
            img.data[i + 1] = g!;
            img.data[i + 2] = b!;
            img.data[i + 3] = 70;
          }
        }
      ctx!.putImageData(img, 0, 0);
    }

    function tick(now: number) {
      const dt = last ? now - last : 16;
      last = now;
      // About 250ms to settle, ease-out (moves fast first).
      progress += (target - progress) * Math.min(1, dt / 60);
      if (Math.abs(target - progress) < 0.01) progress = target;
      draw();
      frame = progress === target ? 0 : requestAnimationFrame(tick);
    }
    const kick = () => {
      if (still) {
        progress = target;
        draw();
      } else if (!frame) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    };

    function size() {
      const box = host!.getBoundingClientRect();
      canvas!.width = Math.max(1, Math.ceil(box.width / CELL));
      canvas!.height = Math.max(1, Math.ceil(box.height / CELL));
    }
    function move(e: PointerEvent) {
      const box = host!.getBoundingClientRect();
      px = (e.clientX - box.left) / CELL;
      py = (e.clientY - box.top) / CELL;
      if (progress === target) draw();
    }
    const enter = (e: PointerEvent) => {
      size();
      move(e);
      target = 1;
      kick();
    };
    const leave = () => {
      target = 0;
      kick();
    };

    host.addEventListener('pointerenter', enter);
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener('pointerenter', enter);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 size-full [image-rendering:pixelated]"
    />
  );
}
