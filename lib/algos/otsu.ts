// Thresholding with Otsu's method. Gray grids hold level/255; class 0 = levels ≤ t, class 1 = levels > t.
import { type Algorithm, type Grid, type Step, grid } from "./types";

const level = (v: number) => Math.round(v * 255);

export function histogram(I: Grid): number[] {
  const h = new Array(256).fill(0);
  for (const v of I.data) h[level(v)]++;
  return h;
}

/** I > t as a binary grid. */
export const threshold = (I: Grid, t: number): Grid => ({ ...grid(I.h, I.w), data: I.data.map(v => (level(v) > t ? 1 : 0)) });

/**
 * Sweep every t with running sums. Yields the state at each t; returns t*.
 * σ²_B(t) is undefined (NaN) when a class is empty. Ties keep the smallest t.
 * A constant image has no valid t; t* is then that constant, so I > t* is all 0.
 */
export function* sweep(h: number[]) {
  const N = h.reduce((a, b) => a + b, 0);
  const muT = h.reduce((a, n, i) => a + i * n, 0) / N;
  let w0 = 0, m0 = 0, best = -1, tStar = -1;
  for (let t = 0; t < 256; t++) {
    w0 += h[t] / N;
    m0 += (t * h[t]) / N;
    const w1 = 1 - w0;
    const valid = w0 > 1e-12 && w1 > 1e-12;
    const mu0 = m0 / w0, mu1 = (muT - m0) / w1;
    const s2 = valid ? w0 * w1 * (mu0 - mu1) ** 2 : NaN;
    const improved = valid && s2 > best;
    if (improved) { best = s2; tStar = t; }
    yield { t, w0, w1, mu0, mu1, s2, valid, improved, best, tStar };
  }
  return tStar >= 0 ? tStar : Math.round(muT);
}

export function otsuThreshold(I: Grid): number {
  const it = sweep(histogram(I));
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

// Seeded noise so each image looks the same on every visit.
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "—");

