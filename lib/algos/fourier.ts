// The 2-D discrete Fourier transform and frequency-domain filtering (book Ch. 15).
// The DFT is separable: a 1-D DFT along every row, then along every column. The inverse is shown
// adding frequencies ring by ring (|f| ≤ k), so the output sharpens as k grows.
import { type Algorithm, type Grid, type Params, type Shape, type Step, grid } from "./types";

export type Spectrum = { n: number; re: Float64Array; im: Float64Array };

/** 1-D DFT of n values starting at `off` with `stride`, in place. Inverse: + sign, no 1/n. */
// ponytail: O(n²) per line, fine at 32 px; swap in a radix-2 FFT if images grow past ~128.
function dft1(re: Float64Array, im: Float64Array, n: number, off: number, stride: number, inverse = false) {
  const r = new Float64Array(n), m = new Float64Array(n), s = inverse ? 1 : -1;
  for (let u = 0; u < n; u++)
    for (let x = 0; x < n; x++) {
      const a = (s * 2 * Math.PI * u * x) / n, c = Math.cos(a), d = Math.sin(a), k = off + x * stride;
      r[u] += re[k] * c - im[k] * d;
      m[u] += re[k] * d + im[k] * c;
    }
  for (let u = 0; u < n; u++) { re[off + u * stride] = r[u]; im[off + u * stride] = m[u]; }
}

export const dftRows = (S: Spectrum, inverse = false, y?: number) => {
  for (let i = y ?? 0; i < (y ?? S.n - 1) + 1; i++) dft1(S.re, S.im, S.n, i * S.n, 1, inverse);
};
export const dftCols = (S: Spectrum, inverse = false, u?: number) => {
  for (let i = u ?? 0; i < (u ?? S.n - 1) + 1; i++) dft1(S.re, S.im, S.n, i, S.n, inverse);
};

export function dft2(I: Grid): Spectrum {
  const S = { n: I.w, re: Float64Array.from(I.data), im: new Float64Array(I.w * I.w) };
  dftRows(S); dftCols(S);
  return S;
}

/** real(DFT⁻¹(S)), including the 1/N² factor. */
export function idft2(S: Spectrum): Grid {
  const T = { n: S.n, re: S.re.slice(), im: S.im.slice() };
  dftRows(T, true); dftCols(T, true);
  const O = grid(S.n, S.n);
  O.data.set(T.re.map(v => v / (S.n * S.n)));
  return O;
}

/** Signed frequency of DFT index u: 0, 1, …, n/2 − 1, −n/2, …, −1. */
export const freq = (u: number, n: number) => (u < n / 2 ? u : u - n);
/** Display position of index u once zero frequency is shifted to the center (fftshift). */
const shift = (u: number, n: number) => (u + n / 2) % n;

export function mask(p: Params, fx: number, fy: number): number {
  const r = Math.hypot(fx, fy), R = +p.cutoff;
  if (p.filter === "ideal high-pass") return r > R ? 1 : 0;
  if (p.filter === "Gaussian low-pass") return Math.exp(-(r * r) / (2 * R * R));
  return r <= R ? 1 : 0;
}

export function applyMask(F: Spectrum, p: Params, maxRadius = Infinity): Spectrum {
  const G = { n: F.n, re: F.re.slice(), im: F.im.slice() }, n = F.n;
  for (let v = 0; v < n; v++)
    for (let u = 0; u < n; u++) {
      const fx = freq(u, n), fy = freq(v, n), w = Math.hypot(fx, fy) <= maxRadius ? mask(p, fx, fy) : 0, k = v * n + u;
      G.re[k] *= w; G.im[k] *= w;
    }
  return G;
}

const highPass = (p: Params) => p.filter === "ideal high-pass";

/** Display grid: log(1 + 255·|S|) (as for a 0–255 image) centered, scaled by `max` (the full spectrum's), for each row/col done. */
function logView(S: Spectrum, max: number, done?: (y: number, u: number) => boolean): Grid {
  const n = S.n, g = grid(n, n, NaN);
  for (let y = 0; y < n; y++)
    for (let u = 0; u < n; u++)
      if (!done || done(y, u)) g.data[shift(y, n) * n + shift(u, n)] = Math.log1p(255 * Math.hypot(S.re[y * n + u], S.im[y * n + u])) / max;
  return g;
}
const logMax = (S: Spectrum) => Math.max(1e-9, ...S.re.map((v, k) => Math.log1p(255 * Math.hypot(v, S.im[k]))));

