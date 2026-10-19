"use client";
// Home-page hero: real algorithms on a drawing the visitor can change. Erosion and dilation step
// through pixel by pixel; the other chips show their finished result. A 20×24 image runs in well
// under a millisecond, so this is fine on the home page (the cards stay precomputed).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { components } from "@/lib/algos/components";
import { distance } from "@/lib/algos/distance";
import { edges } from "@/lib/algos/edges";
import { morphology } from "@/lib/algos/morphology";
import { type Algorithm, type Grid, type Step, clone, defaultParams } from "@/lib/algos/types";
import { stepsDue } from "@/lib/playback";
import { GridCanvas } from "./grid-canvas";

const SPEED = 8; // steps/s: slow enough for the kernel to visibly glide
const btn = "inline-flex size-9 items-center justify-center rounded-lg border border-border transition hover:border-accent active:translate-y-px disabled:opacity-40";

// Only these four modules ship with the home page, not the whole registry.
const algorithms: Record<string, Algorithm> = { morphology, components, distance, edges };
const sample = () => morphology.sampleInput(defaultParams(morphology));
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

type Chip = {
  label: string; id: string; params: Record<string, string | number>; stepped: boolean;
  code: string[]; say: (out: Grid, s?: Step) => string;
};
const lit = (s: Step) => String(s.vars["cells of B on 1"]).split(" / ").map(Number);
const white = (g: Grid) => g.data.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
const pixels = (g: Grid) => { const n = white(g); return `${n} pixel${n === 1 ? "" : "s"}`; };
const CHIPS: Chip[] = [
  { label: "Erosion", id: "morphology", params: { op: "erode" }, stepped: true,
    code: ["for y, x in pixels(A):", "    window = A[y-1:y+2, x-1:x+2]", "    out[y, x] = 1 if window.all() else 0"],
    say: (out, s) => { if (!s) return `Finished: the whole kernel fits at ${pixels(out)}, and only those survive.`; const [n, of] = lit(s); return n === of ? `Survives: all ${of} cells under the kernel are lit.` : `Erased: ${n ? `only ${n}` : "none"} of the ${of} cells under the kernel ${n === 1 ? "is" : "are"} lit, so it doesn't fit.`; } },
  { label: "Dilation", id: "morphology", params: { op: "dilate" }, stepped: true,
    code: ["for y, x in pixels(A):", "    window = A[y-1:y+2, x-1:x+2]", "    out[y, x] = 1 if window.any() else 0"],
    say: (out, s) => { if (!s) return `Finished: the kernel touches white at ${pixels(out)}, and all of them are lit.`; const [n] = lit(s); return n ? `Lit: the kernel touches ${n} white cell${n > 1 ? "s" : ""}.` : "Stays dark: no white cell under the kernel."; } },
  { label: "Components", id: "components", params: { op: "label all blobs", conn: 8 }, stepped: false,
    code: ["for p in raster_order(A):", "    if A[p] == 1 and not label[p]:", "        k += 1; flood_fill(A, p, k)"],
    say: out => { const k = new Set([...out.data].filter(v => v > 0)).size; return `${k} separate blob${k === 1 ? "" : "s"}, each with its own label.`; } },
  { label: "Distance", id: "distance", params: { metric: "chamfer 3-4" }, stepped: false,
    code: ["D = where(A == 0, 0, inf)", "for p in raster_order(A):        # pass 1", "for p in reversed(raster_order(A)):  # 2"],
    say: () => "Brighter = farther from the background: the shapes' skeletons light up." },
  { label: "Edges", id: "edges", params: { noise: 0.02 }, stepped: false,
    code: ["I = gaussian_blur(I)", "mag, theta = polar(*sobel(I))", "edges = grow(strong, into=weak)"],
    say: out => `${white(out)} edge pixels trace the outlines.` },
];

