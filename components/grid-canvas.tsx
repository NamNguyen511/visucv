"use client";
import { useEffect, useRef, useState } from "react";
import type { Cell, Grid, Shape } from "@/lib/algos/types";
import { labelColor, pixelColor } from "@/lib/pixel";
import { useThemeColors } from "./use-theme-colors";

type Props = {
  title: string;
  grid: Grid;
  read?: Cell[];
  write?: Cell[];
  /** Enables painting: called with the cell index and the value to set. */
  onPaint?: (k: number, value: number) => void;
  shapes?: Shape[];
  /** Overlay glides to the new cells and written cells "develop" (skipped when steps come faster than 25/s). */
  animate?: boolean;
  /** The panel being written this step: gets a soft accent glow. */
  active?: boolean;
};

const NONE: never[] = []; // shared default, so panels without overlays don't redraw on every render
const ease = (t: number) => 1 - (1 - t) ** 3;
const centre = (cells: Cell[]) =>
  cells.length ? cells.reduce(([a, b], [y, x]) => [a + y / cells.length, b + x / cells.length], [0, 0]) : null;

export function GridCanvas({ title, grid: g, read = NONE, write = NONE, onPaint, shapes = NONE, animate = false, active = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colors = useThemeColors();
  const paintValue = useRef<number | null>(null);
  const prev = useRef<{ at: number; c: [number, number] | null }>({ at: 0, c: null });

  // Whole device pixels per cell, sized to the panel's width, so grid lines stay crisp.
  const [{ cell: CELL, dpr }, setSize] = useState({ cell: 8, dpr: 1 });
  useEffect(() => {
    const box = ref.current?.parentElement;
    if (!box) return;
    const ro = new ResizeObserver(([e]) => {
      const dpr = devicePixelRatio;
      setSize({ cell: Math.max(2, Math.floor((e.contentRect.width * dpr) / g.w)), dpr });
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [g.w]);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx || !colors) return;

    // The pixel layer (pixels, hatching, grid lines) is drawn once per step into an off-screen
    // canvas; animation frames copy it and redraw only the developing cell and the overlays.
    const base = document.createElement("canvas");
    base.width = g.w * CELL; base.height = g.h * CELL;
    const b = base.getContext("2d")!;
    // "Not computed yet" cells get a diagonal hatch: a flat pale fill was indistinguishable from white pixels.
    const hatch = new Path2D();
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const c = (g.labels ? labelColor : pixelColor)(g.data[y * g.w + x]);
        b.fillStyle = c ?? colors.pending;
        b.fillRect(x * CELL, y * CELL, CELL, CELL);
        if (!c) { hatch.moveTo(x * CELL, (y + 1) * CELL); hatch.lineTo((x + 1) * CELL, y * CELL); }
      }
    b.strokeStyle = "rgba(110, 100, 80, 0.55)";
    b.lineWidth = Math.max(1, CELL / 8);
    b.stroke(hatch);
    b.strokeStyle = "rgba(128, 128, 128, 0.3)"; // visible on both black and white pixels
    b.lineWidth = 1;
    b.beginPath();
    for (let x = 1; x < g.w; x++) { b.moveTo(x * CELL + 0.5, 0); b.lineTo(x * CELL + 0.5, g.h * CELL); }
    for (let y = 1; y < g.h; y++) { b.moveTo(0, y * CELL + 0.5); b.lineTo(g.w * CELL, y * CELL + 0.5); }
    b.stroke();

    // t = animation progress (1 = settled). `shift` moves the read/write overlay from where it was.
    const draw = (t: number, shift: [number, number]) => {
      const e = ease(t), [sy, sx] = [shift[0] * (1 - e), shift[1] * (1 - e)];
      ctx.drawImage(base, 0, 0);
      if (t < 1)
        for (const [y, x] of write) {
          const c = (g.labels ? labelColor : pixelColor)(g.data[y * g.w + x]);
          if (!c) continue;
          // Develop: fade and grow in from the pending colour.
          ctx.fillStyle = colors.pending;
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
          const inset = (CELL * (1 - e)) / 4;
          ctx.globalAlpha = 0.25 + 0.75 * e;
          ctx.fillStyle = c;
          ctx.fillRect(x * CELL + inset, y * CELL + inset, CELL - 2 * inset, CELL - 2 * inset);
          ctx.globalAlpha = 1;
        }
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = colors.kernel;
      for (const [y, x] of read) ctx.fillRect((x + sx) * CELL, (y + sy) * CELL, CELL, CELL); // off-image cells clip away
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.cursor;
      ctx.lineWidth = 3;
      for (const [y, x] of write) ctx.strokeRect((x + sx) * CELL + 1.5, (y + sy) * CELL + 1.5, CELL - 3, CELL - 3);

      // Vector overlays, each with a dark halo so it reads on both black and white pixels.
      const px = (v: number) => (v + 0.5) * CELL;
      const stroke = (color: string, width: number) => {
        ctx.lineWidth = width + 3; ctx.strokeStyle = "rgba(0, 0, 0, 0.55)"; ctx.stroke();
        ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke();
      };
      const lw = Math.max(1.5, CELL / 6);
      for (const s of shapes) {
        ctx.beginPath();
        if (s.kind === "line") {
          ctx.moveTo(px(s.x1), px(s.y1)); ctx.lineTo(px(s.x2), px(s.y2));
          stroke(s.thick ? colors.cursor : colors.kernel, s.thick ? lw * 1.4 : lw);
        } else if (s.kind === "ellipse") {
          ctx.ellipse(px(s.cx), px(s.cy), Math.max(s.a * CELL, 0.5), Math.max(s.b * CELL, 0.5), s.theta, 0, 2 * Math.PI);
          stroke(colors.accent, lw);
        } else {
          ctx.arc(px(s.x), px(s.y), Math.max(3, CELL / 3), 0, 2 * Math.PI);
          ctx.fillStyle = colors.cursor; ctx.fill(); stroke("#ffffff", 1.5);
        }
      }
    };

    // Animate only short hops between steps more than 40 ms apart; fast playback draws settled frames.
    const now = performance.now(), c = centre(write.length ? write : read), last = prev.current;
    prev.current = { at: now, c };
    const hop = c && last.c ? [last.c[0] - c[0], last.c[1] - c[1]] as [number, number] : null;
    // The glide takes 80% of the gap between steps (≤ 120 ms), so it always settles before the next one.
    const ms = Math.min(120, 0.8 * (now - last.at));
    const glide = animate && hop && ms > 32 && Math.hypot(...hop) <= 3 &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!glide) { draw(1, [0, 0]); return; }
    let raf = 0;
    const tick = (time: number) => {
      const t = Math.min(1, (time - now) / ms);
      draw(t, hop!);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf); // the next run draws its own frame
  }, [g, read, write, shapes, colors, CELL, animate]);

  const cellAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * g.w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * g.h);
    return x >= 0 && x < g.w && y >= 0 && y < g.h ? y * g.w + x : -1;
  };

  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 truncate font-mono text-xs text-muted-foreground">{title}</figcaption>
      <canvas
        ref={ref}
        width={g.w * CELL}
        height={g.h * CELL}
        role="img"
        aria-label={`${title} grid`}
        // Percentage width: the canvas never forces its container wider (no min-content
        // contribution), and the cap keeps it at whole device pixels per cell so lines stay crisp.
        style={{ width: "100%", maxWidth: (g.w * CELL) / dpr }}
        className={`pixels block rounded-md ring-1 transition-shadow ${active ? "ring-accent/60 shadow-[0_0_28px_-6px_var(--accent)]" : "ring-border"} ${onPaint ? "cursor-crosshair touch-none" : ""}`}
        onPointerDown={onPaint && (e => {
          const k = cellAt(e);
          if (k < 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          paintValue.current = g.data[k] >= 0.5 ? 0 : 1; // bright → paint black, dark → paint white (gray images too)
          onPaint(k, paintValue.current);
        })}
        onPointerMove={onPaint && (e => {
          const k = cellAt(e);
          if (paintValue.current === null || k < 0 || g.data[k] === paintValue.current) return;
          onPaint(k, paintValue.current);
        })}
        onPointerUp={() => { paintValue.current = null; }}
        onPointerCancel={() => { paintValue.current = null; }}
      />
    </figure>
  );
}
