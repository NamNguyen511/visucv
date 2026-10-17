// Corner detection (book Ch. 20, §20.1–20.3): the structure tensor M (eq. 20.1), the Harris
// response R = det M − k·trace² (eq. 20.2) and the Shi-Tomasi score min(λ₁, λ₂) (eq. 20.3).
// Gradients are the Ch. 12 Sobel ones; the window is a plain box sum; borders repeat the edge pixel.
import { gradient } from "./edges";
import { type Algorithm, type Cell, type Grid, type Params, type Shape, type Step, grid } from "./types";

export const K = 0.04;
const THRESHOLD = 0.1; // corners: score > 0.1 · max score, at a 3×3 local maximum

/** Eigenvalues (λ₁ ≥ λ₂) and the λ₁ eigenvector angle of [a b; b c]. */
export function eig2(a: number, b: number, c: number) {
  const mean = (a + c) / 2, rad = Math.hypot((a - c) / 2, b);
  return { l1: mean + rad, l2: mean - rad, theta: 0.5 * Math.atan2(2 * b, a - c) };
}

export type Tensor = { a: Float64Array; b: Float64Array; c: Float64Array };

/** M at every pixel: box sums of Ix², IxIy, Iy² over the (2r+1)² window. */
export function structureTensor(I: Grid, r: number): Tensor {
  const { ix, iy } = gradient(I, "Sobel"), { h, w } = I, n = h * w;
  const T: Tensor = { a: new Float64Array(n), b: new Float64Array(n), c: new Float64Array(n) };
  const cl = (v: number, m: number) => Math.min(m - 1, Math.max(0, v));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let i = -r; i <= r; i++)
        for (let j = -r; j <= r; j++) {
          const q = cl(y + i, h) * w + cl(x + j, w), k = y * w + x;
          T.a[k] += ix[q] * ix[q]; T.b[k] += ix[q] * iy[q]; T.c[k] += iy[q] * iy[q];
        }
  return T;
}

export function score(T: Tensor, k: number, method: string): number {
  const { a, b, c } = { a: T.a[k], b: T.b[k], c: T.c[k] };
  return method === "Shi-Tomasi" ? eig2(a, b, c).l2 : a * c - b * b - K * (a + c) ** 2;
}

/** Corners: score above THRESHOLD · max at a 3×3 local maximum. A box window makes flat plateaus of
 *  equal scores (equal within roundoff); each plateau gives one corner, at its centre (may be fractional). */
export function detect(S: Float64Array, h: number, w: number): Cell[] {
  const mx = Math.max(...S), t = THRESHOLD * mx, eps = 1e-9 * mx, out: Cell[] = [];
  const near = (y: number, x: number) => {
    const r: number[] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
      if ((i || j) && y + i >= 0 && y + i < h && x + j >= 0 && x + j < w) r.push((y + i) * w + x + j);
    return r;
  };
  const seen = new Uint8Array(h * w);
  for (let k = 0; k < h * w; k++) {
    if (S[k] <= t || seen[k] || near(Math.floor(k / w), k % w).some(q => S[q] > S[k] + eps)) continue;
    // Flood the plateau; it's a maximum only if nothing bordering it is higher.
    const plateau = [k], stack = [k];
    let max = true;
    seen[k] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      for (const q of near(Math.floor(c / w), c % w)) {
        if (S[q] > S[k] + eps) max = false;
        else if (!seen[q] && S[q] >= S[k] - eps) { seen[q] = 1; plateau.push(q); stack.push(q); }
      }
    }
    if (max) out.push([plateau.reduce((a, q) => a + Math.floor(q / w), 0) / plateau.length, plateau.reduce((a, q) => a + (q % w), 0) / plateau.length]);
  }
  return out;
}