const N = 32;
export function sampleImage(image: string): Grid {
  const I = grid(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v: number;
      if (image === "grating") v = 0.5 + 0.4 * Math.sin((2 * Math.PI * 4 * x) / N);
      else if (image === "diagonal grating") v = 0.5 + 0.4 * Math.sin((2 * Math.PI * 3 * (x + y)) / N);
      else if (image === "square") v = x >= 11 && x <= 20 && y >= 11 && y <= 20 ? 0.9 : 0.1;
      else v = (x >= 5 && x <= 14 && y >= 5 && y <= 14) || (x - 22) ** 2 + (y - 21) ** 2 <= 36 ? 0.85 : 0.15;
      I.data[y * N + x] = v;
    }
  return I;
}

/** Output as drawn: clipped to 0..1, or signed around mid-gray for high-pass (scaled by `m`). */
const display = (O: Grid, p: Params, m: number): Grid =>
  ({ ...O, data: O.data.map(v => (highPass(p) ? 0.5 + v / (2 * m) : Math.min(1, Math.max(0, v)))) });
const absMax = (O: Grid) => Math.max(1e-9, ...O.data.map(Math.abs));

export function frequencyFilter(I: Grid, p: Params): Grid {
  return idft2(applyMask(dft2(I), p));
}

const f2 = (v: number) => v.toFixed(2);
const circle = (r: number): Shape => ({ kind: "ellipse", cx: N / 2, cy: N / 2, a: Math.max(r, 0.3), b: Math.max(r, 0.3), theta: 0, panel: 1 });

