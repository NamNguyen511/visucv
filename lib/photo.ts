// Photograph lab: a pipeline of VisuCV's own algorithms applied to a real photo, stage by stage.
// Everything starts from a gray image (0..1) and calls the plain functions behind the step-through pages,
// never their step generators (a 384×384 photo has ~150k pixels; a step per pixel would crawl).
import { components } from "./algos/components";
import { KERNELS, filter2d } from "./algos/convolution";
import { chamfer, distance, show } from "./algos/distance";
import { THRESHOLDS, edges, gradient, hysteresis, nmsAt } from "./algos/edges";
import { gaussian } from "./algos/gaussian";
import { detect, harris, score, structureTensor } from "./algos/harris";
import { morphology } from "./algos/morphology";
import { nonlinear, nonlinearFilter } from "./algos/nonlinear";
import { otsuThreshold } from "./algos/otsu";
import { type Algorithm, type Cell, type Grid, type Param, type Params, grid } from "./algos/types";

/** OpenCV's cv2.cvtColor(…, COLOR_RGB2GRAY) weights (ITU-R BT.601), so numbers match Python. */
export const GRAY_WEIGHTS = [0.299, 0.587, 0.114] as const;

export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Grid {
  const g = grid(h, w);
  for (let k = 0; k < w * h; k++)
    g.data[k] = (GRAY_WEIGHTS[0] * rgba[4 * k] + GRAY_WEIGHTS[1] * rgba[4 * k + 1] + GRAY_WEIGHTS[2] * rgba[4 * k + 2]) / 255;
  return g;
}

export type FilterId = "otsu" | "morphology" | "components" | "distance" | "blur" | "kernel" | "edges" | "nonlinear" | "corners";
/** What flows between stages. A binary image is also a gray one; labels, corner points and signed values end the chain. */
export type Kind = "gray" | "binary" | "labels" | "points" | "signed";
/** `shown` is drawn as is (a label image when shown.labels); `corners` are marked on top. `data` is what the next stage
 *  reads when it differs from the picture (distance: plain d / max, without the bands). */
export type Filtered = { shown: Grid; data?: Grid; corners?: Cell[] };
export type PhotoFilter = { id: FilterId; label: string; page: string; what: string; params: Param[]; needs: "gray" | "binary"; gives: Kind };

/** The knobs of an algorithm's own page, so the lab and the page agree. */
const knobs = (a: Algorithm, ...keys: string[]) => keys.map(k => a.params.find(p => p.key === k)!);

export const FILTERS: PhotoFilter[] = [
  { id: "otsu", label: "Otsu threshold", page: "otsu", needs: "gray", gives: "binary", what: "Pixels brighter than the histogram's best split become white.", params: [] },
  { id: "morphology", label: "Morphology", page: "morphology", needs: "binary", gives: "binary", what: "Erode, dilate, open or close the white regions with a small shape B.", params: knobs(morphology, "op", "size", "shape") },
  // A photo's Otsu image has hundreds of specks, so the size filter needs bigger steps than the page's 1 / 3 / 10.
  { id: "components", label: "Components", page: "components", needs: "binary", gives: "labels", what: "Every separate white blob gets its own colour.",
    params: [knobs(components, "conn")[0], { ...knobs(components, "minSize")[0], options: [1, 10, 100] }] },
  { id: "distance", label: "Distance transform", page: "distance", needs: "binary", gives: "gray", what: "Each white pixel's distance to the nearest black one: brighter = deeper inside.", params: knobs(distance, "metric", "shading") },
  { id: "blur", label: "Gaussian blur", page: "gaussian", needs: "gray", gives: "gray", what: "A weighted average of the neighbourhood; bigger σ, wider average.", params: knobs(gaussian, "sigma") },
  { id: "kernel", label: "Convolution", page: "convolution", needs: "gray", gives: "gray", what: "Slide a 3×3 kernel and sum the products. Signed kernels show 0 as mid-gray.",
    params: [{ key: "kernel", label: "Kernel", options: Object.keys(KERNELS), default: "sharpen" }] },
  { id: "edges", label: "Canny edges", page: "edges", needs: "gray", gives: "binary", what: "Blur, take the gradient, thin it to ridge tops, keep weak edges only if they touch strong ones.", params: knobs(edges, "operator", "thresholds") },
  { id: "nonlinear", label: "Median & friends", page: "nonlinear", needs: "gray", gives: "gray", what: "Median removes specks and keeps edges; min/max erode and dilate gray levels; bilateral smooths inside regions only.", params: knobs(nonlinear, "filter", "window", "sigmaR") },
  { id: "corners", label: "Harris corners", page: "harris", needs: "gray", gives: "points", what: "Points where the gradient changes in every direction.", params: knobs(harris, "method", "window") },
];

