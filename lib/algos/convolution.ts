// 2-D convolution vs correlation (book Ch. 10, eqs. 10.2–10.3) with the §10.3 border rules.
// K is indexed K[i][j] for row offset i and column offset j in −r..r. Correlation slides K as is;
// convolution slides K rotated 180°.
import { transforms } from "./transforms";
import { type Algorithm, type Cell, type Grid, type Step, grid } from "./types";

export type Kernel = number[][];
export const KERNELS: Record<string, Kernel> = {
  "box 3×3": [[1 / 9, 1 / 9, 1 / 9], [1 / 9, 1 / 9, 1 / 9], [1 / 9, 1 / 9, 1 / 9]],
  sharpen: [[0, -1, 0], [-1, 5, -1], [0, -1, 0]],
  "Sobel x": [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]],
  "one-hot (asymmetric)": [[0, 0, 0], [0, 0, 1], [0, 0, 0]],
};
export type Border = "zero" | "replicate" | "reflect 101";

export const rotate180 = (K: Kernel): Kernel => K.map(row => [...row].reverse()).reverse();

/** Pixel (y, x), with off-image positions filled by the border rule. */
export function sample(I: Grid, y: number, x: number, border: Border): number {
  const fix = (v: number, n: number) => {
    if (v >= 0 && v < n) return v;
    if (border === "replicate") return v < 0 ? 0 : n - 1;
    return v < 0 ? -v : 2 * (n - 1) - v; // reflect 101: mirror without repeating the edge pixel
  };
  if (border === "zero" && (y < 0 || y >= I.h || x < 0 || x >= I.w)) return 0;
  return I.data[fix(y, I.h) * I.w + fix(x, I.w)];
}

/** Correlation with K′ at one pixel: Σ K′(i,j)·I(y+i, x+j). Convolution passes K′ = rotate180(K). */
export function correlateAt(I: Grid, Kp: Kernel, y: number, x: number, border: Border) {
  const r = (Kp.length - 1) / 2;
  let s = 0;
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) s += Kp[i + r][j + r] * sample(I, y + i, x + j, border);
  return s;
}

export function filter2d(I: Grid, K: Kernel, mode: "convolution" | "correlation", border: Border): Float64Array {
  const Kp = mode === "convolution" ? rotate180(K) : K, O = new Float64Array(I.h * I.w);
  for (let y = 0; y < I.h; y++) for (let x = 0; x < I.w; x++) O[y * I.w + x] = correlateAt(I, Kp, y, x, border);
  return O;
}

/** Derivative kernels (sum 0, with negative weights) give signed output: shown with mid-gray = 0. */
const signed = (K: Kernel) => Math.abs(K.flat().reduce((a, b) => a + b, 0)) < 1e-9;

const lvl = (v: number) => String(Math.round(v * 255));
const num = (v: number) => (Number.isInteger(v) ? String(v) : Math.abs(v - 1 / 9) < 1e-9 ? "1/9" : v.toFixed(2));
const rows = (K: Kernel) => K.map(r => r.map(num).join(" ")).join(" / ");

