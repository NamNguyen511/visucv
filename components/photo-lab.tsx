"use client";
// Photograph lab: one real photo through a pipeline of VisuCV algorithms. Every stage has a live thumbnail;
// the chosen stage's input and output sit side by side. Photos are read and processed in the browser only; "Your photo" is
// never uploaded anywhere.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronRight, ImagePlus, Plus, TriangleAlert, X } from "lucide-react";
import type { Params } from "@/lib/algos/types";
import { LABEL_COLORS } from "@/lib/pixel";
import { FILTERS, type FilterId, type Filtered, NAME, type Run, STARTERS, type Stage, defaults, filter, fits, runPipeline, toGray } from "@/lib/photo";

const SAMPLES = [
  { src: "/photos/astronaut.jpg", label: "Astronaut" },
  { src: "/photos/chelsea.jpg", label: "Cat" },
  { src: "/photos/camera.jpg", label: "Camera" },
];
const WIDTHS = [96, 192, 384];
type Photo = { w: number; h: number; rgba: Uint8ClampedArray };
type Mode = "side" | "wipe";
/** `key` keeps a stage's card (and keyboard focus) with it when it moves. */
type Keyed = Stage & { key: number };
let nextKey = 0;
const keyed = (stages: Stage[]): Keyed[] => stages.map(s => ({ ...s, p: { ...s.p }, key: nextKey++ }));

async function load(src: string, width: number): Promise<Photo> {
  const img = new Image();
  img.src = src;
  await img.decode();
  // Cap the longest side, so a very tall upload costs no more than a wide one.
  const scale = Math.min(1, width / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale)); // a 1000×2 strip stays ≥ 1 row
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return { w, h, rgba: ctx.getImageData(0, 0, w, h).data };
}

const LABEL_RGB = LABEL_COLORS.map(c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)));

/** Draws a result (or, with none, the colour photo) into a canvas at one canvas pixel per image pixel. */
function paint(c: HTMLCanvasElement | null, p: Photo, f: Filtered | null) {
  if (!c) return;
  c.width = p.w; c.height = p.h;
  const img = new ImageData(p.w, p.h), g = f?.shown;
  for (let k = 0; k < p.w * p.h; k++) {
    if (!g) { img.data.set(p.rgba.subarray(4 * k, 4 * k + 4), 4 * k); continue; }
    const v = g.data[k];
    if (g.labels && v > 0) img.data.set([...LABEL_RGB[(v - 1) % LABEL_RGB.length], 255], 4 * k);
    else { const c8 = g.labels ? 0 : Math.round(v * 255); img.data.set([c8, c8, c8, 255], 4 * k); }
  }
  for (const [y, x] of f?.corners ?? []) // corners: a small accent cross
    for (const [dy, dx] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < p.h && xx >= 0 && xx < p.w) img.data.set([45, 212, 191, 255], 4 * (yy * p.w + xx));
    }
  c.getContext("2d")!.putImageData(img, 0, 0);
}

function Thumb({ photo, f }: { photo: Photo; f: Filtered | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => paint(ref.current, photo, f), [photo, f]);
  return <canvas ref={ref} aria-hidden className="pixels block aspect-[3/2] w-full rounded-md object-cover" />;
}

/** Frees "Your photo"'s blob URL once nothing will read it again (sample paths are left alone). */
const forget = (src: string | null) => { if (src?.startsWith("blob:")) URL.revokeObjectURL(src); };

