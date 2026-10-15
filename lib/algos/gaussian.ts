// Separable Gaussian smoothing, viewed as a height map (intensity = height).
// Borders repeat the edge pixel.
import { type Algorithm, type Cell, type Grid, type Step, clone, grid } from "./types";

/** 1-D Gaussian with radius ⌈3σ⌉, normalised to sum 1. */
export function gaussianKernel(sigma: number): number[] {
  const r = Math.ceil(3 * sigma);
  const g = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const s = g.reduce((a, b) => a + b, 0);
  return g.map(v => v / s);
}

const clamp = (v: number, n: number) => (v < 0 ? 0 : v >= n ? n - 1 : v);

/** Convolve one row (axis "x") or one column (axis "y") of `src` into `dst`. */
function blurLine(src: Grid, dst: Grid, g: number[], axis: "x" | "y", i: number) {
  const r = (g.length - 1) / 2, { h, w } = src;
  const n = axis === "x" ? w : h;
  for (let j = 0; j < n; j++) {
    let s = 0;
    for (let k = -r; k <= r; k++) {
      const jj = clamp(j + k, n);
      s += g[k + r] * (axis === "x" ? src.data[i * w + jj] : src.data[jj * w + i]);
    }
    dst.data[axis === "x" ? i * w + j : j * w + i] = s;
  }
}

const line = (axis: "x" | "y", i: number, n: number): Cell[] =>
  Array.from({ length: n }, (_, j) => (axis === "x" ? [i, j] : [j, i]));

// Height map mixing finished lines of `done` with the rest of `before`, so the 3-D view sweeps.
function partial(before: Grid, done: Grid) {
  const s = clone(before);
  done.data.forEach((v, k) => { if (!Number.isNaN(v)) s.data[k] = v; });
  return s;
}

const fmt = (v: number) => v.toFixed(3);

export const gaussian: Algorithm = {
  meta: {
    id: "gaussian",
    title: "Gaussian Smoothing as a Height Map",
    topic: "Filtering",
    ref: "Birchfield, Ch. 11 — Smoothing and Gaussian Pyramids",
    lead: "Blur an image with a bell-shaped weighted average, shown as a landscape where brightness is height.",
  },
  explain: {
    ideas: [
      { term: "Smoothing", text: "Noise spikes flatten; hills get wider and lower. A larger σ blurs more." },
      { term: "Separable", text: "A 2-D Gaussian blur is a row blur followed by a column blur." },
      { term: "Cheaper", text: "Two 1-D passes cost 2(2r+1) multiplies per pixel instead of (2r+1)²." },
      { term: "Impulse response", text: "Blurring a single bright pixel draws the kernel itself." },
    ],
    formulas: [
      { label: "1-D kernel", tex: String.raw`g(k)=\frac{e^{-k^2/2\sigma^2}}{\sum_j e^{-j^2/2\sigma^2}},\qquad |k|\le r=\lceil 3\sigma\rceil` },
      { label: "Separable", tex: String.raw`G(x,y)=g(x)\,g(y)` },
      { label: "Two passes", tex: String.raw`T=I\ast g_{\text{rows}},\qquad O=T\ast g_{\text{columns}}`, note: "edges repeat the border pixel" },
      { label: "Cost per pixel", tex: String.raw`2(2r+1)\ \ \text{vs.}\ \ (2r+1)^2` },
    ],
    tryThis: [
      "Pick single spike, turn on Fit height, and jump to the last step: that bell is g(x)·g(y).",
      "Set σ to 3: the two hills merge into one.",
      "Drag the 3-D view to look along a row while pass 1 runs.",
    ],
  },
  params: [
    { key: "image", label: "Image", options: ["noisy hills", "single spike", "checkerboard"], default: "noisy hills", input: true },
    { key: "sigma", label: "σ", options: [0.5, 1, 2, 3], default: 1 },
  ],
  pseudocode: [
    "GAUSSIAN_BLUR(I, σ):",
    "  g ← 1‑D Gaussian, r = ⌈3σ⌉, Σg = 1",
    "  for each row y:            ▸ pass 1",
    "    T[y, x] ← Σₖ g[k]·I[y, x+k]",
    "  for each column x:         ▸ pass 2",
    "    O[y, x] ← Σₖ g[k]·T[y+k, x]",
    "  return O",
  ],
  view3d: true,

  panelTitles: () => ["I", "T = rows blurred", "O = rows + columns"],

  sampleInput({ image }) {
    const n = 32, I = grid(n, n);
    let seed = 7; // tiny LCG so the noise is the same on every visit
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const k = y * n + x;
        if (image === "single spike") I.data[k] = y === 16 && x === 16 ? 1 : 0;
        else if (image === "checkerboard") I.data[k] = ((y >> 2) + (x >> 2)) % 2;
        else {
          const hill = (cy: number, cx: number, s: number, a: number) =>
            a * Math.exp(-((y - cy) ** 2 + (x - cx) ** 2) / (2 * s * s));
          I.data[k] = Math.min(1, Math.max(0, hill(11, 10, 5, 0.75) + hill(21, 22, 4, 0.55) + (rand() - 0.5) * 0.35));
        }
      }
    return I;
  },

  run(I, { sigma }) {
    const g = gaussianKernel(+sigma), T = grid(I.h, I.w), O = grid(I.h, I.w);
    for (let y = 0; y < I.h; y++) blurLine(I, T, g, "x", y);
    for (let x = 0; x < I.w; x++) blurLine(T, O, g, "y", x);
    return O;
  },

  *steps(I, { sigma }): Generator<Step, void> {
    const g = gaussianKernel(+sigma), r = (g.length - 1) / 2, d = g.length;
    const T = grid(I.h, I.w, NaN), O = grid(I.h, I.w, NaN);
    yield {
      grids: [I, clone(T), clone(O)], src: 0, dst: 0, read: [], write: [], line: 1, surface: I,
      vars: {
        σ: sigma, r, "g (centre → edge)": g.slice(r, r + 4).map(fmt).join("  ") + (r > 3 ? "  …" : ""),
        "cost per pixel": `2·(2r+1) = ${2 * d}   vs 2-D: (2r+1)² = ${d * d}`,
      },
    };
    for (let y = 0; y < I.h; y++) {
      blurLine(I, T, g, "x", y);
      const row = line("x", y, I.w);
      yield {
        grids: [I, clone(T), clone(O)], src: 0, dst: 1, read: row, write: row, line: 3,
        surface: partial(I, T),
        vars: { y, "row max before": fmt(Math.max(...I.data.subarray(y * I.w, (y + 1) * I.w))),
                "row max after": fmt(Math.max(...T.data.subarray(y * I.w, (y + 1) * I.w))) },
      };
    }
    for (let x = 0; x < I.w; x++) {
      blurLine(T, O, g, "y", x);
      const col = line("y", x, I.h);
      const colOf = (G: typeof T) => col.map(([yy]) => G.data[yy * I.w + x]);
      yield {
        grids: [I, clone(T), clone(O)], src: 1, dst: 2, read: col, write: col, line: 5,
        surface: partial(T, O),
        vars: { x, "column max before": fmt(Math.max(...colOf(T))), "column max after": fmt(Math.max(...colOf(O))) },
      };
    }
    yield {
      grids: [I, clone(T), clone(O)], src: 2, dst: 2, read: [], write: [], line: 6, surface: O,
      vars: { "peak of I": fmt(Math.max(...I.data)), "peak of O": fmt(Math.max(...O.data)) },
    };
  },
};