const N = 24;
export function sampleImage(image: string): Grid {
  const I = grid(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      I.data[y * N + x] = image === "checkerboard"
        ? (Math.floor(x / 6) + Math.floor(y / 6)) % 2 === 0 ? 0.8 : 0.2
        : (x >= 3 && x <= 10 && y >= 3 && y <= 10) || Math.abs(x - 16) + Math.abs(y - 15) <= 5 ? 0.85 : 0.15;
  return I;
}

const radius = (p: Params) => (p.window === "5×5" ? 2 : 1);
const scores = (T: Tensor, n: number, method: string) => Float64Array.from({ length: n }, (_, k) => score(T, k, method));

/** Harris R is signed (mid-gray = 0) and √-compressed so edges stay visible next to strong corners. */
function view(S: Float64Array, h: number, w: number, method: string, upto = Infinity): Grid {
  const m = Math.max(1e-12, ...S.map(Math.abs)), g = grid(h, w, NaN);
  S.forEach((v, k) => {
    if (k <= upto) g.data[k] = method === "Shi-Tomasi" ? v / m : 0.5 + 0.5 * Math.sign(v) * Math.sqrt(Math.abs(v) / m);
  });
  return g;
}

const e = (v: number) => (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(1) : v.toFixed(3));

export const harris: Algorithm = {
  meta: {
    id: "harris",
    title: "Harris & Shi-Tomasi Corners",
    topic: "Features & motion",
    ref: "Birchfield, Ch. 20 — Feature Detection and Matching",
    lead: "Sum the gradients around each pixel into a 2×2 matrix; when both its eigenvalues are large, the pixel is a corner you can find again.",
    hook: "Points you can find again in another image.",
  },
  explain: {
    ideas: [
      { term: "Structure tensor", text: "M collects the window's gradients: the Chapter 6 covariance matrix, built from gradients instead of pixel positions." },
      { term: "Read the eigenvalues", text: "Both small: flat. One large: an edge. Both large: a corner, the gradients point in every direction." },
      { term: "Harris", text: "det M − k·(trace M)² ranks corners without computing eigenvalues: positive at corners, negative at edges." },
      { term: "Shi-Tomasi", text: "Uses the smaller eigenvalue directly: a corner is only as strong as its weakest direction." },
    ],
    formulas: [
      { label: "Structure tensor (book eq. 20.1)", tex: String.raw`M=\sum_{\text{window}}\begin{bmatrix}I_x^2 & I_xI_y\\ I_xI_y & I_y^2\end{bmatrix}` },
      { label: "Harris response (book eq. 20.2)", tex: String.raw`\begin{gathered}R=\det M-k\,(\operatorname{trace} M)^2\\ =\lambda_1\lambda_2-k(\lambda_1+\lambda_2)^2,\quad k\approx 0.04\end{gathered}` },
      { label: "Shi-Tomasi (book eq. 20.3)", tex: String.raw`R_{ST}=\min(\lambda_1,\lambda_2)` },
    ],
    tryThis: [
      "Step along the square's top edge, then onto its corner: the ellipse goes from a thin line to a fat blob.",
      "Switch Score to Shi-Tomasi and compare the corners found with Harris.",
      "Pick the checkerboard: the X-shaped junctions are corners too, even though no shape has a tip there.",
    ],
  },
  params: [
    { key: "image", label: "Image", options: ["shapes", "checkerboard"], default: "shapes", input: true },
    { key: "method", label: "Score", options: ["Harris", "Shi-Tomasi"], default: "Harris" },
    { key: "window", label: "Window", options: ["3×3", "5×5"], default: "3×3" },
  ],
  pseudocode: [
    "CORNERS(I):",
    "  Ix, Iy ← Sobel gradients of I",
    "  for each pixel p:",
    "    M ← Σ_window [Ix²  IxIy ; IxIy  Iy²]",
    "    R(p) ← det M − k·(trace M)²     ▸ Harris",
    "    R(p) ← min(λ₁, λ₂)              ▸ Shi-Tomasi",
    "  corners ← R > 0.1·max R at 3×3 local maxima",
    "  return corners",
  ],

  panelTitles: p => ["I", p.method === "Shi-Tomasi" ? "min(λ₁, λ₂)" : "R  (mid-gray = 0, √-scaled)"],

  sampleInput: ({ image }) => sampleImage(String(image)),

  run(I, p) {
    return view(scores(structureTensor(I, radius(p)), I.h * I.w, String(p.method)), I.h, I.w, String(p.method));
  },

  *steps(I, p): Generator<Step, void> {
    const r = radius(p), method = String(p.method), { h, w } = I, n = h * w;
    const T = structureTensor(I, r), S = scores(T, n, method), { mag } = gradient(I, "Sobel");
    const l1max = Math.max(1e-12, ...T.a.map((a, k) => eig2(a, T.b[k], T.c[k]).l1)), smax = Math.max(...S);
    yield {
      grids: [I, grid(h, w, NaN)], src: 0, dst: 1, read: [], write: [], line: 1,
      vars: { "max |∇I|": e(Math.max(...mag)), k: K, window: `${2 * r + 1}×${2 * r + 1}` },
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const k = y * w + x, { l1, l2, theta } = eig2(T.a[k], T.b[k], T.c[k]);
        // Ellipse axes ∝ √λ, the largest in the image drawn as long as the window is wide.
        const s = (r + 0.5) / Math.sqrt(l1max), win: Cell[] = [];
        for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) win.push([y + i, x + j]);
        const kind = S[k] > THRESHOLD * smax ? "corner" : l1 > 0.1 * l1max ? "edge" : "flat";
        const shapes: Shape[] = [{ kind: "ellipse", cx: x, cy: y, a: s * Math.sqrt(Math.max(l1, 0)), b: s * Math.sqrt(Math.max(l2, 0)), theta, panel: 0 }];
        yield {
          grids: [I, view(S, h, w, method, k)], src: 0, dst: 1, read: win, write: [[y, x]], line: method === "Shi-Tomasi" ? 5 : 4, shapes,
          vars: {
            "p = (x, y)": `(${x}, ${y})`,
            M: `[${e(T.a[k])} ${e(T.b[k])} ; ${e(T.b[k])} ${e(T.c[k])}]`,
            "λ₁, λ₂": `${e(l1)}, ${e(Math.max(l2, 0))}`,
            ...(method === "Harris" ? { "det − k·trace²": e(S[k]) } : { "min(λ₁, λ₂)": e(S[k]) }),
            looks: kind,
          },
        };
      }
    const corners = detect(S, h, w), dots = (panel: number): Shape[] => corners.map(([y, x]) => ({ kind: "point", x, y, panel }));
    yield {
      grids: [I, view(S, h, w, method)], src: 1, dst: 1, read: [], write: [], line: 6, shapes: [...dots(0), ...dots(1)],
      vars: { threshold: `${THRESHOLD} · max = ${e(THRESHOLD * smax)}`, corners: corners.length, at: corners.map(([y, x]) => `(${x},${y})`).join(" ") },
    };
  },
};
