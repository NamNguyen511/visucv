// RANSAC line fitting (book Ch. 23): hypothesize a line from a random minimal sample (2 points),
// verify by counting points within t of it, keep the line with the most inliers, then refit those
// inliers with the Ch. 6 principal axis (total least squares). White input pixels are the points.
import { moments } from "./moments";
import { type Algorithm, type Cell, type Grid, type Params, type Shape, type Step, grid } from "./types";

export type Line = { x: number; y: number; dx: number; dy: number }; // through (x, y), unit direction

export const lineThrough = ([ay, ax]: Cell, [by, bx]: Cell): Line => {
  const n = Math.hypot(bx - ax, by - ay);
  return { x: ax, y: ay, dx: (bx - ax) / n, dy: (by - ay) / n };
};
export const dist = (L: Line, [y, x]: Cell) => Math.abs((x - L.x) * L.dy - (y - L.y) * L.dx);

export const points = (I: Grid): Cell[] => {
  const P: Cell[] = [];
  for (let y = 0; y < I.h; y++) for (let x = 0; x < I.w; x++) if (I.data[y * I.w + x]) P.push([y, x]);
  return P;
};

/** Total least squares: the line through the centroid along the principal axis (book Ch. 6). */
export function fitLine(P: Cell[], h: number, w: number): Line | null {
  if (P.length < 2) return null;
  const g = grid(h, w);
  for (const [y, x] of P) g.data[y * w + x] = 1;
  const m = moments(g);
  return { x: m.xbar, y: m.ybar, dx: m.vmax[0], dy: m.vmax[1] };
}

// Same tiny LCG as Otsu's noise: the same seed gives the same draws on every visit.
function rng(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

/** Two distinct indices into P. */
function sample2(n: number, rand: () => number): [number, number] {
  const i = Math.floor(rand() * n), j = (i + 1 + Math.floor(rand() * (n - 1))) % n;
  return [i, j];
}

export type Iter = { pair: [Cell, Cell]; line: Line; inliers: Cell[]; better: boolean };

export function ransac(P: Cell[], t: number, iters: number, seed: number) {
  const rand = rng(seed * 7919), log: Iter[] = [];
  let best: Iter | null = null;
  for (let i = 0; i < iters && P.length >= 2; i++) {
    const [a, b] = sample2(P.length, rand), line = lineThrough(P[a], P[b]);
    const it: Iter = { pair: [P[a], P[b]], line, inliers: P.filter(p => dist(line, p) <= t), better: false };
    if (!best || it.inliers.length > best.inliers.length) { it.better = true; best = it; }
    log.push(it);
  }
  return { log, best };
}

const N = 28;
export function sampleImage(image: string): Grid {
  const I = grid(N, N), rand = rng(image === "many outliers" ? 11 : image === "two lines" ? 23 : 5);
  const put = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < N && y < N) I.data[Math.round(y) * N + Math.round(x)] = 1; };
  for (let x = 2; x < 26; x += 1.2) put(x, 0.45 * x + 5);
  if (image === "two lines") for (let y = 3; y < 18; y += 1.5) put(22 - 0.6 * y, y);
  const outliers = image === "many outliers" ? 45 : image === "two lines" ? 6 : 12;
  for (let k = 0; k < outliers; k++) put(rand() * (N - 1), rand() * (N - 1));
  return I;
}

/** The line clipped to the image box, as a drawable segment. */
function segment(L: Line, h: number, w: number, offset = 0, thick = false, panel?: number): Shape[] {
  const x = L.x - offset * L.dy, y = L.y + offset * L.dx;
  let lo = -Infinity, hi = Infinity;
  for (const [p, d, max] of [[x, L.dx, w - 0.5], [y, L.dy, h - 0.5]]) {
    if (Math.abs(d) < 1e-12) { if (p < -0.5 || p > max) return []; continue; }
    const t1 = (-0.5 - p) / d, t2 = (max - p) / d;
    lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
  }
  return lo < hi ? [{ kind: "line", x1: x + lo * L.dx, y1: y + lo * L.dy, x2: x + hi * L.dx, y2: y + hi * L.dy, thick, panel }] : [];
}

/** Label image: inliers = colour 1, other points = white, background = 0. */
function labels(I: Grid, inliers: Cell[]): Grid {
  const g: Grid = { ...grid(I.h, I.w), labels: true };
  I.data.forEach((v, k) => { if (v) g.data[k] = -1; });
  for (const [y, x] of inliers) g.data[y * I.w + x] = 1;
  return g;
}
const pending = (h: number, w: number): Grid => ({ ...grid(h, w, NaN), labels: true });

const opts = (p: Params) => ({ t: Number(p.t), iters: Number(p.iters), seed: Number(p.seed) });

function finish(I: Grid, p: Params) {
  const { t, iters, seed } = opts(p), P = points(I), { log, best } = ransac(P, t, iters, seed);
  const fit = best ? fitLine(best.inliers, I.h, I.w) : null;
  return { P, log, best, fit, inliers: fit ? P.filter(q => dist(fit, q) <= t) : [] };
}

const f = (v: number) => v.toFixed(2);
const at = ([y, x]: Cell) => `(${x}, ${y})`;

