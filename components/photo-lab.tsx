"use client";
// Photograph lab: one real photo, every photo-sized VisuCV algorithm as a live thumbnail, and the chosen
// one's result next to the original. Photos are read and processed in the browser only; "Your photo" is
// never uploaded anywhere.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ImagePlus } from "lucide-react";
import type { Params } from "@/lib/algos/types";
import { LABEL_COLORS } from "@/lib/pixel";
import { FILTERS, type FilterId, type Filtered, applyFilter, defaults, toGray } from "@/lib/photo";

const SAMPLES = [
  { src: "/photos/astronaut.jpg", label: "Astronaut" },
  { src: "/photos/chelsea.jpg", label: "Cat" },
  { src: "/photos/camera.jpg", label: "Camera" },
];
const WIDTHS = [96, 192, 384];
const THUMB_W = 96;
type Photo = { w: number; h: number; rgba: Uint8ClampedArray };
type Mode = "side" | "wipe";

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

function Thumb({ photo, f }: { photo: Photo; f: Filtered }) {
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
  const [small, setSmall] = useState<Photo | null>(null); // the thumbnails' copy
  const [id, setId] = useState<FilterId>("edges");
  const [knobs, setKnobs] = useState<Partial<Record<FilterId, Params>>>({}); // each filter keeps its own settings
  const [mode, setMode] = useState<Mode>("side");
  const [zoom, setZoom] = useState(0);
  const [split, setSplit] = useState(50);
  const [failed, setFailed] = useState<string | null>(null); // name of a file that wouldn't decode
  const fileName = useRef("that file"), lastGood = useRef<string | null>(null);
  const before = useRef<HTMLCanvasElement>(null), after = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let live = true;
    Promise.all([load(src, width), load(src, THUMB_W)]).then(([p, s]) => {
      if (!live) return;
      if (lastGood.current !== src) forget(lastGood.current); // a resolution change re-reads the same file
      lastGood.current = src;
      setPhoto(p); setSmall(s);
    }).catch(() => {
      if (!live) return;
      forget(src);
      setFailed(fileName.current);
      if (lastGood.current) setSrc(lastGood.current); // back to the last photo that worked
    });
    return () => { live = false; };
  }, [src, width]);
  useEffect(() => () => forget(lastGood.current), []);

  const meta = FILTERS.find(f => f.id === id)!, p = knobs[id] ?? defaults(meta);
  const gray = useMemo(() => (photo ? toGray(photo.rgba, photo.w, photo.h) : null), [photo]);
  const filtered = useMemo(() => (gray ? applyFilter(gray, id, p) : null), [gray, id, JSON.stringify(p)]); // eslint-disable-line react-hooks/exhaustive-deps
  const thumbs = useMemo(() => {
    if (!small) return null;
    const g = toGray(small.rgba, small.w, small.h);
    return FILTERS.map(f => applyFilter(g, f.id));
  }, [small]);

  useEffect(() => {
    if (!photo || !gray || !filtered) return;
    // The wipe compares like with like (gray to result), so a subtle filter isn't drowned out by the colour.
    paint(before.current, photo, mode === "wipe" ? { shown: gray } : null);
    paint(after.current, photo, filtered);
  }, [photo, gray, filtered, mode]);

  if (!photo || !small || !filtered || !thumbs) return <div className="mt-8 aspect-[3/2] animate-pulse rounded-2xl bg-pending" role="status" aria-label="Loading photograph" />;

  const chip = (on: boolean) => `rounded-lg px-3 py-1.5 text-sm transition active:translate-y-px ${on ? "bg-highlight font-medium text-accent" : "text-muted-foreground hover:text-foreground"}`;
  const fit = `min(100%, ${(62 * photo.w) / photo.h}vh)`; // whole photo fits a screen's height (once scrolled to)
  const caption = "mb-1.5 font-mono text-xs uppercase tracking-widest text-muted-foreground";
  const resultLabel = `${meta.label} of the photo`;

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

      <div role="group" aria-label="Algorithm" className="mt-4 grid grid-cols-5 gap-2 xl:grid-cols-10">
        {FILTERS.map((f, n) => (
          <button key={f.id} aria-pressed={id === f.id} onClick={() => setId(f.id)}
                  className={`rounded-lg border p-1 text-left transition active:translate-y-px ${id === f.id ? "border-accent bg-highlight" : "border-border hover:border-accent"}`}>
            <Thumb photo={small} f={thumbs[n]} />
            <span className={`mt-1 block truncate px-0.5 text-xs ${id === f.id ? "font-medium text-accent" : "text-muted-foreground"}`}>{f.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {meta.params.map(k => (
          <label key={k.key} className="flex items-center gap-2 text-muted-foreground">
            {k.label}
            <select className="rounded-lg border border-border bg-card px-2 py-1 text-foreground" value={String(p[k.key])}
                    onChange={e => setKnobs(all => ({ ...all, [id]: { ...p, [k.key]: k.options.find(o => String(o) === e.target.value)! } }))}>
              {k.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-1" role="group" aria-label="Compare">
          <button aria-pressed={mode === "side"} className={chip(mode === "side")} onClick={() => setMode("side")}>Side by side</button>
          <button aria-pressed={mode === "wipe"} className={chip(mode === "wipe")} onClick={() => setMode("wipe")}>Wipe</button>
          {mode === "wipe" && <>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <button aria-pressed={zoom === 0} className={chip(zoom === 0)} onClick={() => setZoom(0)}>Fit</button>
            <button aria-pressed={zoom === 4} className={chip(zoom === 4)} onClick={() => setZoom(4)}>4×</button>
          </>}
        </div>
      </div>

      <p className="mt-4 mb-2 font-mono text-xs text-muted-foreground">
        {photo.w} × {photo.h} pixels · {meta.label}{meta.binary ? " · on Otsu's black-and-white result" : ""}
      </p>
      {mode === "side" ? (
        <div className="grid grid-cols-2 gap-4">
          <figure className="mx-auto w-full" style={{ maxWidth: fit }}>
            <figcaption className={caption}>Original</figcaption>
            <canvas ref={before} role="img" aria-label="Original photo" className="pixels block w-full rounded-xl ring-1 ring-border" />
          </figure>
          <figure className="mx-auto w-full" style={{ maxWidth: fit }}>
            <figcaption className={caption}>{meta.label}</figcaption>
            <canvas ref={after} role="img" aria-label={resultLabel} className="pixels block w-full rounded-xl ring-1 ring-border" />
          </figure>
        </div>
      ) : (
        <>
          <div tabIndex={0} role="group" aria-label="Photograph: original on the left of the split, result on the right"
               className="max-h-[70vh] overflow-auto rounded-xl ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <div className="relative mx-auto" style={{ width: zoom ? photo.w * zoom : fit }}>
              <canvas ref={before} role="img" aria-label="Gray original photo" className="pixels block w-full" />
              <canvas ref={after} role="img" aria-label={resultLabel} className="pixels absolute inset-0 block w-full"
                      style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
              <span aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${split}%` }} />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
            Gray original ◂
            <input type="range" min={0} max={100} value={split} onChange={e => setSplit(+e.target.value)} aria-label="Split position" className="w-64 accent-accent" />
            ▸ {meta.label}
          </label>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">{meta.what}</p>
        {meta.page && (
          <Link href={`/algo/${meta.page}`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            {meta.label}, step by step <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
