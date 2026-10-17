"use client";
// Generic step-through player: drives any Algorithm (lib/algos/types.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { algorithms } from "@/lib/algos";
import { type Params, clone, defaultParams } from "@/lib/algos/types";
import { stepsDue } from "@/lib/playback";
import { GridCanvas } from "./grid-canvas";
import { Plot } from "./plot";

// Three.js only loads on pages that use it.
const Surface3D = dynamic(() => import("./surface-3d"), {
  ssr: false,
  loading: () => <div className="aspect-[16/10] w-full animate-pulse rounded-xl bg-pending" />,
});

const SPEEDS = [3, 15, 60, 300];

// Readout cells: long values take a full row; with an odd number of short ones, the last short one
// does too, so the two-column grid never shows an empty half cell. (Order of cells is kept.)
const long = (v: unknown) => String(v).length > 18;
function wide(all: [string, unknown][], n: number) {
  if (long(all[n][1])) return true;
  let run = 0; // short cells since the last long one, including this one
  for (let j = n; j >= 0 && !long(all[j][1]); j--) run++;
  const nextIsShort = n + 1 < all.length && !long(all[n + 1][1]);
  return run % 2 === 1 && !nextIsShort;
}

const btn =
  "inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card transition hover:border-accent active:translate-y-px " +
  "focus-visible:outline-2 focus-visible:outline-accent";
const select = "rounded-lg border border-border bg-card px-2 py-1 text-foreground";

