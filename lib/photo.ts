// Photograph lab: VisuCV's own algorithms applied to a real photo, plus a per-pixel inspector.
// Everything works on a gray image (0..1); the filters call the same code as the step-through pages,
// but the plain functions, not the step generators (a 384×384 photo has ~150k pixels).
import { KERNELS, type Kernel, correlateAt, filter2d, sample } from "./algos/convolution";
import { gradient } from "./algos/edges";
import { gaussian } from "./algos/gaussian";
import { type Tensor, detect, eig2, score, structureTensor } from "./algos/harris";
import { nonlinearFilter } from "./algos/nonlinear";
import { otsuThreshold } from "./algos/otsu";
import { type Cell, type Grid, grid } from "./algos/types";

/** OpenCV's cv2.cvtColor(…, COLOR_RGB2GRAY) weights (ITU-R BT.601), so numbers match Python. */
export const GRAY_WEIGHTS = [0.299, 0.587, 0.114] as const;

export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Grid {
  const g = grid(h, w);
  for (let k = 0; k < w * h; k++)
    g.data[k] = (GRAY_WEIGHTS[0] * rgba[4 * k] + GRAY_WEIGHTS[1] * rgba[4 * k + 1] + GRAY_WEIGHTS[2] * rgba[4 * k + 2]) / 255;
  return g;
}

export type FilterId = "gray" | "otsu" | "blur" | "median" | "sharpen" | "edges" | "corners";
export type Filtered = { shown: Grid; raw: Float64Array | Float32Array; corners?: Cell[]; t?: number; tensor?: Tensor };

// Sobel kernels as the edges page applies them: divided by their positive weights (sum 4).
const SOBEL_X: Kernel = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]].map(r => r.map(v => v / 4));
const SOBEL_Y: Kernel = SOBEL_X[0].map((_, j) => SOBEL_X.map(r => r[j]));

export const FILTERS: { id: FilterId; label: string; page?: string; what: string }[] = [
  { id: "gray", label: "Grayscale", what: "Each pixel's brightness, weighted for how the eye sees red, green and blue." },
  { id: "otsu", label: "Otsu threshold", page: "otsu", what: "Pixels brighter than the histogram's best split become white." },
  { id: "blur", label: "Gaussian blur", page: "gaussian", what: "A weighted average of the neighbourhood, σ = 1.5." },
  { id: "median", label: "Median 3×3", page: "nonlinear", what: "The middle of the 9 sorted neighbours: removes specks, keeps edges." },
  { id: "sharpen", label: "Sharpen", page: "convolution", what: "Adds the difference from the neighbours back to the pixel." },
  { id: "edges", label: "Edges", page: "edges", what: "Gradient magnitude √(Gx² + Gy²) from the Sobel operator." },
  { id: "corners", label: "Harris corners", page: "harris", what: "Points where the gradient changes in every direction." },
];

const clip = (v: number) => Math.min(1, Math.max(0, v));

export function applyFilter(I: Grid, id: FilterId): Filtered {
  if (id === "otsu") {
    const t = otsuThreshold(I);
    const shown = { ...I, data: I.data.map(v => (Math.round(v * 255) > t ? 1 : 0)) };
    return { shown, raw: shown.data, t };
  }
  if (id === "blur") { const b = gaussian.run(I, { sigma: 1.5 }); return { shown: b, raw: b.data }; }
  if (id === "median") { const m = nonlinearFilter(I, { filter: "median", window: "3×3" }); return { shown: m, raw: m.data }; }
  if (id === "sharpen") {
    const raw = filter2d(I, KERNELS.sharpen, "correlation", "replicate");
    return { shown: { ...I, data: Float32Array.from(raw, clip) }, raw };
  }
  if (id === "edges") {
    const { mag } = gradient(I, "Sobel"), m = mag.reduce((a, b) => Math.max(a, b), 1e-9); // no spread: ~150k values
    return { shown: { ...I, data: Float32Array.from(mag, v => v / m) }, raw: mag };
  }
  if (id === "corners") {
    const T = structureTensor(I, 1), S = Float64Array.from({ length: I.h * I.w }, (_, k) => score(T, k, "Harris"));
    // Plateau centres can be fractional (detect); the lab marks and counts whole pixels.
    const corners = detect(S, I.h, I.w).map(([y, x]): Cell => [Math.round(y), Math.round(x)]);
    return { shown: I, raw: S, corners, tensor: T };
  }
  return { shown: I, raw: I.data };
}

export type Inspect = {
  gray: number; out: number;
  /** 3×3 table for kernel filters: value × weight = product, summing to `out` (before display clipping). */
  products?: { value: number; weight: number; product: number }[];
  extra: [string, string][];
};

const f3 = (v: number) => v.toFixed(3);
const products = (I: Grid, K: Kernel, y: number, x: number) =>
  [-1, 0, 1].flatMap(i => [-1, 0, 1].map(j => {
    const value = sample(I, y + i, x + j, "replicate"), weight = K[i + 1][j + 1];
    return { value, weight, product: value * weight };
  }));

export function inspect(I: Grid, f: Filtered, id: FilterId, y: number, x: number): Inspect {
  const k = y * I.w + x, gray = I.data[k], out = f.raw[k];
  if (id === "sharpen") return { gray, out, products: products(I, KERNELS.sharpen, y, x), extra: [["display", "clipped to 0…1"]] };
  if (id === "edges") {
    const gx = correlateAt(I, SOBEL_X, y, x, "replicate"), gy = correlateAt(I, SOBEL_Y, y, x, "replicate");
    return { gray, out, products: products(I, SOBEL_X, y, x), extra: [["Gx (table)", f3(gx)], ["Gy", f3(gy)], ["√(Gx² + Gy²)", f3(Math.hypot(gx, gy))]] };
  }
  if (id === "otsu") return { gray, out, extra: [["level", String(Math.round(gray * 255))], ["t* (Otsu)", String(f.t)], ["rule", `${Math.round(gray * 255)} ${Math.round(gray * 255) > f.t! ? ">" : "≤"} ${f.t} → ${out}`]] };
  if (id === "median") {
    const vals = [-1, 0, 1].flatMap(i => [-1, 0, 1].map(j => sample(I, y + i, x + j, "replicate"))).sort((a, b) => a - b);
    return { gray, out, extra: [["sorted 3×3", vals.map(v => Math.round(v * 255)).join(" ")], ["median (5th)", String(Math.round(vals[4] * 255))]] };
  }
  if (id === "corners") {
    const T = f.tensor!, { l1, l2 } = eig2(T.a[k], T.b[k], T.c[k]);
    return { gray, out, extra: [["λ₁, λ₂", `${f3(l1)}, ${f3(Math.max(0, l2))}`], ["corners found", String(f.corners!.length)]] };
  }
  if (id === "blur") return { gray, out, extra: [["kernel", "11 × 11 Gaussian, σ = 1.5"]] };
  return { gray, out, extra: [] };
}