export const otsu: Algorithm = {
  meta: {
    id: "otsu",
    title: "Thresholding & Otsu's Method",
    topic: "Binary images",
    ref: "Birchfield, Ch. 3 — Thresholding, Erosion, and Dilation",
    lead: "Turn a gray image into black and white by trying every threshold and keeping the one that best separates the two classes.",
    hook: "Let the histogram pick the threshold.",
  },
  explain: {
    ideas: [
      { term: "Threshold", text: "Every pixel brighter than t becomes foreground; everything else becomes background." },
      { term: "Two classes", text: "Each t splits the histogram into dark pixels (≤ t) and bright pixels (> t)." },
      { term: "Between-class variance", text: "Scores a split: large when both classes are big and their means are far apart." },
      { term: "Limits", text: "Works on two clear peaks; struggles with three peaks or a tiny object." },
    ],
    formulas: [
      { label: "Class weights", tex: String.raw`\omega_0(t)=\sum_{i\le t} p_i,\qquad \omega_1(t)=1-\omega_0(t)`, note: "pᵢ = share of pixels with level i" },
      { label: "Class means", tex: String.raw`\begin{gathered}\mu_0(t)=\frac{1}{\omega_0}\sum_{i\le t} i\,p_i\\ \mu_1(t)=\frac{1}{\omega_1}\sum_{i>t} i\,p_i\end{gathered}` },
      { label: "Between-class variance", tex: String.raw`\sigma_B^2(t)=\omega_0\,\omega_1\,(\mu_0-\mu_1)^2` },
      { label: "Otsu's threshold", tex: String.raw`t^*=\arg\max_t\ \sigma_B^2(t)`, note: "ties keep the smallest t" },
    ],
    tryThis: [
      "Press play and watch the variance curve grow: its peak is where t* lands.",
      "Set Image to three peaks: the middle band gets split by noise.",
      "Raise Noise σ to 35: the histogram peaks overlap and speckle appears.",
    ],
  },
  params: [
    { key: "image", label: "Image", options: ["two peaks", "small object", "three peaks"], default: "two peaks", input: true },
    { key: "noise", label: "Noise σ", options: [8, 20, 35], default: 20, input: true },
  ],
  pseudocode: [
    "OTSU(I):",
    "  p ← histogram(I) / N        ▸ 256 bins",
    "  for t ← 0 … 255:",
    "    ω₀, ω₁ ← share of pixels ≤ t, > t",
    "    μ₀, μ₁ ← mean level of each class",
    "    σ²_B(t) ← ω₀·ω₁·(μ₀ − μ₁)²",
    "    if σ²_B(t) > best:  best, t* ← σ²_B(t), t",
    "  return t*                  ▸ binary = I > t*",
  ],

  panelTitles: () => ["I", "I > t"],

  sampleInput({ image, noise }) {
    const n = 48, I = grid(n, n), rand = rng(11);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let v = 70;
        if (image === "small object") v = (y - 30) ** 2 + (x - 16) ** 2 <= 30 ? 180 : 70;
        else if (image === "three peaks") v = x < 16 ? 50 : x < 32 ? 130 : 210;
        else if ((y - 16) ** 2 + (x - 15) ** 2 <= 90 || (y > 26 && y < 42 && x > 24 && x < 42)) v = 170;
        I.data[y * n + x] = Math.min(255, Math.max(0, Math.round(v + +noise * gauss()))) / 255;
      }
    return I;
  },

  run: I => threshold(I, otsuThreshold(I)),

  *steps(I): Generator<Step, void> {
    const h = histogram(I), N = I.h * I.w;
    const blank = grid(I.h, I.w, NaN);
    const curve: number[] = new Array(256).fill(NaN);
    // σ²_B over all t, only to fix the chart's y-scale before the sweep reaches the peak.
    const all = [...sweep(h)];
    const lineMax = Math.max(...all.map(s => s.s2).filter(Number.isFinite), 1e-9);
    const plot = (t?: number, tStar?: number) => ({
      bars: h, line: curve.slice(), lineMax, barLabel: "histogram", lineLabel: "σ²_B(t)",
      cursor: t === undefined ? undefined : { x: t, label: `t = ${t}` },
      best: tStar === undefined || tStar < 0 ? undefined : { x: tStar, label: `t* = ${tStar}` },
    });

    yield {
      grids: [I, blank], src: 0, dst: 0, read: [], write: [], line: 1, plot: plot(),
      vars: { N, "distinct levels": h.filter(Boolean).length, "mean level μ_T": f2(h.reduce((a, c, i) => a + i * c, 0) / N) },
    };

    const it = sweep(h);
    let r = it.next();
    while (!r.done) {
      const s = r.value;
      curve[s.t] = s.s2;
      yield {
        grids: [I, threshold(I, s.t)], src: 0, dst: 1, read: [], write: [],
        line: !s.valid ? 3 : s.improved ? 6 : 5,
        plot: plot(s.t, s.tStar),
        vars: {
          t: s.t,
          "ω₀ / ω₁": `${f2(s.w0)} / ${f2(s.w1)}`,
          "μ₀ / μ₁": s.valid ? `${f2(s.mu0)} / ${f2(s.mu1)}` : "a class is empty — skip",
          "σ²_B(t)": f2(s.s2),
          "best so far": s.tStar < 0 ? "—" : `t* = ${s.tStar}  (σ²_B = ${f2(s.best)})`,
        },
      };
      r = it.next();
    }
    const tStar = r.value;
    yield {
      grids: [I, threshold(I, tStar)], src: 0, dst: 1, read: [], write: [], line: 7, plot: plot(undefined, tStar),
      vars: { "t*": tStar, "foreground pixels": threshold(I, tStar).data.reduce((a, b) => a + b, 0) },
    };
  },
};