export function Player({ id }: { id: string }) {
  const algo = algorithms[id];
  const [params, setParams] = useState<Params>(() => defaultParams(algo));
  const [input, setInput] = useState(() => algo.sampleInput(params));
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(15);
  const [fit, setFit] = useState(false);

  const frames = useMemo(() => [...algo.steps(input, params)], [algo, input, params]);
  const last = frames.length - 1;
  const i = Math.min(idx, last);
  const f = frames[i];
  const go = (n: number) => setIdx(Math.max(0, Math.min(last, n)));

  // Playback: advance `speed` steps per second on animation frames.
  const pos = useRef(i);
  pos.current = i;
  useEffect(() => {
    if (!playing) return;
    let raf = 0, prev = performance.now(), carry = 0;
    const tick = (now: number) => {
      const due = stepsDue(carry, now - prev, speed);
      const n = due.n;
      carry = due.carry;
      prev = now;
      const next = Math.min(last, pos.current + n);
      if (n) setIdx(next);
      if (next >= last) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, last]);

  const togglePlay = () => {
    if (!playing && i >= last) setIdx(0);
    setPlaying(p => !p);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("select, input, button")) return;
      if (e.key === "ArrowRight") { setPlaying(false); go(i + 1); }
      else if (e.key === "ArrowLeft") { setPlaying(false); go(i - 1); }
      else if (e.key === " ") { e.preventDefault(); togglePlay(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const setParam = (key: string, value: string | number) => {
    const next = { ...params, [key]: value };
    setParams(next);
    // Only params that define the sample image replace it; others keep any painting.
    if (algo.params.find(p => p.key === key)?.input) setInput(algo.sampleInput(next));
  };

  const paint = (k: number, v: number) => {
    setPlaying(false);
    setInput(g => { const c = clone(g); c.data[k] = v; return c; });
  };

  const titles = algo.panelTitles(params);

  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-label="Demo" className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {algo.params.map(p => (
            <label key={p.key} className="flex items-center gap-2 text-muted-foreground">
              {p.label}
              <select
                className={select}
                value={params[p.key]}
                onChange={e => setParam(p.key, typeof p.default === "number" ? +e.target.value : e.target.value)}
              >
                {p.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ))}
        </div>

        {algo.view3d && f.surface && (
          <div className="mb-4">
            <Surface3D surface={f.surface} write={f.write} fit={fit} />
            <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="accent-accent" checked={fit} onChange={e => setFit(e.target.checked)} />
              Fit height to the tallest point
            </label>
          </div>
        )}

        <div className={`grid gap-3 ${titles.length > 2 ? "grid-cols-3" : "grid-cols-2"}`}>
          {f.grids.map((g, k) => (
            <GridCanvas
              key={k}
              title={titles[k]}
              grid={g}
              read={k === f.src ? f.read : undefined}
              write={k === f.dst ? f.write : undefined}
              shapes={f.shapes?.filter(s => (s.panel ?? f.dst) === k)}
              onPaint={algo.paintable && k === 0 ? paint : undefined}
              animate
              active={k === f.dst && f.write.length > 0}
            />
          ))}
        </div>

        {f.plot && <Plot {...f.plot} />}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className={btn} aria-label="First step" onClick={() => { setPlaying(false); go(0); }}><SkipBack className="size-4" /></button>
          <button className={btn} aria-label="Previous step" onClick={() => { setPlaying(false); go(i - 1); }}><ChevronLeft className="size-4" /></button>
          <button className={`${btn} !border-accent !bg-accent text-background`} aria-label={playing ? "Pause" : "Play"} onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button className={btn} aria-label="Next step" onClick={() => { setPlaying(false); go(i + 1); }}><ChevronRight className="size-4" /></button>
          <button className={btn} aria-label="Last step" onClick={() => { setPlaying(false); go(last); }}><SkipForward className="size-4" /></button>
          <input
            type="range" min={0} max={last} value={i} aria-label="Step"
            className="min-w-32 flex-1 accent-accent"
            onChange={e => { setPlaying(false); go(+e.target.value); }}
          />
          <span className="w-24 text-right font-mono text-xs text-muted-foreground">{i + 1} / {frames.length}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            Speed
            <select className={select} value={speed} onChange={e => setSpeed(+e.target.value)}>
              {SPEEDS.map(s => <option key={s} value={s}>{s} steps/s</option>)}
            </select>
          </label>
          {algo.paintable && (
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 hover:border-accent"
                    onClick={() => setInput(algo.sampleInput(params))}>
              <RotateCcw className="size-3.5" /> Reset image
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-kernel align-[-1px]" />cells being read</span>
          <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-cursor align-[-1px]" />cells being written</span>
          <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-pending align-[-1px]" style={{ backgroundImage: "linear-gradient(to top right, transparent 42%, rgba(110,100,80,.55) 42% 58%, transparent 58%)" }} />not computed yet</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {algo.paintable && <>Click or drag on <b>{titles[0]}</b> to paint pixels. </>}
          {algo.view3d && <>Drag the 3-D view to orbit, scroll to zoom. </>}
          Keys: ← → step, space play/pause.
        </p>
      </section>

      <section aria-label="Pseudocode" className="self-start rounded-2xl border border-border bg-card py-3 lg:sticky lg:top-20">
        <div className="mb-2 flex items-center justify-between px-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <span>Pseudocode</span>
          <span className={playing ? "text-accent" : ""}>{playing ? "● playing" : i >= last ? "finished" : "paused"}</span>
        </div>
        {/* Wraps instead of scrolling: a sideways-scrolling box hid the ends of lines on phones. */}
        <pre className="whitespace-pre-wrap break-words font-mono [font-variant-ligatures:none] text-[11px] leading-6 sm:text-[13px] sm:leading-7">
          {algo.pseudocode.map((l, n) => {
            // Indent | code | "  # comment". A line that doesn't fit wraps under its own code, and a
            // comment that doesn't fit drops to the next line whole (the spaces before it hang).
            const [, indent, code, gap = "", comment] = l.match(/^( *)(.*?)(?:( +)(#.*))?$/)!;
            return (
              <div key={n} className={`flex border-l-[3px] px-4 ${n === f.line ? "border-accent bg-highlight" : "border-transparent"}`}>
                <span className="whitespace-pre">{indent}</span>
                <span className="min-w-0 flex-1">
                  {code}{gap}{comment && <span className="inline-block whitespace-pre text-muted-foreground">{comment}</span>}
                </span>
              </div>
            );
          })}
        </pre>
        <dl className="mx-4 mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
          {Object.entries(f.vars).map(([k, v], n, all) => (
            <div key={k} className={`bg-card px-3 py-2 ${wide(all, n) ? "col-span-2" : ""}`}>
              <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{k}</dt>
              <dd className="mt-0.5 break-words font-mono text-sm">{v}</dd>
            </div>
          ))}
        </dl>
        {f.window && (
          <div className="mx-4 mt-4">
            <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Inside the kernel</h3>
            <div className="mt-2 inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${f.window.cells[0].length}, minmax(0, 1fr))` }}>
              {f.window.cells.flatMap((row, r) => row.map((c, k) => {
                const center = r === (f.window!.cells.length - 1) / 2 && k === (row.length - 1) / 2;
                return (
                  <span key={`${r}-${k}`} className={`flex h-8 min-w-10 items-center justify-center rounded-md border px-1 font-mono text-xs ${
                    center ? "border-accent bg-highlight text-accent" : c === "" ? "border-dashed border-border" : "border-border"}`}>
                    {c}
                  </span>
                );
              }))}
            </div>
            {f.window.note && <p className="mt-2 font-mono text-xs text-muted-foreground">{f.window.note}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
