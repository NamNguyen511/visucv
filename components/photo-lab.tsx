"use client";
// Photograph lab: one real photo, VisuCV's filters on all of it, and an inspector for one pixel.
// Photos are read and processed in the browser only; "Your photo" is never uploaded anywhere.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ImagePlus } from "lucide-react";
import { type Grid, grid } from "@/lib/algos/types";
import { FILTERS, type FilterId, GRAY_WEIGHTS, applyFilter, inspect, toGray } from "@/lib/photo";
import { GridCanvas } from "./grid-canvas";

const SAMPLES = [
  { src: "/photos/astronaut.jpg", label: "Astronaut" },
  { src: "/photos/chelsea.jpg", label: "Cat" },
  { src: "/photos/camera.jpg", label: "Camera" },
];
const WIDTHS = [96, 192, 384];
const ZOOMS = [["Fit", 0], ["4×", 4], ["8×", 8], ["16×", 16]] as const;
type View = "color" | FilterId;
type Photo = { w: number; h: number; rgba: Uint8ClampedArray };

async function load(src: string, width: number): Promise<Photo> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const w = Math.min(width, img.width), h = Math.round((img.height * w) / img.width);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return { w, h, rgba: ctx.getImageData(0, 0, w, h).data };
}

/** Draws a gray grid (or the colour photo) into a canvas at one canvas pixel per image pixel. */
function paint(c: HTMLCanvasElement | null, p: Photo, g: Grid | null, marks: [number, number][] = []) {
  if (!c) return;
  c.width = p.w; c.height = p.h;
  const img = new ImageData(p.w, p.h);
  for (let k = 0; k < p.w * p.h; k++) {
    if (g) { const v = Math.round(g.data[k] * 255); img.data.set([v, v, v, 255], 4 * k); }
    else img.data.set(p.rgba.subarray(4 * k, 4 * k + 4), 4 * k);
  }
  for (const [y, x] of marks) // corners: a small accent cross
    for (const [dy, dx] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < p.h && xx >= 0 && xx < p.w) img.data.set([45, 212, 191, 255], 4 * (yy * p.w + xx));
    }
  c.getContext("2d")!.putImageData(img, 0, 0);
}

const crop = (g: Grid, y: number, x: number, r: number): Grid => {
  const n = 2 * r + 1, out = grid(n, n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const yy = Math.min(g.h - 1, Math.max(0, y + i - r)), xx = Math.min(g.w - 1, Math.max(0, x + j - r));
      out.data[i * n + j] = g.data[yy * g.w + xx];
    }
  return out;
};
/** Frees "Your photo"'s blob URL once nothing will read it again (sample paths are left alone). */
const forget = (src: string | null) => { if (src?.startsWith("blob:")) URL.revokeObjectURL(src); };
const f3 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(3));

