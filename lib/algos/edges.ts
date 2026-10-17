// Canny edge detection (book §12.3) with the §12.2 derivative operators.
// Gradients use correlation, so Ix > 0 where brightness rises to the right; y points down.
import { type Kernel, correlateAt } from "./convolution";
import { gaussian } from "./gaussian";
import { type Algorithm, type Cell, type Grid, type Shape, type Step, grid } from "./types";

// x-kernels; each y-kernel is the transpose. Divided by their positive weights (the book's gain
// normalization), so every operator gives the same response to an ideal step edge.
const OPERATORS: Record<string, Kernel> = {
  "central difference": [[0, 0, 0], [-1, 0, 1], [0, 0, 0]],
  Prewitt: [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]],
  Sobel: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]],
  Scharr: [[-3, 0, 3], [-10, 0, 10], [-3, 0, 3]],
};
export const operatorNames = Object.keys(OPERATORS);
const normalized = (K: Kernel) => {
  const gain = K.flat().filter(v => v > 0).reduce((a, b) => a + b, 0);
  return K.map(r => r.map(v => v / gain));
};
const transpose = (K: Kernel) => K[0].map((_, j) => K.map(r => r[j]));

export type Gradient = { ix: Float64Array; iy: Float64Array; mag: Float64Array; theta: Float64Array };

export function gradient(I: Grid, operator: string): Gradient {
  const Kx = normalized(OPERATORS[operator]), Ky = transpose(Kx), n = I.h * I.w;
  const g: Gradient = { ix: new Float64Array(n), iy: new Float64Array(n), mag: new Float64Array(n), theta: new Float64Array(n) };
  for (let y = 0; y < I.h; y++)
    for (let x = 0; x < I.w; x++) {
      const k = y * I.w + x, gx = correlateAt(I, Kx, y, x, "replicate"), gy = correlateAt(I, Ky, y, x, "replicate");
      g.ix[k] = gx; g.iy[k] = gy; g.mag[k] = Math.hypot(gx, gy); g.theta[k] = Math.atan2(gy, gx);
    }
  return g;
}

/** Gradient direction rounded to 0°, 45°, 90° or 135°, as a pixel step along it. */
export function direction(theta: number): [dx: number, dy: number, label: string] {
  const bin = Math.round(((((theta * 180) / Math.PI) % 180) + 180) % 180 / 45) % 4;
  return ([[1, 0, "0°"], [1, 1, "45°"], [0, 1, "90°"], [-1, 1, "135°"]] as const)[bin] as [number, number, string];
}

/** Non-max suppression at pixel k: keep if ≥ the neighbour behind and > the one ahead (breaks ties). */
export function nmsAt(w: number, h: number, mag: Float64Array, theta: number, k: number) {
  const [dx, dy, label] = direction(theta), x = k % w, y = Math.floor(k / w);
  const at = (xx: number, yy: number) => (xx >= 0 && xx < w && yy >= 0 && yy < h ? mag[yy * w + xx] : 0);
  const behind = at(x - dx, y - dy), ahead = at(x + dx, y + dy);
  return { keep: mag[k] >= behind && mag[k] > ahead, behind, ahead, label, cells: [[y - dy, x - dx], [y + dy, x + dx]] as Cell[] };
}

const N8: Cell[] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

/** Label image: 1 = strong, 2 = weak but connected to strong (8-neighbours), 0 = not an edge. */
export function hysteresis(w: number, h: number, thin: Float64Array, low: number, high: number): Float64Array {
  const L = Float64Array.from(thin, m => (m >= high ? 1 : m >= low ? -1 : 0));
  const queue = [...L.keys()].filter(k => L[k] === 1);
  while (queue.length) {
    const k = queue.shift()!, x = k % w, y = Math.floor(k / w);
    for (const [dy, dx] of N8) {
      const yy = y + dy, xx = x + dx, q = yy * w + xx;
      if (yy >= 0 && yy < h && xx >= 0 && xx < w && L[q] === -1) { L[q] = 2; queue.push(q); }
    }
  }
  return L.map(v => (v === -1 ? 0 : v));
}

const THRESHOLDS: Record<string, [number, number]> = { "0.15 / 0.40": [0.15, 0.4], "0.15 / 0.25": [0.15, 0.25], "0.40 / 0.60": [0.4, 0.6] };
const f = (v: number) => v.toFixed(3);

