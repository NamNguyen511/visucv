// Nonlinear filters (book Ch. 14): median (§14.1), min/max = grayscale erosion/dilation (§14.2),
// and the bilateral filter (§14.3, eq. 14.1). Borders repeat the edge pixel, as cv2.medianBlur does.
// A Gaussian blur is shown alongside as the linear filter each one is compared against.
import { sample } from "./convolution";
import { gaussian } from "./gaussian";
import { type Algorithm, type Cell, type Grid, type Params, type Step, grid } from "./types";

export const FILTERS = ["median", "min (erosion)", "max (dilation)", "bilateral"];

const radius = (p: Params) => (p.window === "5×5" ? 2 : 1);
/** σ of the comparison Gaussian, and the bilateral filter's spatial σ_s. */
const sigmaS = (p: Params) => (radius(p) === 2 ? 1.5 : 1);
/** σ_r is given in gray levels (0–255); "∞" turns the range weight off (book exercise 2). */
const sigmaR = (p: Params) => (p.sigmaR === "∞" ? Infinity : +p.sigmaR / 255);

/** Window of (2r+1)² values around (y, x), row by row, with their offsets. */
function windowAt(I: Grid, y: number, x: number, r: number) {
  const vals: number[] = [], cells: Cell[] = [], off: [number, number][] = [];
  for (let i = -r; i <= r; i++)
    for (let j = -r; j <= r; j++) { vals.push(sample(I, y + i, x + j, "replicate")); cells.push([y + i, x + j]); off.push([i, j]); }
  return { vals, cells, off };
}

/** Bilateral weights (eq. 14.1, before normalising): G_s(‖p − q‖) · G_r(|I(p) − I(q)|). */
export function bilateralWeights(vals: number[], off: [number, number][], center: number, ss: number, sr: number) {
  return vals.map((v, k) => {
    const [i, j] = off[k];
    return Math.exp(-(i * i + j * j) / (2 * ss * ss)) * (sr === Infinity ? 1 : Math.exp(-((v - center) ** 2) / (2 * sr * sr)));
  });
}

export function filterAt(I: Grid, y: number, x: number, p: Params): number {
  const { vals, off } = windowAt(I, y, x, radius(p));
  if (p.filter === "median") return [...vals].sort((a, b) => a - b)[(vals.length - 1) / 2];
  if (p.filter === "min (erosion)") return Math.min(...vals);
  if (p.filter === "max (dilation)") return Math.max(...vals);
  const w = bilateralWeights(vals, off, I.data[y * I.w + x], sigmaS(p), sigmaR(p));
  return w.reduce((s, wk, k) => s + wk * vals[k], 0) / w.reduce((a, b) => a + b, 0);
}

export function nonlinearFilter(I: Grid, p: Params): Grid {
  const O = grid(I.h, I.w);
  for (let y = 0; y < I.h; y++) for (let x = 0; x < I.w; x++) O.data[y * I.w + x] = filterAt(I, y, x, p);
  return O;
}

/** Mean absolute difference in gray levels. */
export const mae = (a: Grid, b: Grid) => (a.data.reduce((s, v, k) => s + Math.abs(v - b.data[k]), 0) / a.data.length) * 255;