export function PhotoLab() {
  const [src, setSrc] = useState(SAMPLES[0].src);
  const [width, setWidth] = useState(192);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [stages, setStages] = useState<Keyed[]>(() => keyed(STARTERS[0].stages));
  const [sel, setSel] = useState(STARTERS[0].stages.length - 1); // -1 = the gray input
  const [mode, setMode] = useState<Mode>("side");
  const [zoom, setZoom] = useState(0);
  const [split, setSplit] = useState(50);
  const [failed, setFailed] = useState<string | null>(null); // name of a file that wouldn't decode
  const fileName = useRef("that file"), lastGood = useRef<string | null>(null), last = useRef<Run | undefined>(undefined);
  const before = useRef<HTMLCanvasElement>(null), after = useRef<HTMLCanvasElement>(null);
  const list = useRef<HTMLOListElement>(null), refocus = useRef<string | null>(null); // selector to focus after the next edit
  useEffect(() => {
    if (refocus.current) list.current?.querySelector<HTMLElement>(refocus.current)?.focus();
    refocus.current = null;
  });

  useEffect(() => {
    let live = true;
    load(src, width).then(p => {
      if (!live) return;
      if (lastGood.current !== src) forget(lastGood.current); // a resolution change re-reads the same file
      lastGood.current = src;
      setPhoto(p);
    }).catch(() => {
      if (!live) return;
      forget(src);
      setFailed(fileName.current);
      if (lastGood.current) setSrc(lastGood.current); // back to the last photo that worked
    });
    return () => { live = false; };
  }, [src, width]);
  useEffect(() => () => forget(lastGood.current), []);

  const gray = useMemo(() => (photo ? toGray(photo.rgba, photo.w, photo.h) : null), [photo]);
  // Reuses the previous run's upstream results, so a knob only recomputes its stage and what follows.
  const run = useMemo(() => (gray ? (last.current = runPipeline(gray, stages, last.current)) : null), [gray, stages]);
  const at = Math.min(sel, stages.length - 1), stage = stages[at], out = run?.outs[at];
  const meta = stage && filter(stage.id);
  // Memoized wrappers: a fresh object per render would repaint the big canvases on every wipe-slider tick.
  const grayF = useMemo(() => (gray ? { shown: gray } : null), [gray]);
  const inputGrid = at < 0 ? undefined : out?.input;
  const inputF = useMemo(() => (inputGrid ? { shown: inputGrid } : null), [inputGrid]);
  const shown: Filtered | null = !gray ? null : at < 0 ? grayF : out?.input ? out.out : null;
  const input: Filtered | null = inputF; // null = the colour photo
  const end = run?.outs.length ? run.outs[run.outs.length - 1] : null, endKind = !end ? "gray" : end.input ? end.kind : null;

  useEffect(() => {
    if (!photo || !shown) return;
    // The wipe compares like with like (gray to result), so a subtle filter isn't drowned out by the colour.
    paint(before.current, photo, input ?? (mode === "wipe" ? grayF : null));
    paint(after.current, photo, shown);
  }, [photo, grayF, shown, input, mode]);

  if (!photo || !run) return <div className="mt-8 aspect-[3/2] animate-pulse rounded-2xl bg-pending" role="status" aria-label="Loading photograph" />;

  const edit = (next: Keyed[], select: number) => { setStages(next); setSel(select); };
  const add = (id: FilterId, n = stages.length) => edit([...stages.slice(0, n), ...keyed([{ id, p: defaults(filter(id)) }]), ...stages.slice(n)], n);
  const move = (n: number, by: number) => {
    const next = [...stages], to = n + by;
    [next[n], next[to]] = [next[to], next[n]];
    // At either end the pressed arrow turns disabled: hand focus to the other one.
    if (to === 0 || to === stages.length - 1) refocus.current = `[data-key="${stages[n].key}"] [data-move="${by < 0 ? 1 : -1}"]`;
    edit(next, to);
  };
  const setKnob = (key: string, v: string | number) => setStages(all => all.map((s, n) => (n === at ? { ...s, p: { ...s.p, [key]: v } } : s)));

  const chip = (on: boolean) => `rounded-lg px-3 py-1.5 text-sm transition active:translate-y-px ${on ? "bg-highlight font-medium text-accent" : "text-muted-foreground hover:text-foreground"}`;
  const fit = `min(100%, ${(62 * photo.w) / photo.h}vh)`; // whole photo fits a screen's height (once scrolled to)
  const caption = "mb-1.5 font-mono text-xs uppercase tracking-widest text-muted-foreground";
  const label = meta?.label ?? "Grayscale", resultLabel = `${label} of the photo`;
  const inputLabel = at < 0 ? "Original photo" : at === 0 ? "Gray photo" : `${filter(stages[at - 1].id).label} ${(run.outs[at - 1] as { out?: Filtered }).out?.data ? "values" : "result"}`;
  const icon = "rounded p-1 text-muted-foreground transition hover:bg-highlight hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";
  const card = (on: boolean) => `w-full rounded-lg border p-1 text-left transition active:translate-y-px ${on ? "border-accent bg-highlight" : "border-border hover:border-accent"}`;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-2 border-y border-border py-3 text-sm">
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Photo</span>
        {SAMPLES.map(s => (
          <button key={s.src} aria-pressed={src === s.src} onClick={() => { setSrc(s.src); setFailed(null); }}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1 transition active:translate-y-px ${src === s.src ? "border-accent" : "border-border hover:border-accent"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} alt="" className="size-7 rounded object-cover" /> {s.label}
          </button>
        ))}
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 transition hover:border-accent has-focus-visible:ring-2 has-focus-visible:ring-accent">
          <ImagePlus aria-hidden className="size-4" /> Your photo
          <input type="file" accept="image/*" className="sr-only" aria-label="Use your own photo (stays in your browser)"
                 onChange={e => {
                   const file = e.target.files?.[0];
                   e.target.value = ""; // picking the same file again still fires onChange
                   if (file) { fileName.current = file.name; setFailed(null); setSrc(URL.createObjectURL(file)); }
                 }} />
        </label>
        <span className="text-xs text-muted-foreground">stays in your browser</span>
        {failed && <span role="alert" className="text-sm font-medium text-foreground">Couldn&apos;t read {failed} as an image.</span>}
        <label className="ml-auto flex items-center gap-2 text-muted-foreground">
          Pixels
          <select className="rounded-lg border border-border bg-card px-2 py-1 text-foreground" value={width} onChange={e => setWidth(+e.target.value)}>
            {WIDTHS.map(w => <option key={w} value={w}>{w} px</option>)}
          </select>
        </label>
      </div>

      <div role="group" aria-label="Starter pipelines" className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Start from</span>
        {STARTERS.map(s => (
          <button key={s.label} className="rounded-lg border border-border px-3 py-1 transition hover:border-accent active:translate-y-px"
                  onClick={() => edit(keyed(s.stages), s.stages.length - 1)}>{s.label}</button>
        ))}
        <button className="rounded-lg px-3 py-1 text-muted-foreground transition hover:text-foreground disabled:opacity-40" disabled={!stages.length}
                onClick={() => { refocus.current = "[data-key=input] > button"; edit([], -1); }}>Clear</button>
      </div>

      <ol ref={list} aria-label="Pipeline" className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
        <li className="relative" data-key="input">
          <button aria-pressed={at < 0} onClick={() => setSel(-1)} className={card(at < 0)}>
            <Thumb photo={photo} f={grayF} />
            <span className="mt-1 block truncate px-0.5 text-xs font-medium">Gray photo</span>
            <span className="block px-0.5 text-[0.7rem] text-muted-foreground">input</span>
          </button>
        </li>
        {stages.map((s, n) => {
          const o = run.outs[n], f = filter(s.id);
          return (
            <li key={s.key} data-key={s.key} className="relative">
              <ChevronRight aria-hidden className="absolute top-8 -left-2.5 size-4 text-muted-foreground" />
              <button aria-pressed={at === n} onClick={() => setSel(n)} className={card(at === n)}
                      aria-label={`Stage ${n + 1}: ${f.label}${o.input ? "" : " (blocked)"}`}>
                {o.input ? <Thumb photo={photo} f={o.out} /> : (
                  <span className="flex aspect-[3/2] w-full items-center justify-center rounded-md bg-pending"><TriangleAlert aria-hidden className="size-5 text-accent" /></span>
                )}
                <span className="mt-1 block truncate px-0.5 text-xs font-medium">{n + 1}. {f.label}</span>
                <span className="block truncate px-0.5 text-[0.7rem] text-muted-foreground">{o.input ? `→ ${NAME[o.kind]}` : "blocked"}</span>
              </button>
              <span className="mt-0.5 flex justify-center gap-1">
                <button className={icon} data-move={-1} disabled={n === 0} onClick={() => move(n, -1)} aria-label={`Move ${f.label} earlier`}><ArrowLeft aria-hidden className="size-3.5" /></button>
                <button className={icon} data-move={1} disabled={n === stages.length - 1} onClick={() => move(n, 1)} aria-label={`Move ${f.label} later`}><ArrowRight aria-hidden className="size-3.5" /></button>
                <button className={icon} onClick={() => {
                  const next = stages.filter((_, k) => k !== n), to = at > n ? at - 1 : Math.min(at, next.length - 1);
                  refocus.current = to < 0 ? "[data-key=input] > button" : `[data-key="${next[to].key}"] > button`; // the removed button took focus with it
                  edit(next, to);
                }} aria-label={`Remove ${f.label}`}><X aria-hidden className="size-3.5" /></button>
              </span>
            </li>
          );
        })}
      </ol>

      <div role="group" aria-label="Add a stage" className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="mr-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Add</span>
        {FILTERS.map(f => {
          const ok = endKind !== null && fits(endKind, f.needs);
          return (
            <button key={f.id} onClick={() => add(f.id)} title={ok ? undefined : `Needs a ${NAME[f.needs]}`}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 transition hover:border-accent active:translate-y-px ${ok ? "border-border" : "border-dashed border-border text-muted-foreground"}`}>
              <Plus aria-hidden className="size-3.5" /> {f.label}{ok ? "" : <span className="sr-only"> (needs a {NAME[f.needs]})</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-sm">
        {meta?.params.map(k => (
          <label key={k.key} className="flex items-center gap-2 text-muted-foreground">
            {k.label}
            <select className="rounded-lg border border-border bg-card px-2 py-1 text-foreground" value={String(stage.p[k.key])}
                    onChange={e => setKnob(k.key, k.options.find(o => String(o) === e.target.value)!)}>
              {k.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ))}
        {shown && (
          <div className="ml-auto flex flex-wrap items-center gap-1" role="group" aria-label="Compare">
            <button aria-pressed={mode === "side"} className={chip(mode === "side")} onClick={() => setMode("side")}>Side by side</button>
            <button aria-pressed={mode === "wipe"} className={chip(mode === "wipe")} onClick={() => setMode("wipe")}>Wipe</button>
            {mode === "wipe" && <>
              <span aria-hidden className="mx-1 h-5 w-px bg-border" />
              <button aria-pressed={zoom === 0} className={chip(zoom === 0)} onClick={() => setZoom(0)}>Fit</button>
              <button aria-pressed={zoom === 4} className={chip(zoom === 4)} onClick={() => setZoom(4)}>4×</button>
            </>}
          </div>
        )}
      </div>

      <p className="mt-4 mb-2 font-mono text-xs text-muted-foreground">
        {photo.w} × {photo.h} pixels · {at < 0 ? "input" : `stage ${at + 1} of ${stages.length}`} · {label}
        {out?.input ? ` · reads a ${NAME[at === 0 ? "gray" : (run.outs[at - 1] as { kind: keyof typeof NAME }).kind]}, gives a ${NAME[out.kind]}` : ""}
      </p>
      {!shown ? (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-6 text-sm">
          <TriangleAlert aria-hidden className="size-5 text-accent" />
          <span>{out && !out.input ? out.blocked : ""}</span>
          {out && !out.input && out.fix && (
            <button className="rounded-lg border border-accent px-3 py-1 text-accent transition hover:bg-highlight active:translate-y-px" onClick={() => { refocus.current = `li:nth-child(${at + 2}) > button`; add(out.fix!, at); }}>
              Add {filter(out.fix).label} before it
            </button>
          )}
        </div>
      ) : mode === "side" ? (
        <div className="grid grid-cols-2 gap-4">
          <figure className="mx-auto w-full" style={{ maxWidth: fit }}>
            <figcaption className={caption}>{inputLabel}</figcaption>
            <canvas ref={before} role="img" aria-label={at < 0 ? "Original photo" : `Input: ${inputLabel}`} className="pixels block w-full rounded-xl ring-1 ring-border" />
          </figure>
          <figure className="mx-auto w-full" style={{ maxWidth: fit }}>
            <figcaption className={caption}>{label}</figcaption>
            <canvas ref={after} role="img" aria-label={resultLabel} className="pixels block w-full rounded-xl ring-1 ring-border" />
          </figure>
        </div>
      ) : (
        <>
          <div tabIndex={0} role="group" aria-label="Photograph: stage input on the left of the split, result on the right"
               className="max-h-[70vh] overflow-auto rounded-xl ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <div className="relative mx-auto" style={{ width: zoom ? photo.w * zoom : fit }}>
              <canvas ref={before} role="img" aria-label={at < 0 ? "Gray original photo" : `Input: ${inputLabel}`} className="pixels block w-full" />
              <canvas ref={after} role="img" aria-label={resultLabel} className="pixels absolute inset-0 block w-full"
                      style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
              <span aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${split}%` }} />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
            {at < 0 ? "Gray original" : inputLabel} ◂
            <input type="range" min={0} max={100} value={split} onChange={e => setSplit(+e.target.value)} aria-label="Split position" className="w-64 accent-accent" />
            ▸ {label}
          </label>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          {meta ? meta.what : stages.length ? "Every stage starts from this gray image, weighted for how the eye sees red, green and blue." : "The pipeline is empty: add a stage above, or start from a ready-made one."}
        </p>
        {meta && (
          <Link href={`/algo/${meta.page}`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            {meta.label}, step by step <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