export const edges: Algorithm = {
  meta: {
    id: "edges",
    title: "Edge Detection: Sobel & Canny",
    topic: "Filtering",
    ref: "Birchfield, Ch. 12 — Differentiation and Edge Detection",
    lead: "Find thin, connected edges: smooth, measure the gradient, keep only its ridge tops, then link weak edges to strong ones.",
    hook: "From gradients to thin, linked edges.",
  },
  explain: {
    ideas: [
      { term: "Gradient", text: "Ix and Iy measure how fast brightness changes; their length is edge strength, their angle points across the edge." },
      { term: "Smoothing built in", text: "Prewitt, Sobel and Scharr average across the derivative, so noise hurts less." },
      { term: "Non-max suppression", text: "Keep a pixel only if it beats both neighbours along the gradient: edges become one pixel wide." },
      { term: "Hysteresis", text: "Strong pixels are edges; weak ones survive only if they connect to a strong edge." },
    ],
    formulas: [
      { label: "Gradient", tex: String.raw`\nabla I=(I_x,\,I_y),\qquad \|\nabla I\|=\sqrt{I_x^2+I_y^2}` },
      { label: "Direction", tex: String.raw`\theta=\operatorname{atan2}(I_y,\,I_x)`, note: "points across the edge, toward the brighter side" },
      {
        label: "Sobel", tex: String.raw`K_x=\tfrac14\begin{bmatrix}-1&0&1\\ -2&0&2\\ -1&0&1\end{bmatrix},\qquad K_y=K_x^{\top}`,
        note: "÷ 4 gives every operator the same response to a step edge",
      },
      {
        label: "Double threshold", tex: String.raw`\begin{gathered}\text{strong: }\|\nabla I\|\ge t_{\text{high}}\\ \text{weak: }t_{\text{low}}\le\|\nabla I\|<t_{\text{high}}\end{gathered}`,
        note: "thresholds are fractions of the largest gradient",
      },
    ],
    tryThis: [
      "Step through non-max suppression: thick gradient ridges shrink to one-pixel lines.",
      "Watch hysteresis: the bar's faint right end stays because its edge connects to the bright end; the faint disk is dropped.",
      "Set Thresholds to 0.40 / 0.60: only the strongest outline survives.",
    ],
  },
  params: [
    { key: "operator", label: "Operator", options: operatorNames, default: "Sobel" },
    { key: "thresholds", label: "Thresholds", options: Object.keys(THRESHOLDS), default: "0.15 / 0.40" },
    { key: "noise", label: "Noise σ", options: [0.02, 0.05, 0.1], default: 0.05, input: true },
  ],
  pseudocode: [
    "CANNY(I, low, high):",
    "  I ← Gaussian blur(I)         ▸ suppress noise",
    "  Ix, Iy ← Sobel(I);  ‖∇I‖, θ",
    "  for each pixel p:          ▸ non-max suppression",
    "    keep ‖∇I‖(p) if ≥ both neighbours along θ",
    "  strong ← ≥ high;  weak ← between low, high",
    "  grow edges from strong into touching weak",
    "  drop weak pixels never reached",
  ],

  panelTitles: () => ["I", "blurred (σ = 1)", "‖∇I‖ and direction", "thinned (non-max)", "edges"],

  // A bar whose contrast fades from bright (left) to faint (right): its long edges run continuously
  // from strong into weak. Plus a faint disk on its own, and noise. (A faint shape glued to a bright
  // one's corner doesn't work: non-max suppression leaves a 1-pixel gap at the corner, book exercise 3.)
  sampleInput({ noise }) {
    const n = 28, I = grid(n, n);
    let seed = 5;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let v = 0.25;
        if (y >= 5 && y <= 14 && x >= 3 && x <= 24) v += 0.6 - (0.45 * (x - 3)) / 21;
        else if ((y - 21) ** 2 + (x - 19) ** 2 <= 16) v += 0.15;
        I.data[y * n + x] = Math.min(1, Math.max(0, v + +noise * gauss()));
      }
    return I;
  },

  run(I, p) {
    let last: Step | undefined;
    for (const s of edges.steps(I, p)) last = s;
    return last!.grids[4];
  },

  *steps(I, { operator, thresholds }): Generator<Step, void> {
    const B = gaussian.run(I, { sigma: 1 }), g = gradient(B, operator as string), n = I.h * I.w, w = I.w;
    const max = Math.max(1e-9, ...g.mag), [lo, hi] = THRESHOLDS[thresholds as string], low = lo * max, high = hi * max;
    const pending = () => grid(I.h, I.w, NaN);
    const magShow: Grid = { ...grid(I.h, I.w), data: Float32Array.from(g.mag, m => m / max) };
    const thin = new Float64Array(n), thinShow = pending();
    g.mag.forEach((m, k) => { if (m < low) thinShow.data[k] = 0; }); // below low: never an edge
    const arrows: Shape[] = [];
    g.mag.forEach((m, k) => {
      if (m < high) return;
      const x = k % w, y = Math.floor(k / w), s = 0.85 / m;
      arrows.push({ kind: "line", x1: x, y1: y, x2: x + g.ix[k] * s, y2: y + g.iy[k] * s, panel: 2 });
    });

    yield { grids: [I, B, pending(), pending(), pending()], src: 0, dst: 1, read: [], write: [], line: 1,
            vars: { "blur σ": 1, why: "derivatives amplify noise, so smooth first" } };
    yield { grids: [I, B, magShow, { ...thinShow, data: thinShow.data.slice() }, pending()], src: 1, dst: 2, read: [], write: [], line: 2,
            shapes: arrows,
            vars: { operator: String(operator), "largest ‖∇I‖": f(max), "low, high": `${f(low)}, ${f(high)}`, arrows: "drawn where ‖∇I‖ ≥ high" } };

    for (let k = 0; k < n; k++) {
      if (g.mag[k] < low) continue;
      const r = nmsAt(w, I.h, g.mag, g.theta[k], k), y = Math.floor(k / w), x = k % w;
      thin[k] = r.keep ? g.mag[k] : 0;
      thinShow.data[k] = thin[k] / max;
      yield {
        grids: [I, B, magShow, { ...thinShow, data: thinShow.data.slice() }, pending()], src: 2, dst: 3, line: 4,
        read: r.cells, write: [[y, x]], shapes: arrows,
        vars: { p: `(${x}, ${y})`, "θ rounded": r.label, "‖∇I‖ behind · p · ahead": `${f(r.behind)} · ${f(g.mag[k])} · ${f(r.ahead)}`,
                result: r.keep ? "kept: a ridge top" : "suppressed: a neighbour is stronger" },
      };
    }

    // Hysteresis, one promoted weak pixel per step.
    const L: Grid = { ...grid(I.h, I.w), labels: true, data: Float32Array.from(thin, m => (m >= high ? 1 : m >= low ? -1 : 0)) };
    const strong = L.data.filter(v => v === 1).length, weak = L.data.filter(v => v === -1).length;
    const legend = "teal = strong · pink = weak, connected · white = weak, undecided";
    yield { grids: [I, B, magShow, thinShow, { ...L, data: L.data.slice() }], src: 3, dst: 4, read: [], write: [], line: 5,
            vars: { strong, weak, colours: legend } };
    const queue = [...L.data.keys()].filter(k => L.data[k] === 1);
    let linked = 0;
    while (queue.length) {
      const k = queue.shift()!, x = k % w, y = Math.floor(k / w);
      for (const [dy, dx] of N8) {
        const yy = y + dy, xx = x + dx, q = yy * w + xx;
        if (yy < 0 || yy >= I.h || xx < 0 || xx >= w || L.data[q] !== -1) continue;
        L.data[q] = 2; queue.push(q); linked++;
        yield { grids: [I, B, magShow, thinShow, { ...L, data: L.data.slice() }], src: 4, dst: 4, line: 6,
                read: [[y, x]], write: [[yy, xx]], vars: { "from (edge)": `(${x}, ${y})`, "promote (weak)": `(${xx}, ${yy})`, "linked so far": linked, colours: legend } };
      }
    }
    const final: Grid = { ...L, data: L.data.map(v => (v === -1 ? 0 : v)) };
    yield { grids: [I, B, magShow, thinShow, final], src: 4, dst: 4, read: [], write: [], line: 7,
            vars: { strong, "weak, linked": linked, "weak, dropped": weak - linked, "edge pixels": strong + linked } };
  },
};
