// Two-pass chamfer distance transform (book §7.3) with the §7.1 metrics as weight choices.
// Every foreground pixel gets its distance to the nearest background pixel (cv2.distanceTransform's
// convention). Raw distances stay internal; panels show them as gray levels with contour bands.
import { type Algorithm, type Cell, type Grid, type Step, grid } from "./types";

type Metric = "city-block" | "chessboard" | "chamfer 3-4";
/** Axis step a, diagonal step b (∞ = diagonals not allowed), and the divisor applied at the end. */
const WEIGHTS: Record<Metric, { a: number; b: number; div: number }> = {
  "city-block": { a: 1, b: Infinity, div: 1 },
  chessboard: { a: 1, b: 1, div: 1 },
  "chamfer 3-4": { a: 3, b: 4, div: 3 },
};
// Forward mask (already visited in pass 1) and backward mask (pass 2), as [dy, dx, arrow].
const FWD: [number, number, string][] = [[0, -1, "←"], [-1, -1, "↖"], [-1, 0, "↑"], [-1, 1, "↗"]];
const BWD: [number, number, string][] = [[0, 1, "→"], [1, 1, "↘"], [1, 0, "↓"], [1, -1, "↙"]];

const fmt = (v: number) => (Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : "∞");

/** One chamfer update of pixel k from neighbour (dy, dx). Returns the candidate (∞ if off the image). */
function relax(A: Grid, D: Float64Array, k: number, dy: number, dx: number, a: number, b: number) {
  const y = Math.floor(k / A.w) + dy, x = (k % A.w) + dx;
  if (y < 0 || y >= A.h || x < 0 || x >= A.w) return Infinity;
  const cand = D[y * A.w + x] + (dy && dx ? b : a);
  if (cand < D[k]) D[k] = cand;
  return cand;
}

const foreground = (A: Grid) => [...A.data.keys()].filter(k => A.data[k]);

/** Two-pass chamfer distances in pixel units (3-4 chamfer already divided by 3). Background = 0. */
export function chamfer(A: Grid, metric: Metric): Float64Array {
  const { a, b, div } = WEIGHTS[metric];
  const D = Float64Array.from(A.data, v => (v ? Infinity : 0)), fg = foreground(A);
  for (const k of fg) for (const [dy, dx] of FWD) relax(A, D, k, dy, dx, a, b);
  for (const k of [...fg].reverse()) for (const [dy, dx] of BWD) relax(A, D, k, dy, dx, a, b);
  return D.map(d => d / div);
}

/** Exact Euclidean distance to the nearest background pixel, by brute force (for comparison). */
export function exactEuclidean(A: Grid): Float64Array {
  const bg: Cell[] = [];
  A.data.forEach((v, k) => { if (!v) bg.push([Math.floor(k / A.w), k % A.w]); });
  return Float64Array.from(A.data, (v, k) => {
    if (!v) return 0;
    const y = Math.floor(k / A.w), x = k % A.w;
    return bg.reduce((m, [by, bx]) => Math.min(m, Math.hypot(y - by, x - bx)), Infinity);
  });
}

/** Panel image from pixel-unit distances: gray ∝ distance, alternate 2-unit bands lifted so contours
 *  show (1-unit bands turn city-block diamonds into a checkerboard). Pixels not done yet, or still ∞, are NaN ("not computed yet"). */
export function show(D: Float64Array, A: Grid, max: number, bands: boolean, done: (k: number) => boolean = () => true): Grid {
  const g = grid(A.h, A.w);
  for (let k = 0; k < D.length; k++) {
    const d = D[k];
    g.data[k] = !A.data[k] ? 0
      : !done(k) || !Number.isFinite(d) ? NaN
      : bands ? 0.15 + 0.65 * (d / max) + (Math.floor(d / 2) % 2 ? 0.2 : 0) : 0.15 + 0.85 * (d / max);
  }
  return g;
}

/** The gray scale's top: the largest finite final distance. */
export const scaleMax = (D: Float64Array) => Math.max(1e-9, ...[...D].filter(Number.isFinite));