export const convolution: Algorithm = {
  meta: {
    id: "convolution",
    title: "Convolution vs Correlation",
    topic: "Filtering",
    ref: "Birchfield, Ch. 10 — Convolution",
    lead: "Slide a small grid of weights over the image and sum the products; convolution flips the grid first, correlation doesn't.",
    hook: "Slide a kernel. Flip it, or don't.",
  },
  explain: {
    ideas: [
      { term: "Flip and slide", text: "Convolution rotates the kernel 180°, slides it over the image, and sums the products." },
      { term: "Correlation", text: "The same without the flip. OpenCV's filter2D actually computes correlation." },
      { term: "When it matters", text: "Box and Gaussian kernels are symmetric, so nothing changes; Sobel's output flips sign." },
      { term: "Borders", text: "Near the edge the kernel hangs off the image; zero, replicate or reflect padding fills it." },
    ],
    formulas: [
      { label: "Convolution (book eq. 10.2)", tex: String.raw`(I*K)(x,y)=\sum_i\sum_j K(i,j)\,I(x-i,\,y-j)` },
      { label: "Correlation (book eq. 10.3)", tex: String.raw`(I\star K)(x,y)=\sum_i\sum_j K(i,j)\,I(x+i,\,y+j)` },
      { label: "The flip", tex: String.raw`\begin{gathered}I*K=I\star K'\\ K'(i,j)=K(-i,-j)\end{gathered}`, note: "K′ is K rotated 180°" },
      { label: "Separable kernels", tex: String.raw`\begin{gathered}K=\mathbf{k}_x\,\mathbf{k}_y^{\top}\\ \Rightarrow\ O(n^2)\to O(2n)\ \text{per pixel}\end{gathered}` },
    ],
    tryThis: [
      "Pick the one-hot kernel, then switch Mode: the F moves one pixel left or right.",
      "Pick Sobel x and compare modes (book exercise 2): bright and dark edges swap.",
      "With box 3×3, set Border to zero and watch the image's edge pixels darken.",
    ],
  },
  params: [
    { key: "kernel", label: "Kernel", options: Object.keys(KERNELS), default: "Sobel x" },
    { key: "mode", label: "Mode", options: ["convolution", "correlation"], default: "convolution" },
    { key: "border", label: "Border", options: ["reflect 101", "replicate", "zero"], default: "reflect 101" },
  ],
  pseudocode: [
    "CONVOLVE(I, K):",
    "  K′ ← K rotated 180°     ▸ correlation: K′ ← K",
    "  pad I by r with the border rule",
    "  for each pixel (x, y):",
    "    O(x, y) ← Σᵢ Σⱼ K′(i, j) · I(x+i, y+j)",
  ],

  panelTitles: ({ kernel }) => ["I", signed(KERNELS[kernel as string]) ? "O  (mid-gray = 0)" : "O"],

  // The book's asymmetric test idea: a letter F (reused from Ch. 8), in gray.
  sampleInput() {
    const F = transforms.sampleInput({});
    return { ...F, data: F.data.map(v => (v ? 0.85 : 0.15)) };
  },

  run(I, p) {
    let last: Step | undefined;
    for (const s of convolution.steps(I, p)) last = s;
    return last!.grids[1];
  },

  *steps(I, { kernel, mode, border }): Generator<Step, void> {
    const K = KERNELS[kernel as string], conv = mode === "convolution", Kp = conv ? rotate180(K) : K;
    const b = border as Border, sgn = signed(K);
    const raw = filter2d(I, K, mode as "convolution" | "correlation", b);
    const m = Math.max(1e-9, ...raw.map(Math.abs)); // fixed scale for signed output
    const show = (v: number) => (sgn ? 0.5 + v / (2 * m) : Math.min(1, Math.max(0, v)));
    const O = grid(I.h, I.w, NaN), r = (K.length - 1) / 2;
    yield { grids: [I, { ...O, data: O.data.slice() }], src: 0, dst: 1, read: [], write: [], line: 1,
            vars: { K: rows(K), "K′ (as applied)": rows(Kp), why: conv ? "rotated 180° for convolution" : "used as is for correlation" } };
    for (let y = 0; y < I.h; y++)
      for (let x = 0; x < I.w; x++) {
        const v = correlateAt(I, Kp, y, x, b);
        O.data[y * I.w + x] = show(v);
        const win: Cell[] = [], vals: string[] = [];
        for (let i = -r; i <= r; i++) {
          const row: string[] = [];
          for (let j = -r; j <= r; j++) { win.push([y + i, x + j]); row.push(lvl(sample(I, y + i, x + j, b))); }
          vals.push(row.join(" "));
        }
        const edge = y < r || x < r || y >= I.h - r || x >= I.w - r;
        yield {
          grids: [I, { ...O, data: O.data.slice() }], src: 0, dst: 1, line: 4, read: win, write: [[y, x]],
          vars: { "(x, y)": `(${x}, ${y})`, "window I": vals.join(" / ") + (edge ? `   (${b} padding)` : ""),
                  "K′": rows(Kp), "Σ K′·I": lvl(v) + (sgn ? (v > 0 ? "  (positive)" : v < 0 ? "  (negative)" : "") : v > 1 || v < 0 ? "  (clipped for display)" : "") },
        };
      }
    yield { grids: [I, O], src: 0, dst: 1, read: [], write: [], line: 3,
            vars: { mode: String(mode), symmetric: JSON.stringify(K) === JSON.stringify(rotate180(K)) ? "yes: convolution = correlation" : "no: the flip changes the result" } };
  },
};