export const ransacAlgo: Algorithm = {
  meta: {
    id: "ransac",
    title: "RANSAC Line Fitting",
    topic: "Features & motion",
    ref: "Birchfield, Ch. 23 — Model Fitting",
    lead: "Guess a line from two random points, count who agrees, repeat, and keep the guess with the most support.",
    hook: "Fit a model when most data lies.",
  },
  explain: {
    ideas: [
      { term: "Least squares breaks", text: "Every point pulls on a least-squares fit, so a few far outliers drag the whole line away." },
      { term: "Hypothesize and verify", text: "Two points fix a line; the points within t of it are its inliers, the others are ignored." },
      { term: "Keep the best, then refit", text: "The guess with the most inliers wins; a least-squares fit on just those inliers polishes it." },
      { term: "How many tries", text: "Each guess succeeds only if both points are inliers, chance w²; repeat until a miss every time is unlikely." },
    ],
    formulas: [
      { label: "Distance to the line through a, b", tex: String.raw`d(p)=\frac{\lvert (p-a)\times(b-a)\rvert}{\lVert b-a\rVert}\le t` },
      { label: "Iterations for success probability P", tex: String.raw`\begin{gathered}N=\frac{\log(1-P)}{\log(1-w^{s})}\\ w=\text{inlier ratio},\ s=2\text{ for a line}\end{gathered}` },
    ],
    tryThis: [
      "Pick Image many outliers and set Iterations to 5, then change Seed: some seeds miss the line entirely.",
      "Step to the end: the thin all-points fit on P tilts away from the thick RANSAC line on best so far / refit.",
      "Pick Image two lines: RANSAC keeps the longer line, and the shorter one's points stay white.",
    ],
  },
  params: [
    { key: "image", label: "Image", options: ["line + outliers", "many outliers", "two lines"], default: "line + outliers", input: true },
    { key: "iters", label: "Iterations", options: [5, 20, 50], default: 20 },
    { key: "t", label: "Threshold t", options: [0.5, 1, 1.5], default: 1 },
    { key: "seed", label: "Seed", options: [1, 2, 3], default: 1 },
  ],
  pseudocode: [
    "def ransac(P, t, iters):",
    "    best = []",
    "    for i in range(iters):",
    "        a, b = random.sample(P, 2)",
    "        inl = [p for p in P if d(p) <= t]",
    "        if len(inl) > len(best): best = inl",
    "    return fit_line(best)   # least squares",
  ],
  paintable: true,

  panelTitles: () => ["P  (white = points)", "guess: inliers", "best so far / refit"],

  sampleInput: ({ image }) => sampleImage(String(image)),

  run(I, p) {
    return labels(I, finish(I, p).inliers);
  },

  *steps(I, p): Generator<Step, void> {
    const { t } = opts(p), { h, w } = I, { P, log, best, fit, inliers } = finish(I, p);
    yield {
      grids: [I, pending(h, w), pending(h, w)], src: 0, dst: 2, read: [], write: [], line: 1,
      vars: { points: P.length, t, iterations: log.length },
    };
    let top: Iter | null = null;
    for (const [i, it] of log.entries()) {
      const guess = segment(it.line, h, w, 0, true, 0), band = [...segment(it.line, h, w, -t, false, 1), ...segment(it.line, h, w, t, false, 1)];
      const kept = top ? [...segment(top.line, h, w, 0, true, 2)] : [];
      const best0 = top ? labels(I, top.inliers) : pending(h, w);
      yield {
        grids: [I, pending(h, w), best0], src: 0, dst: 1, read: it.pair, write: [], line: 3, shapes: [...guess, ...kept],
        vars: { i: i + 1, "a, b": `${at(it.pair[0])}, ${at(it.pair[1])}`, "best so far": top ? top.inliers.length : 0 },
      };
      if (it.better) top = it;
      yield {
        grids: [I, labels(I, it.inliers), labels(I, top!.inliers)], src: 0, dst: 1, read: it.inliers, write: [], line: it.better ? 5 : 4,
        shapes: [...guess, ...segment(it.line, h, w, 0, true, 1), ...band, ...segment(top!.line, h, w, 0, true, 2)],
        vars: { i: i + 1, inliers: it.inliers.length, "best so far": top!.inliers.length, better: it.better ? "yes: keep it" : "no" },
      };
    }
    const all = fitLine(P, h, w), wr = P.length ? inliers.length / P.length : 0;
    const need = wr === 0 ? "—" : wr < 1 ? Math.ceil(Math.log(0.01) / Math.log(1 - wr * wr)) : 1;
    yield {
      grids: [I, best ? labels(I, best.inliers) : pending(h, w), labels(I, inliers)], src: 1, dst: 2, read: [], write: [], line: 6,
      shapes: [...(all ? segment(all, h, w, 0, false, 0) : []), ...(fit ? segment(fit, h, w, 0, true, 2) : [])],
      vars: {
        inliers: `${inliers.length} of ${P.length}`,
        "w (inlier ratio)": f(wr),
        "N for 99%": need,
        line: fit ? `through (${f(fit.x)}, ${f(fit.y)}), dir (${f(fit.dx)}, ${f(fit.dy)})` : "—",
      },
    };
  },
};