export const distance: Algorithm = {
  meta: {
    id: "distance",
    title: "Distance Transforms",
    topic: "Shape",
    ref: "Birchfield, Ch. 7 — Distance Measures",
    lead: "Give every foreground pixel its distance to the nearest background pixel, using just two sweeps over the image.",
    hook: "How far is every pixel from the shape?",
  },
  explain: {
    ideas: [
      { term: "Three metrics", text: "City-block counts axis steps, chessboard counts king moves, Euclidean is the straight line." },
      { term: "Two passes", text: "Distances flow down and right in pass 1, up and left in pass 2; together they reach everywhere." },
      { term: "Chamfer 3-4", text: "Axis step 3, diagonal step 4, divide by 3: a cheap, close stand-in for Euclidean." },
      { term: "Uses", text: "Skeletons, shape matching and path planning all start from a distance map." },
    ],
    formulas: [
      { label: "City-block", tex: String.raw`D_4(p,q)=|d_x|+|d_y|` },
      { label: "Chessboard", tex: String.raw`D_8(p,q)=\max(|d_x|,\,|d_y|)` },
      { label: "Euclidean", tex: String.raw`D_E(p,q)=\sqrt{d_x^2+d_y^2}` },
      {
        label: "Chamfer update", tex: String.raw`D(p)\leftarrow\min_{q\in N(p)}\big(D(q)+w(q)\big)`,
        note: "w = a for axis neighbours, b for diagonal ones; 3-4 chamfer divides by 3 at the end",
      },
    ],
    tryThis: [
      "Pick single seed and switch Metric: diamonds, then squares, then near-circles.",
      "Step through pass 1: distances only flow down and to the right.",
      "Paint a background pixel inside the big square and watch its ridge split.",
    ],
  },
  params: [
    { key: "metric", label: "Metric", options: ["city-block", "chessboard", "chamfer 3-4"], default: "chamfer 3-4" },
    { key: "image", label: "Image", options: ["shapes", "single seed"], default: "shapes", input: true },
    { key: "shading", label: "Shading", options: ["bands", "smooth"], default: "bands" },
  ],
  pseudocode: [
    "def chamfer(A, a, b):     # axis a, diagonal b",
    "    D = where(A == 0, 0, inf)",
    "    for p in raster_order(A):          # pass 1",
    "        D[p] = min(D[p], D[q] + w)  # q in ← ↖ ↑ ↗",
    "    for p in reversed(raster_order(A)):  # pass 2",
    "        D[p] = min(D[p], D[q] + w)  # q in → ↘ ↓ ↙",
    "    return D / a",
  ],
  paintable: true,

  panelTitles: () => ["A", "after pass 1", "after pass 2 = D"],

  sampleInput({ image }) {
    const h = 20, w = 24, A = grid(h, w);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        A.data[y * w + x] = image === "single seed"
          ? (y === 10 && x === 12 ? 0 : 1)
          : (y >= 2 && y <= 12 && x >= 2 && x <= 12) || (y - 7) ** 2 + (x - 18) ** 2 <= 16 || (y >= 15 && y <= 17 && x >= 2 && x <= 21) ? 1 : 0;
    return A;
  },

  run(A, p) {
    let last: Step | undefined;
    for (const s of distance.steps(A, p)) last = s;
    return last!.grids[2];
  },

  *steps(A, { metric, shading }): Generator<Step, void> {
    const { a, b, div } = WEIGHTS[metric as Metric];
    const bands = shading === "bands", fg = foreground(A);
    const final = chamfer(A, metric as Metric), max = scaleMax(final); // fixed gray scale for every step
    const D = Float64Array.from(A.data, v => (v ? Infinity : 0));
    let D1: Float64Array | null = null; // pass-1 result, frozen once pass 2 starts
    const seen = new Set<number>();
    const px = (F: Float64Array) => F.map(d => d / div);
    const panels = (): Grid[] => [
      A,
      D1 ? show(px(D1), A, max, bands) : show(px(D), A, max, bands, k => seen.has(k)),
      D1 ? show(px(D), A, max, bands, k => seen.has(k)) : show(px(D), A, max, bands, () => false),
    ];
    const at = (k: number) => `(${Math.floor(k / A.w)}, ${k % A.w})`;

    yield { grids: panels(), src: 1, dst: 1, read: [], write: [], line: 1,
            vars: { "a, b": `${a}, ${fmt(b)}`, "foreground pixels": fg.length, "background pixels": A.data.length - fg.length } };

    for (const [pass, order, mask, line] of [[1, fg, FWD, 3], [2, [...fg].reverse(), BWD, 5]] as const) {
      if (pass === 2) { D1 = D.slice(); seen.clear(); }
      for (const k of order) {
        const before = D[k];
        const cands = mask.map(([dy, dx, arrow]) => `${arrow} ${fmt(relax(A, D, k, dy, dx, a, b))}`);
        seen.add(k);
        const y = Math.floor(k / A.w), x = k % A.w;
        yield {
          grids: panels(), src: pass, dst: pass, line,
          read: mask.map(([dy, dx]) => [y + dy, x + dx] as Cell), write: [[y, x]],
          vars: { p: at(k), "candidates D[q] + w": cands.join("   "), "D[p]": `${fmt(before)} → ${fmt(D[k])}` },
        };
      }
    }

    const exact = exactEuclidean(A);
    const err = fg.reduce((m, k) => Math.max(m, Math.abs(D[k] / div - exact[k])), 0);
    yield {
      grids: panels(), src: 2, dst: 2, read: [], write: [], line: 6,
      vars: fg.length === A.data.length
        ? { why: "no background pixel: every distance stays ∞" }
        : { "largest distance": max.toFixed(2), "max error vs exact Euclidean": `${err.toFixed(2)} px` },
    };
  },
};
