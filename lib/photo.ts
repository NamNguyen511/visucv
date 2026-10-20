// Photograph lab: VisuCV's own algorithms applied to a real photo, shown next to the original.
// Everything works on a gray image (0..1) and calls the plain functions behind the step-through pages,
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

export type FilterId = "gray" | "otsu" | "morphology" | "components" | "distance" | "blur" | "kernel" | "edges" | "nonlinear" | "corners";
/** `shown` is drawn as is (a label image when shown.labels); `corners` are marked on top. */
export type Filtered = { shown: Grid; corners?: Cell[] };
export type PhotoFilter = { id: FilterId; label: string; page?: string; what: string; params: Param[]; binary?: true };

/** The knobs of an algorithm's own page, so the lab and the page agree. */
const knobs = (a: Algorithm, ...keys: string[]) => keys.map(k => a.params.find(p => p.key === k)!);

export const FILTERS: PhotoFilter[] = [
  { id: "gray", label: "Grayscale", what: "Each pixel's brightness, weighted for how the eye sees red, green and blue.", params: [] },
  { id: "otsu", label: "Otsu threshold", page: "otsu", what: "Pixels brighter than the histogram's best split become white.", params: [] },
  { id: "morphology", label: "Morphology", page: "morphology", binary: true, what: "Erode, dilate, open or close the white regions with a small shape B.", params: knobs(morphology, "op", "size", "shape") },
  // A photo's Otsu image has hundreds of specks, so the size filter needs bigger steps than the page's 1 / 3 / 10.
  { id: "components", label: "Components", page: "components", binary: true, what: "Every separate white blob gets its own colour.",
    params: [knobs(components, "conn")[0], { ...knobs(components, "minSize")[0], options: [1, 10, 100] }] },
  { id: "distance", label: "Distance transform", page: "distance", binary: true, what: "Each white pixel's distance to the nearest black one: brighter = deeper inside.", params: knobs(distance, "metric", "shading") },
  { id: "blur", label: "Gaussian blur", page: "gaussian", what: "A weighted average of the neighbourhood; bigger σ, wider average.", params: knobs(gaussian, "sigma") },
  { id: "kernel", label: "Convolution", page: "convolution", what: "Slide a 3×3 kernel and sum the products. Signed kernels show 0 as mid-gray.",
    params: [{ key: "kernel", label: "Kernel", options: Object.keys(KERNELS), default: "sharpen" }] },
  { id: "edges", label: "Canny edges", page: "edges", what: "Blur, take the gradient, thin it to ridge tops, keep weak edges only if they touch strong ones.", params: knobs(edges, "operator", "thresholds") },
  { id: "nonlinear", label: "Median & friends", page: "nonlinear", what: "Median removes specks and keeps edges; min/max erode and dilate gray levels; bilateral smooths inside regions only.", params: knobs(nonlinear, "filter", "window", "sigmaR") },
  { id: "corners", label: "Harris corners", page: "harris", what: "Points where the gradient changes in every direction.", params: knobs(harris, "method", "window") },
];

export const defaults = (f: PhotoFilter): Params => Object.fromEntries(f.params.map(p => [p.key, p.default]));

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

export function applyFilter(I: Grid, id: FilterId, p: Params = defaults(FILTERS.find(f => f.id === id)!)): Filtered {
  const A = FILTERS.find(f => f.id === id)!.binary ? otsu(I) : I;
  if (id === "otsu") return { shown: otsu(I) };
  if (id === "morphology") return { shown: morphology.run(A, p) };
  if (id === "components") return { shown: label(A, +p.conn, +p.minSize) };
  if (id === "distance") { const D = chamfer(A, p.metric as Parameters<typeof chamfer>[1]); return { shown: show(D, A, absMax(D), p.shading === "bands") }; }
  if (id === "blur") return { shown: gaussian.run(I, p) };
  if (id === "kernel") {
    const K = KERNELS[p.kernel as string], raw = filter2d(I, K, "convolution", "reflect 101");
    const signed = Math.abs(K.flat().reduce((a, b) => a + b, 0)) < 1e-9, m = absMax(raw);
    return { shown: { ...I, data: Float32Array.from(raw, v => (signed ? 0.5 + v / (2 * m) : clip(v))) } };
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