export function PhotoLab() {
  const [src, setSrc] = useState(SAMPLES[0].src);
  const [width, setWidth] = useState(192);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [view, setView] = useState<View>("edges");
  const [zoom, setZoom] = useState(0);
  const [compare, setCompare] = useState(false);
  const [split, setSplit] = useState(50);
  const [px, setPx] = useState<[number, number]>([0, 0]);
  const [pinned, setPinned] = useState(false);
  const [failed, setFailed] = useState<string | null>(null); // name of a file that wouldn't decode
  const fileName = useRef("that file"), lastGood = useRef<string | null>(null);
  const before = useRef<HTMLCanvasElement>(null), after = useRef<HTMLCanvasElement>(null);
  const marker = useRef<HTMLSpanElement>(null), size = useRef<[number, number] | null>(null);

  useEffect(() => {
    let live = true;
    load(src, width).then(p => {
      if (!live) return;
      // Same spot in the new image (resolution or photo change), so a pinned pixel stays put.
      const old = size.current;
      setPx(([a, b]) => old ? [Math.floor(((a + 0.5) * p.h) / old[0]), Math.floor(((b + 0.5) * p.w) / old[1])] : [Math.floor(p.h / 3), Math.floor(p.w / 2)]);
      size.current = [p.h, p.w];
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
  const id: FilterId = view === "color" ? "gray" : view;
  const filtered = useMemo(() => (gray ? applyFilter(gray, id) : null), [gray, id]);

  useEffect(() => {
    if (!photo || !gray || !filtered) return;
    paint(before.current, photo, compare ? null : gray);
    paint(after.current, photo, view === "color" ? null : filtered.shown, filtered.corners);
  }, [photo, gray, filtered, view, compare]);

  if (!photo || !gray || !filtered) return <div className="mt-8 aspect-[3/2] animate-pulse rounded-2xl bg-pending" aria-label="Loading photograph" />;

  const [y, x] = [Math.min(px[0], photo.h - 1), Math.min(px[1], photo.w - 1)], k = y * photo.w + x;
  const info = inspect(gray, filtered, id, y, x), meta = FILTERS.find(f => f.id === id)!;
  const rgb = [photo.rgba[4 * k], photo.rgba[4 * k + 1], photo.rgba[4 * k + 2]];
  const shown = view === "color" ? null : filtered.shown.data[k];

  const pick = (e: React.PointerEvent<HTMLDivElement>, pin: boolean) => {
    if (pinned && !pin) return;
    const r = e.currentTarget.getBoundingClientRect();
    const xx = Math.floor(((e.clientX - r.left) / r.width) * photo.w), yy = Math.floor(((e.clientY - r.top) / r.height) * photo.h);
    if (xx >= 0 && xx < photo.w && yy >= 0 && yy < photo.h) setPx([yy, xx]);
    if (pin) setPinned(p => !p);
  };
  const keys = (e: React.KeyboardEvent) => {
    const d = ({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, number[]>)[e.key];
    if (!d) return;
    e.preventDefault();
    setPinned(true);
    setPx(([a, b]) => [Math.min(photo.h - 1, Math.max(0, a + d[0])), Math.min(photo.w - 1, Math.max(0, b + d[1]))]);
    requestAnimationFrame(() => marker.current?.scrollIntoView({ block: "nearest", inline: "nearest" })); // zoomed views
  };
  const chip = (on: boolean) => `rounded-lg px-3 py-1.5 text-sm transition active:translate-y-px ${on ? "bg-highlight font-medium text-accent" : "text-muted-foreground hover:text-foreground"}`;
  const cssW = zoom ? photo.w * zoom : undefined;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter">
          <button aria-pressed={view === "color"} className={chip(view === "color")} onClick={() => setView("color")}>Colour</button>
          {FILTERS.map(f => <button key={f.id} aria-pressed={view === f.id} className={chip(view === f.id)} onClick={() => setView(f.id)}>{f.label}</button>)}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Pixels
          <select className="rounded-lg border border-border bg-card px-2 py-1 text-foreground" value={width} onChange={e => setWidth(+e.target.value)}>
            {WIDTHS.map(w => <option key={w} value={w}>{w} wide</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
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
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <section aria-label="Photograph">
          <div className="mb-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
            <span>{photo.w} × {photo.h} pixels · {view === "color" ? "colour" : meta.label}{compare ? " · left: original, right: filtered" : ""}</span>
            <span>{pinned ? "pinned · click to unpin" : "hover to inspect · click to pin"}</span>
          </div>
          {/* The scroll box takes focus: a ring on the inner image would be clipped by overflow-auto. */}
          <div tabIndex={0} onKeyDown={keys} aria-label="Photograph: arrow keys move the inspected pixel"
               className="max-h-[70vh] overflow-auto rounded-xl ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <div className="relative mx-auto cursor-crosshair"
                 style={{ width: cssW ?? `min(100%, ${(70 * photo.w) / photo.h}vh)` /* Fit: whole photo, no scrolling */ }}
                 onPointerMove={e => pick(e, false)} onClick={e => pick(e as unknown as React.PointerEvent<HTMLDivElement>, true)}>
              <canvas ref={before} className="pixels block w-full" aria-hidden={!compare} />
              <canvas ref={after} className="pixels absolute inset-0 block w-full" role="img" aria-label={`${meta.label} of the photo`}
                      style={compare ? { clipPath: `inset(0 0 0 ${split}%)` } : undefined} />
              <span ref={marker} aria-hidden className="pointer-events-none absolute border-2 border-cursor"
                    style={{ left: `${(x / photo.w) * 100}%`, top: `${(y / photo.h) * 100}%`, width: `max(${100 / photo.w}%, 6px)`, height: `max(${100 / photo.h}%, 6px)` }} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {ZOOMS.map(([label, z]) => <button key={label} aria-pressed={zoom === z} className={chip(zoom === z)} onClick={() => setZoom(z)}>{label}</button>)}
            <label className="ml-auto flex items-center gap-2 text-muted-foreground">
              <input type="checkbox" className="accent-accent" checked={compare} onChange={e => setCompare(e.target.checked)} /> Compare with the original
            </label>
            {compare && <input type="range" min={0} max={100} value={split} onChange={e => setSplit(+e.target.value)} aria-label="Split position" className="w-40 accent-accent" />}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{view === "color" ? "The photo as your screen shows it: three numbers per pixel." : meta.what}</p>
        </section>

        <aside aria-label="Pixel inspector" className="self-start rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-20">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Inside one pixel</h2>
            <span className="font-mono text-sm">(x, y) = ({x}, {y})</span>
          </div>

          <ol className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 font-mono text-sm">
            <li className="contents"><span className="text-xs uppercase tracking-wider text-muted-foreground">RGB</span>
              <span className="flex items-center gap-2"><i className="inline-block size-4 rounded ring-1 ring-border" style={{ background: `rgb(${rgb.join(",")})` }} />{rgb.join(" / ")}</span></li>
            <li className="contents"><span className="text-xs uppercase tracking-wider text-muted-foreground">gray</span>
              <span>{f3(info.gray)}<br /><span className="text-xs text-muted-foreground">= ({GRAY_WEIGHTS.map((w, n) => `${String(w).slice(1)}·${rgb[n]}`).join(" + ")}) / 255</span></span></li>
            {view !== "color" && view !== "gray" && <li className="contents"><span className="text-xs uppercase tracking-wider text-muted-foreground">{meta.label}</span><span>{f3(info.out)}</span></li>}
            {shown !== null && <li className="contents"><span className="text-xs uppercase tracking-wider text-muted-foreground">shown</span><span>{f3(shown)} <span className="text-muted-foreground">({Math.round(shown * 255)} of 255)</span></span></li>}
          </ol>

          {info.products && (
            <div className="mt-4">
              <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Neighbourhood × kernel</h3>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {info.products.map((p, n) => (
                  <span key={n} className={`rounded-md border px-1.5 py-1 text-center font-mono text-[11px] leading-4 ${n === 4 ? "border-accent bg-highlight" : "border-border"}`}>
                    {p.value.toFixed(2)} × {+p.weight.toFixed(2)}<br /><b className="font-semibold">{p.product >= 0 ? " " : ""}{p.product.toFixed(3)}</b>
                  </span>
                ))}
              </div>
              <p className="mt-1.5 font-mono text-xs text-muted-foreground">sum = {info.products.reduce((a, p) => a + p.product, 0).toFixed(3)}</p>
            </div>
          )}

          {info.extra.length > 0 && (
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-sm">
              {info.extra.map(([a, b]) => <div key={a} className="contents"><dt className="text-xs uppercase tracking-wider text-muted-foreground">{a}</dt><dd className="break-words">{b}</dd></div>)}
            </dl>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <GridCanvas title="gray, 15 × 15" grid={crop(gray, y, x, 7)} read={[[6, 6], [6, 7], [6, 8], [7, 6], [7, 8], [8, 6], [8, 7], [8, 8]]} write={[[7, 7]]} />
            <GridCanvas title={view === "color" ? "gray (no filter)" : `${meta.label}, 15 × 15`} grid={crop(filtered.shown, y, x, 7)} write={[[7, 7]]}
                        shapes={view === "corners" ? filtered.corners!.filter(([cy, cx]) => Math.abs(cy - y) <= 7 && Math.abs(cx - x) <= 7).map(([cy, cx]) => ({ kind: "point" as const, x: cx - x + 7, y: cy - y + 7 })) : undefined} />
          </div>

          {meta.page && view !== "color" && (
            <Link href={`/algo/${meta.page}`} className="mt-4 inline-flex items-center gap-1 text-sm text-accent hover:underline">
              {meta.label}, step by step <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
