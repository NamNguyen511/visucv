"use client";
// Home-page hero: the real morphology engine (erosion, 3×3) on a loop, not a recording.
import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { morphology } from "@/lib/algos/morphology";
import { defaultParams } from "@/lib/algos/types";
import { stepsDue } from "@/lib/playback";
import { GridCanvas } from "./grid-canvas";

const SPEED = 8; // steps/s: slow enough for the kernel to visibly glide
const CODE = [
  "for y, x in pixels(A):",
  "    window = A[y-1:y+2, x-1:x+2]",
  "    out[y, x] = 1 if window.all() else 0",
];
const btn = "inline-flex size-9 items-center justify-center rounded-lg border border-border transition hover:border-accent active:translate-y-px";

export function HeroDemo() {
  const frames = useMemo(() => {
    const p = { ...defaultParams(morphology), op: "erode" };
    return [...morphology.steps(morphology.sampleInput(p), p)];
  }, []);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
      setIdx(frames.length - 1); // show the finished result, no motion
    }
  }, [frames]);

  useEffect(() => {
    if (!playing) return;
    // rAF already stops while the tab is hidden; the jump on return just skips ahead in the loop.
    let raf = 0, prev = performance.now(), carry = 0;
    const tick = (now: number) => {
      const due = stepsDue(carry, now - prev, SPEED);
      carry = due.carry;
      prev = now;
      if (due.n) setIdx(i => (i + due.n) % frames.length);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, frames]);

  const f = frames[idx], [y, x] = f.write[0] ?? [0, 0], total = f.grids[0].h * f.grids[0].w;
  const on = String(f.vars["cells of B on 1"] ?? "").replace(" / ", " of ");
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm" data-step={idx} aria-label="Live demo: eroding a binary image">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        <span>Morphology · Ch. 3</span>
        <span className="text-accent">Erosion · 3 × 3</span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <GridCanvas title="input A" grid={f.grids[0]} read={f.read} animate />
          <span aria-hidden className="mt-4 text-muted-foreground">→</span>
          <GridCanvas title="out = erode(A)" grid={f.grids[1]} write={f.write} animate active />
        </div>
        <pre className="mt-4 overflow-hidden rounded-lg bg-highlight px-3 py-2 font-mono text-[12px] leading-5">
          {CODE.map((l, n) => <div key={n} className={`overflow-hidden text-ellipsis whitespace-pre ${n === 2 ? "text-accent" : ""}`}>{l}</div>)}
          <div className="mt-1 truncate text-muted-foreground">
            # y, x = {y}, {x} · window has {on || "—"} on → out = {String(f.vars["out[p]"] ?? "—")}
          </div>
        </pre>
        <div className="mt-3 flex items-center gap-2">
          <button className={`${btn} !border-accent !bg-accent text-background`} aria-label={playing ? "Pause demo" : "Play demo"} onClick={() => setPlaying(v => !v)}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button className={btn} aria-label="Next pixel" onClick={() => { setPlaying(false); setIdx(i => (i + 1) % frames.length); }}>
            <StepForward className="size-4" />
          </button>
          <button className={btn} aria-label="Restart demo" onClick={() => { setIdx(0); setPlaying(true); }}>
            <RotateCcw className="size-4" />
          </button>
          <span className="ml-auto font-mono text-xs text-muted-foreground">pixel {Math.min(y * f.grids[0].w + x + 1, total)} / {total}</span>
        </div>
      </div>
    </div>
  );
}