export const filter = (id: FilterId) => FILTERS.find(f => f.id === id)!;
export const defaults = (f: PhotoFilter): Params => Object.fromEntries(f.params.map(p => [p.key, p.default]));
/** A kernel whose weights sum to 0 (Sobel, Laplacian…) gives signed values, which no gray stage can read. */
const signed = (K: number[][]) => Math.abs(K.flat().reduce((a, b) => a + b, 0)) < 1e-9;
export const gives = (id: FilterId, p: Params): Kind => (id === "kernel" && signed(KERNELS[p.kernel as string]) ? "signed" : filter(id).gives);

const clip = (v: number) => Math.min(1, Math.max(0, v));
const absMax = (a: ArrayLike<number>) => { let m = 1e-12; for (let k = 0; k < a.length; k++) m = Math.max(m, Math.abs(a[k])); return m; };
const otsu = (I: Grid): Grid => { const t = otsuThreshold(I); return { ...I, data: I.data.map(v => (Math.round(v * 255) > t ? 1 : 0)) }; };

/** Book §4.2 labeling with an explicit stack (a photo's blobs are too big for recursion), then the §4.3 size filter. */
function label(A: Grid, conn: number, minSize: number): Grid {
  const { h, w } = A, L = new Float32Array(h * w), sizes = [0];
  const nb = conn === 8 ? [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (let s = 0; s < h * w; s++) {
    if (!A.data[s] || L[s]) continue;
    const k = sizes.length, stack = [s];
    L[s] = k; sizes.push(0);
    while (stack.length) {
      const p = stack.pop()!, y = Math.floor(p / w), x = p % w;
      sizes[k]++;
      for (const [dy, dx] of nb) {
        const yy = y + dy, xx = x + dx, q = yy * w + xx;
        if (yy >= 0 && yy < h && xx >= 0 && xx < w && A.data[q] && !L[q]) { L[q] = k; stack.push(q); }
      }
    }
  }
  // Renumber the kept blobs 1, 2, 3… so the palette cycles over what's left.
  let n = 0;
  const id = sizes.map((s, k) => (k && s >= minSize ? ++n : 0));
  return { h, w, labels: true, data: L.map(v => id[v]) };
}

/** Canny as the edges page runs it (σ = 1 blur, thresholds relative to the largest gradient), minus the steps. */
function canny(I: Grid, operator: string, thresholds: string): Grid {
  const B = gaussian.run(I, { sigma: 1 }), g = gradient(B, operator), max = absMax(g.mag), [lo, hi] = THRESHOLDS[thresholds];
  const thin = Float64Array.from(g.mag, (m, k) => (m >= lo * max && nmsAt(I.w, I.h, g.mag, g.theta[k], k).keep ? m : 0));
  return { ...I, data: Float32Array.from(hysteresis(I.w, I.h, thin, lo * max, hi * max), v => (v ? 1 : 0)) };
}

/** One stage on its own. The binary stages expect a 0/1 image (run Otsu first); `runPipeline` enforces that. */
export function applyFilter(I: Grid, id: FilterId, p: Params = defaults(filter(id))): Filtered {
  if (id === "otsu") return { shown: otsu(I) };
  if (id === "morphology") return { shown: morphology.run(I, p) };
  if (id === "components") return { shown: label(I, +p.conn, +p.minSize) };
  if (id === "distance") {
    const D = chamfer(I, p.metric as Parameters<typeof chamfer>[1]), m = absMax(D);
    return { shown: show(D, I, m, p.shading === "bands"), data: { ...I, data: Float32Array.from(D, d => d / m) } };
  }
  if (id === "blur") return { shown: gaussian.run(I, p) };
  if (id === "kernel") {
    const K = KERNELS[p.kernel as string], raw = filter2d(I, K, "convolution", "reflect 101");
    const s = signed(K), m = absMax(raw);
    return { shown: { ...I, data: Float32Array.from(raw, v => (s ? 0.5 + v / (2 * m) : clip(v))) } };
  }
  if (id === "edges") return { shown: canny(I, String(p.operator), String(p.thresholds)) };
  if (id === "nonlinear") return { shown: nonlinearFilter(I, p) };
  if (id === "corners") {
    const T = structureTensor(I, p.window === "5×5" ? 2 : 1), S = Float64Array.from({ length: I.h * I.w }, (_, k) => score(T, k, String(p.method)));
    // Plateau centres can be fractional (detect); the lab marks whole pixels.
    return { shown: I, corners: detect(S, I.h, I.w).map(([y, x]): Cell => [Math.round(y), Math.round(x)]) };
  }
  return { shown: I };
}

export type Stage = { id: FilterId; p: Params };
/** A stage that ran (its input, what it read it as, its result and what that is), or why it couldn't. */
export type StageOut = { input: Grid; out: Filtered; kind: Kind } | { input?: undefined; blocked: string; fix?: FilterId };
export type Run = { I: Grid; stages: Stage[]; outs: StageOut[] };

export const NAME: Record<Kind, string> = { gray: "gray image", binary: "black-and-white image", labels: "label image", points: "list of corners", signed: "signed (±) image" };
export const fits = (have: Kind, need: "gray" | "binary") => have === need || (need === "gray" && have === "binary");
const same = (a?: Stage, b?: Stage) => !!a && !!b && a.id === b.id && JSON.stringify(a.p) === JSON.stringify(b.p);

/** Runs the stages in order on the gray photo `I`. Stages before the first change reuse `prev`'s results (the same
 *  objects), so a knob only recomputes what's downstream of it. A stage whose input doesn't fit stops the chain. */
export function runPipeline(I: Grid, stages: Stage[], prev?: Run): Run {
  const outs: StageOut[] = [];
  let data = I, kind: Kind = "gray", reuse = prev?.I === I;
  stages.forEach((s, n) => {
    const f = filter(s.id), last = outs[n - 1];
    reuse &&= same(prev!.stages[n], s);
    if (last && !last.input) return outs.push({ blocked: "Waits for the stage before it." });
    if (!fits(kind, f.needs))
      return outs.push(f.needs === "binary" && kind === "gray" ? { blocked: "Needs a black-and-white image: add Otsu threshold before it.", fix: "otsu" }
        : { blocked: `Needs a ${NAME[f.needs]}, but gets a ${NAME[kind]}. Nothing after ${filter(stages[n - 1].id).label} can read that: move this stage earlier.` });
    const o = reuse ? (prev!.outs[n] as StageOut & { input: Grid }) : { input: data, out: applyFilter(data, s.id, s.p), kind: gives(s.id, s.p) };
    outs.push(o);
    data = o.out.data ?? o.out.shown; kind = o.kind;
  });
  return { I, stages, outs };
}

const st = (id: FilterId, p: Params = {}): Stage => ({ id, p: { ...defaults(filter(id)), ...p } });
/** Ready-made pipelines to start from. */
export const STARTERS: { label: string; stages: Stage[] }[] = [
  { label: "Find the blobs", stages: [st("blur", { sigma: 2 }), st("otsu"), st("morphology", { op: "open", size: 5, shape: "disk" }), st("components", { conn: 8, minSize: 100 })] },
  { label: "Clean edges", stages: [st("nonlinear", { window: "5×5" }), st("edges"), st("morphology", { op: "close" })] },
  { label: "How deep inside", stages: [st("otsu"), st("morphology", { op: "open", size: 5, shape: "disk" }), st("distance")] },
  { label: "Corners", stages: [st("blur"), st("corners")] },
];