export function HeroDemo() {
  const [chip, setChip] = useState(0);
  const [input, setInput] = useState(sample);
  const c = CHIPS[chip], algo = algorithms[c.id];
  const params = useMemo(() => ({ ...defaultParams(algo), ...c.params }), [algo, c]);
  const frames = useMemo(() => (c.stepped ? [...algo.steps(input, params)] : []), [algo, c, input, params]);
  const result = useMemo(() => algo.run(input, params), [algo, input, params]);
  const [idx, setIdx] = useState(0);
  // play = stepping on its own; step = paused on a pixel; done = the finished result (after drawing).
  const [mode, setMode] = useState<"play" | "step" | "done">("play");
  const playing = mode === "play";

  useEffect(() => {
    if (reduced()) setMode("done");
  }, []);

  useEffect(() => {
    if (!playing || !frames.length) return;
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

  const f = c.stepped && mode !== "done" ? frames[Math.min(idx, frames.length - 1)] : undefined;
  const out = f ? f.grids[1] : result;
  const [y, x] = f?.write[0] ?? [0, 0], total = input.h * input.w;

  const paint = (k: number, v: number) => {
    setMode("done"); // drawing shows the live result; press play to watch it again
    setInput(g => { const n = clone(g); n.data[k] = v; return n; });
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm" data-step={f ? idx : "done"} aria-label={`Live demo: ${c.label.toLowerCase()} on an image you can draw on`}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        <span>{algo.meta.topic} · {algo.meta.ref.match(/Ch\. \d+/)?.[0]}</span>
        <Link href={`/algo/${c.id}`} className="inline-flex items-center gap-1 text-accent hover:underline">
          Open {c.label} <ArrowUpRight aria-hidden className="size-3.5" />
        </Link>
      </div>
      <div className="p-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Algorithm">
          {CHIPS.map((ch, k) => (
            <button key={ch.label} aria-pressed={k === chip} onClick={() => { setChip(k); setIdx(0); if (mode === "done" && CHIPS[k].stepped && !reduced()) setMode("play"); }}
                    className={`rounded-full border px-3 py-1 text-sm transition active:translate-y-px ${k === chip ? "border-accent bg-highlight text-accent" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {ch.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <GridCanvas title="input A · draw on me" grid={input} read={f?.read} onPaint={paint} animate />
          <span aria-hidden className="mt-4 text-muted-foreground">→</span>
          {/* Re-keyed per chip so a new result fades in. */}
          <div key={chip} className="min-w-0 motion-safe:animate-[fade-in_300ms_ease-out]">
            <GridCanvas title={`out = ${c.label.toLowerCase()}(A)`} grid={out} write={f?.write} animate active={!!f} />
          </div>
        </div>
        <pre className="mt-4 overflow-hidden rounded-lg bg-highlight px-3 py-2 font-mono text-[12px] leading-5 [font-variant-ligatures:none]">
          {c.code.map((l, n) => <div key={n} className={`overflow-hidden text-ellipsis whitespace-pre ${n === c.code.length - 1 ? "text-accent" : ""}`}>{l}</div>)}
        </pre>
        {/* Silent while autoplaying: it would announce 8 captions a second. */}
        <p className="mt-3 min-h-6 text-sm" aria-live={playing ? "off" : "polite"}>{c.say(out, f)}</p>
        <div className="mt-3 flex items-center gap-2">
          <button className={`${btn} !border-accent !bg-accent text-background`} disabled={!c.stepped}
                  aria-label={playing ? "Pause demo" : "Play demo"}
                  onClick={() => { if (mode === "done") setIdx(0); setMode(playing ? "step" : "play"); }}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button className={btn} disabled={!c.stepped} aria-label="Next pixel"
                  onClick={() => { setIdx(i => (mode === "done" ? 0 : (i + 1) % frames.length)); setMode("step"); }}>
            <StepForward className="size-4" />
          </button>
          <button className={btn} aria-label="Reset drawing" onClick={() => { setInput(sample()); setIdx(0); }}>
            <RotateCcw className="size-4" />
          </button>
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {f ? `pixel ${Math.min(y * input.w + x + 1, total)} / ${total}` : "finished · drag to draw"}
          </span>
        </div>
      </div>
    </div>
  );
}
