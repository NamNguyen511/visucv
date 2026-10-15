"use client";
import { useEffect, useRef, useState } from "react";
import type { Cell, Grid } from "@/lib/algos/types";
import { labelColor, pixelColor } from "@/lib/pixel";
import { useThemeColors } from "./use-theme-colors";

type Props = {
  title: string;
  grid: Grid;
  read?: Cell[];
  write?: Cell[];
  /** Enables painting: called with the cell index and the value to set. */
  onPaint?: (k: number, value: number) => void;
};

export function GridCanvas({ title, grid: g, read = [], write = [], onPaint }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colors = useThemeColors();
  const paintValue = useRef<number | null>(null);

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
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        ctx.fillStyle = (g.labels ? labelColor : pixelColor)(g.data[y * g.w + x]) ?? colors.pending;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    ctx.strokeStyle = "rgba(128, 128, 128, 0.3)"; // visible on both black and white pixels
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < g.w; x++) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, g.h * CELL); }
    for (let y = 1; y < g.h; y++) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(g.w * CELL, y * CELL + 0.5); }
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = colors.kernel;
    for (const [y, x] of read) ctx.fillRect(x * CELL, y * CELL, CELL, CELL); // off-image cells clip away
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.cursor;
    ctx.lineWidth = 3;
    for (const [y, x] of write) ctx.strokeRect(x * CELL + 1.5, y * CELL + 1.5, CELL - 3, CELL - 3);
  }, [g, read, write, colors, CELL]);

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
        className={`pixels block rounded-md ring-1 ring-border ${onPaint ? "cursor-crosshair touch-none" : ""}`}
        onPointerDown={onPaint && (e => {
          const k = cellAt(e);
          if (k < 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          paintValue.current = g.data[k] ? 0 : 1;
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