export const fourier: Algorithm = {
  meta: {
    id: "fourier",
    title: "Fourier Transform & Frequency Filtering",
    topic: "Filtering",
    ref: "Birchfield, Ch. 15 — The Fourier Transform and Frequency-Domain Filtering",
    lead: "Rewrite an image as a sum of sinusoidal gratings, then filter it by masking frequencies: keep the center to blur, the outside for edges.",
    hook: "Rewrite an image as stripes, then edit them.",
  },
  explain: {
    ideas: [
      { term: "Spectrum", text: "Each point is one grating. Distance from the center is its frequency; the direction is perpendicular to the stripes." },
      { term: "Separable", text: "The 2-D DFT is a 1-D DFT along every row, then along every column." },
      { term: "Masking", text: "Low-pass keeps a disk around the center and blurs; high-pass keeps the outside and leaves the edges." },
      { term: "Ringing", text: "An ideal mask's sharp cutoff puts ripples near edges (Gibbs); a Gaussian mask falls off smoothly and avoids them." },
    ],
    formulas: [
      { label: "2-D DFT", tex: String.raw`\begin{gathered}F(u,v)=\sum_{x}\sum_{y} I(x,y)\\ \cdot\,e^{-i2\pi(ux+vy)/N}\end{gathered}` },
      { label: "Real images are symmetric", tex: String.raw`\lvert F(-u,-v)\rvert=\lvert F(u,v)\rvert`, note: "why a grating shows a pair of dots" },
      { label: "Convolution theorem (book eq. 15.1)", tex: String.raw`\mathcal{F}\{f*g\}=\mathcal{F}\{f\}\cdot\mathcal{F}\{g\}`, note: "circular: the image wraps around at its borders" },
      { label: "Gaussian mask", tex: String.raw`H(u,v)=e^{-(u^2+v^2)/2\sigma^2}` },
    ],
    tryThis: [
      "Pick the grating and play through the column passes: two bright dots appear 4 pixels left and right of the center.",
      "On shapes, compare ideal low-pass with Gaussian low-pass: only the ideal one leaves ripples around the edges.",
      "Switch Filter to ideal high-pass: the flat areas go mid-gray (zero) and only the edges survive.",
    ],
  },
  params: [
    { key: "image", label: "Image", options: ["shapes", "square", "grating", "diagonal grating"], default: "shapes", input: true },
    { key: "filter", label: "Filter", options: ["ideal low-pass", "Gaussian low-pass", "ideal high-pass"], default: "ideal low-pass" },
    { key: "cutoff", label: "Cutoff R (σ)", options: [3, 5, 8], default: 5 },
  ],
  pseudocode: [
    "def frequency_filter(I, mask):",
    "    R = [dft(row) for row in I]         # rows",
    "    F = [dft(col) for col in R.T]    # columns",
    "    F = fftshift(F)        # (0, 0) to the centre",
    "    G = F * mask                   # elementwise",
    "    out = idft(G).real     # shown ring by ring",
    "    return out",
  ],
  paintable: true,

  panelTitles: p => ["I", "log |F|  (centered)", highPass(p) ? "I′  (mid-gray = 0)" : "I′"],

  sampleInput: ({ image }) => sampleImage(String(image)),

  run(I, p) {
    const O = frequencyFilter(I, p);
    return display(O, p, absMax(O));
  },

  *steps(I, p): Generator<Step, void> {
    const n = I.w, F = dft2(I), max = logMax(F), blank = grid(n, n, NaN);
    const R0 = { n, re: Float64Array.from(I.data), im: new Float64Array(n * n) };
    dftRows(R0);
    const rowMax = logMax(R0);
    yield { grids: [I, blank, blank], src: 0, dst: 1, read: [], write: [], line: 0, vars: { "image size": `${n} × ${n}`, "frequencies": `${n * n}  (one per pixel)` } };

    // Row passes: shown with the row-pass scale (they aren't final values yet).
    const S = { n, re: Float64Array.from(I.data), im: new Float64Array(n * n) };
    for (let y = 0; y < n; y++) {
      dftRows(S, false, y);
      let best = 1;
      for (let u = 1; u < n; u++) if (Math.hypot(S.re[y * n + u], S.im[y * n + u]) > Math.hypot(S.re[y * n + best], S.im[y * n + best])) best = u;
      yield {
        grids: [I, logView(S, rowMax, yy => yy <= y), blank], src: 0, dst: 1, line: 1,
        read: Array.from({ length: n }, (_, x) => [y, x]), write: Array.from({ length: n }, (_, u) => [shift(y, n), shift(u, n)]),
        vars: { row: y, "R(y, 0) = row sum": f2(S.re[y * n]), "strongest non-zero frequency": `u = ${freq(best, n)}  (|R| = ${f2(Math.hypot(S.re[y * n + best], S.im[y * n + best]))})` },
      };
    }
    // Column passes: the spectrum's final values appear column by column.
    for (let u = 0; u < n; u++) {
      dftCols(S, false, u);
      const view = logView(S, rowMax, () => true), fin = logView(S, max, (_, uu) => uu <= u);
      fin.data.forEach((v, k) => { if (!Number.isNaN(v)) view.data[k] = v; });
      yield {
        grids: [I, view, blank], src: 1, dst: 1, line: 2,
        read: Array.from({ length: n }, (_, y) => [y, shift(u, n)]), write: Array.from({ length: n }, (_, y) => [y, shift(u, n)]),
        vars: { column: u, "frequency u": freq(u, n), "F(0, 0) = sum of all pixels": f2(S.re[0]) },
      };
    }
    // Peak (excluding DC) — for a grating, it sits at the grating's frequency.
    let pk = 1;
    for (let k = 1; k < n * n; k++) if (Math.hypot(F.re[k], F.im[k]) > Math.hypot(F.re[pk], F.im[pk]) + 1e-9) pk = k;
    const [px, py] = [freq(pk % n, n), freq(Math.floor(pk / n), n)];
    yield {
      grids: [I, logView(F, max), blank], src: 1, dst: 1, read: [], write: [], line: 3,
      shapes: [{ kind: "point", x: N / 2 + px, y: N / 2 + py, panel: 1 }, { kind: "point", x: N / 2 - px, y: N / 2 - py, panel: 1 }],
      vars: { center: "frequency (0, 0): average brightness", "strongest non-zero frequency": `(${px}, ${py}) and its mirror (${-px}, ${-py})`, "|f|": f2(Math.hypot(px, py)) },
    };

    const G = applyMask(F, p);
    let kept = 0;
    for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) kept += mask(p, freq(u, n), freq(v, n));
    const energy = (X: Spectrum) => X.re.reduce((s, r, k) => s + r * r + X.im[k] ** 2, 0);
    yield {
      grids: [I, logView(G, max), blank], src: 1, dst: 1, read: [], write: [], line: 4, shapes: [circle(+p.cutoff)],
      vars: { mask: `${p.filter}, R = ${p.cutoff}`, "frequencies kept": `${f2(kept)} of ${n * n}`, "energy kept": `${f2((100 * energy(G)) / energy(F))} %` },
    };

    // Inverse, adding rings |f| ≤ k. Display scale fixed by the final output.
    const final = idft2(G), m = absMax(final), R = +p.cutoff;
    const kMax = Math.ceil(Math.hypot(n / 2, n / 2));
    const k0 = highPass(p) ? Math.floor(R) + 1 : 0, k1 = p.filter === "ideal low-pass" ? R : kMax;
    for (let k = k0; k <= k1; k++) {
      const Ok = idft2(applyMask(F, p, k));
      yield {
        grids: [I, logView(applyMask(F, p, k), max), display(Ok, p, m)], src: 1, dst: 2, read: [], write: [], line: 5, shapes: [circle(k)],
        vars: { "rings included": `|f| ≤ ${k}`, "max |I′ − final|": f2(Ok.data.reduce((s, v, i) => Math.max(s, Math.abs(v - final.data[i])), 0)) },
      };
    }
    yield {
      grids: [I, logView(G, max), display(final, p, m)], src: 1, dst: 2, read: [], write: [], line: 6, shapes: [circle(R)],
      vars: { "I′ range": `${f2(Math.min(...final.data))} … ${f2(Math.max(...final.data))}`, "input range": `${f2(Math.min(...I.data))} … ${f2(Math.max(...I.data))}` },
    };
  },
};