const N = 24;
/** The noise-free image the noisy sample was made from. */
export function cleanImage(image: string): Grid {
  const I = grid(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      I.data[y * N + x] = image === "noisy step edge"
        ? (x >= 12 ? 0.75 : 0.25)
        : (y >= 4 && y <= 11 && x >= 3 && x <= 11) ? 0.8 : (y - 15) ** 2 + (x - 15) ** 2 <= 25 ? 0.55 : 0.2;
  return I;
}

const lvl = (v: number) => String(Math.round(v * 255));
const rows = (v: string[], n: number) => Array.from({ length: n }, (_, i) => v.slice(i * n, (i + 1) * n).join(" ")).join(" / ");

export const nonlinear: Algorithm = {
  meta: {
    id: "nonlinear",
    title: "Median, Min/Max & Bilateral Filters",
    topic: "Filtering",
    ref: "Birchfield, Ch. 14 — Nonlinear Filters",
    lead: "Filters that aren't weighted sums: the median ignores outliers, min/max erode and dilate, and the bilateral filter smooths without crossing edges.",
    hook: "Filters that ignore outliers and keep edges.",
  },
  explain: {
    ideas: [
      { term: "Median", text: "Sort the window and take the middle value. One wild pixel barely moves it, so salt-and-pepper noise vanishes." },
      { term: "Min and max", text: "Grayscale erosion and dilation: the darkest or brightest value in the window. Edges shift instead of blurring." },
      { term: "Bilateral", text: "A Gaussian blur that also down-weights neighbors whose intensity differs from the center, so edges survive." },
      { term: "Not linear", text: "None of these is a convolution: the weights depend on the pixel values themselves." },
    ],
    formulas: [
      { label: "Median (§14.1)", tex: String.raw`I'(p)=\operatorname{median}\{\,I(q) : q\in N(p)\,\}` },
      { label: "Min / max (§14.2)", tex: String.raw`\begin{gathered}(I\ominus B)(p)=\min_{q\in N(p)} I(q)\\ (I\oplus B)(p)=\max_{q\in N(p)} I(q)\end{gathered}` },
      { label: "Bilateral (book eq. 14.1)", tex: String.raw`\begin{gathered}I'(p)=\frac{1}{W_p}\sum_{q\in N(p)} G_{\sigma_s}(\lVert p-q\rVert)\\ \cdot\,G_{\sigma_r}(\lvert I(p)-I(q)\rvert)\,I(q)\end{gathered}`, note: "W_p is the sum of the weights, so they add up to 1" },
    ],
    tryThis: [
      "On salt & pepper, compare the median with the Gaussian panel, then read the error summary on the last step.",
      "Pick bilateral on the noisy step edge, then set σ_r to ∞ (book exercise 2): it turns into a plain Gaussian blur.",
      "Switch between min and max with a 5×5 window: bright regions shrink or grow.",
    ],
  },
  params: [
    { key: "filter", label: "Filter", options: FILTERS, default: "median" },
    { key: "image", label: "Image", options: ["salt & pepper", "noisy step edge"], default: "salt & pepper", input: true },
    { key: "window", label: "Window", options: ["3×3", "5×5"], default: "3×3" },
    { key: "sigmaR", label: "σ_r (bilateral)", options: [25, 50, 100, "∞"], default: 50 },
  ],
  pseudocode: [
    "def nonlinear_filter(I, r):",
    "    for p in pixels(I):",
    "        N = window(I, p, r)      # (2r+1)² values",
    "        out[p] = median(N)",
    "        out[p] = min(N)          # or max(N)",
    "        w = Gs(dist(p, q)) * Gr(abs(I[p] - N))",
    "        out[p] = (w * N).sum() / w.sum()",
  ],

  panelTitles: p => ["I", `${String(p.filter).split(" ")[0]} ${p.window}`, `Gaussian σ = ${sigmaS(p)} (linear)`],

  sampleInput({ image }) {
    const I = cleanImage(String(image));
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    I.data.forEach((v, k) => {
      if (image === "noisy step edge") I.data[k] = Math.min(1, Math.max(0, v + 0.06 * gauss()));
      else { const u = rand(); if (u < 0.06) I.data[k] = 0; else if (u < 0.12) I.data[k] = 1; }
    });
    return I;
  },

  run: nonlinearFilter,

  *steps(I, p): Generator<Step, void> {
    const r = radius(p), n = 2 * r + 1, G = gaussian.run(I, { sigma: sigmaS(p) }), O = grid(I.h, I.w, NaN);
    const snap = () => ({ ...O, data: O.data.slice() });
    yield {
      grids: [I, snap(), G], src: 0, dst: 1, read: [], write: [], line: 0,
      vars: { filter: String(p.filter), window: `${n}×${n}  (r = ${r})`, ...(p.filter === "bilateral" && { "σ_s / σ_r": `${sigmaS(p)} px / ${p.sigmaR} levels` }) },
    };
    for (let y = 0; y < I.h; y++)
      for (let x = 0; x < I.w; x++) {
        const { vals, cells, off } = windowAt(I, y, x, r), c = I.data[y * I.w + x], v = filterAt(I, y, x, p);
        O.data[y * I.w + x] = v;
        const vars: Record<string, string> = { "p = (x, y)": `(${x}, ${y})` };
        let line = 4;
        if (p.filter === "median") {
          const s = [...vals].sort((a, b) => a - b).map(lvl), m = (s.length - 1) / 2;
          s[m] = `[${s[m]}]`;
          vars["sorted N(p)"] = s.join(" ");
          line = 3;
        } else if (p.filter === "bilateral") {
          const w = bilateralWeights(vals, off, c, sigmaS(p), sigmaR(p)), sum = w.reduce((a, b) => a + b, 0);
          vars["N(p)"] = rows(vals.map(lvl), n);
          vars["w(q) / W_p"] = rows(w.map(wk => (wk / sum).toFixed(2)), n);
          line = 6;
        } else vars["N(p)"] = rows(vals.map(lvl), n);
        vars["I(p) → I′(p)"] = `${lvl(c)} → ${lvl(v)}`;
        const note = p.filter === "median" ? `median of ${vals.length} = ${lvl(v)}` : p.filter === "bilateral" ? `weighted mean = ${lvl(v)}` : `${String(p.filter).split(" ")[0]} = ${lvl(v)}`;
        yield { grids: [I, snap(), G], src: 0, dst: 1, read: cells, write: [[y, x]], line, vars,
                window: { cells: Array.from({ length: n }, (_, i) => vals.slice(i * n, (i + 1) * n).map(lvl)), note: `${note}  (gray levels)` } };
      }
    const C = cleanImage(String(p.image));
    yield {
      grids: [I, O, G], src: 0, dst: 1, read: [], write: [], line: 1,
      vars: {
        "mean error vs clean, noisy input": `${mae(I, C).toFixed(2)} levels`,
        [`… after ${p.filter}`]: `${mae(O, C).toFixed(2)} levels`,
        [`… after Gaussian σ = ${sigmaS(p)}`]: `${mae(G, C).toFixed(2)} levels`,
      },
    };
  },
};
