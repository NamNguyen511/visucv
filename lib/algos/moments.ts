// Image moments (book Ch. 5) and the moment covariance matrix's eigen-decomposition (Ch. 6).
// Coordinates: x = column, y = row (y points down), so angles turn clockwise on screen.
import { type Algorithm, type Grid, type Shape, type Step, clone, grid } from "./types";

export type Sums = { m00: number; m10: number; m01: number; m20: number; m11: number; m02: number };
const zero = (): Sums => ({ m00: 0, m10: 0, m01: 0, m20: 0, m11: 0, m02: 0 });

/** Everything Ch. 5–6 derives from the raw moments. Undefined parts are NaN. */
export function derive(s: Sums) {
  const xbar = s.m10 / s.m00, ybar = s.m01 / s.m00;
  // Shift-of-origin identity (book §5.4): central moments straight from the raw ones.
  const mu20 = s.m20 - xbar * s.m10, mu02 = s.m02 - ybar * s.m01, mu11 = s.m11 - xbar * s.m01;
  const [sxx, sxy, syy] = [mu20 / s.m00, mu11 / s.m00, mu02 / s.m00]; // covariance (book eq. 6.4)
  // Eigenvalues of a symmetric 2×2: mean ± radius.
  const mean = (sxx + syy) / 2, rad = Math.hypot((sxx - syy) / 2, sxy);
  const lmax = mean + rad, lmin = Math.max(0, mean - rad);
  const v: [number, number] = Math.abs(sxy) > 1e-12 ? [lmax - syy, sxy] : sxx >= syy ? [1, 0] : [0, 1];
  const n = Math.hypot(...v);
  return {
    ...s, xbar, ybar, mu20, mu11, mu02, cov: [sxx, sxy, syy] as const, lmax, lmin,
    vmax: [v[0] / n, v[1] / n] as const,
    a: 2 * Math.sqrt(lmax), b: 2 * Math.sqrt(lmin), // book eq. 6.5
    theta: 0.5 * Math.atan2(2 * mu11, mu20 - mu02), // book eq. 5.3
    ecc: lmax > 0 ? Math.sqrt(1 - lmin / lmax) : NaN, // book eq. 6.6
  };
}

export function moments(I: Grid) {
  const s = zero();
  for (let y = 0; y < I.h; y++)
    for (let x = 0; x < I.w; x++)
      if (I.data[y * I.w + x]) { s.m00++; s.m10 += x; s.m01 += y; s.m20 += x * x; s.m11 += x * y; s.m02 += y * y; }
  return derive(s);
}

type D = ReturnType<typeof derive>;
const centroid = (d: D): Shape => ({ kind: "point", x: d.xbar, y: d.ybar });
const ellipse = (d: D): Shape => ({ kind: "ellipse", cx: d.xbar, cy: d.ybar, a: d.a, b: d.b, theta: d.theta });
const axes = (d: D): Shape[] => {
  const [ux, uy] = [Math.cos(d.theta), Math.sin(d.theta)];
  return [
    { kind: "line", x1: d.xbar - d.a * ux, y1: d.ybar - d.a * uy, x2: d.xbar + d.a * ux, y2: d.ybar + d.a * uy, thick: true },
    { kind: "line", x1: d.xbar + d.b * uy, y1: d.ybar - d.b * ux, x2: d.xbar - d.b * uy, y2: d.ybar + d.b * ux },
  ];
};

const f = (v: number, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : "—");
const deg = (r: number) => `${f((r * 180) / Math.PI, 1)}°`;

export const momentsAlgo: Algorithm = {
  meta: {
    id: "moments",
    title: "Image Moments & Orientation",
    topic: "Shape",
    ref: "Birchfield, Ch. 5 — Image Moments · Ch. 6 — Eigenvectors of the Moment Covariance Matrix",
    lead: "Summarize a blob with a few sums over its pixels: its area, centre, spread, and the direction it points.",
  },
  explain: {
    ideas: [
      { term: "Raw moments", text: "Sums of xᵖyᵠ over the blob's pixels. m₀₀ is the area." },
      { term: "Central moments", text: "The same sums measured around the centroid, so moving the blob changes nothing." },
      { term: "Equivalent ellipse", text: "The covariance's eigenvectors give its axes; the eigenvalues give their lengths." },
      { term: "Mass, not outline", text: "The ellipse summarizes where the pixels are, so on an L it cuts across the gap." },
    ],
    formulas: [
      { label: "Raw moment", tex: String.raw`m_{pq}=\sum_{x,y} x^p\,y^q\,I(x,y)` },
      { label: "Centroid", tex: String.raw`\bar x=\frac{m_{10}}{m_{00}},\qquad \bar y=\frac{m_{01}}{m_{00}}` },
      { label: "Central moments, by shift of origin", tex: String.raw`\begin{gathered}\mu_{20}=m_{20}-\bar x\,m_{10}\\ \mu_{02}=m_{02}-\bar y\,m_{01}\\ \mu_{11}=m_{11}-\bar x\,m_{01}\end{gathered}` },
      { label: "Covariance", tex: String.raw`\Sigma=\frac{1}{m_{00}}\begin{bmatrix}\mu_{20}&\mu_{11}\\ \mu_{11}&\mu_{02}\end{bmatrix}` },
      { label: "Orientation", tex: String.raw`\theta=\tfrac12\,\operatorname{atan2}(2\mu_{11},\ \mu_{20}-\mu_{02})`, note: "clockwise on screen, because y points down" },
      { label: "Semi-axes and eccentricity", tex: String.raw`\begin{gathered}a=2\sqrt{\lambda_{\max}},\qquad b=2\sqrt{\lambda_{\min}}\\ e=\sqrt{1-\lambda_{\min}/\lambda_{\max}}\end{gathered}`, note: "λ = eigenvalues of Σ" },
    ],
    tryThis: [
      "Press play: the ellipse wobbles, then settles as pixels arrive.",
      "Pick circle (book exercise 1): the eccentricity drops close to 0.",
      "Pick L-shape, paint more pixels onto one arm, and watch θ swing.",
    ],
  },
  params: [
    { key: "shape", label: "Shape", options: ["ellipse", "bar", "L-shape", "circle"], default: "ellipse", input: true },
    { key: "angle", label: "Angle", options: [0, 30, 60, 120], default: 30, input: true },
  ],
  pseudocode: [
    "MOMENTS(I):",
    "  for each pixel (x, y) with I = 1:",
    "    m_pq += xᵖ·yᵠ        ▸ all p + q ≤ 2",
    "  x̄, ȳ ← m₁₀/m₀₀, m₀₁/m₀₀        ▸ centroid",
    "  μ₂₀ ← m₂₀ − x̄·m₁₀;  μ₀₂ ← m₀₂ − ȳ·m₀₁",
    "  μ₁₁ ← m₁₁ − x̄·m₀₁       ▸ shift of origin",
    "  Σ ← [μ₂₀ μ₁₁; μ₁₁ μ₀₂] / m₀₀  ▸ covariance",
    "  λmax, λmin, v ← eigen(Σ)",
    "  a, b ← 2√λmax, 2√λmin       ▸ semi-axes",
    "  θ ← ½·atan2(2μ₁₁, μ₂₀ − μ₀₂)",
    "  ecc ← √(1 − λmin/λmax)",
  ],
  paintable: true,

  panelTitles: () => ["I", "equivalent ellipse"],

  // Hand scan-converted shapes (like the book's §5.2), centred at (12, 12); angle rotates clockwise.
  sampleInput({ shape, angle }) {
    const n = 25, I = grid(n, n), t = (+angle * Math.PI) / 180;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = x - 12, dy = y - 12;
        const u = dx * Math.cos(t) + dy * Math.sin(t), v = -dx * Math.sin(t) + dy * Math.cos(t);
        const inside =
          shape === "bar" ? Math.abs(u) <= 10 && Math.abs(v) <= 2 :
          shape === "circle" ? dx * dx + dy * dy <= 49 :
          shape === "L-shape" ? (x >= 4 && x <= 8 && y >= 3 && y <= 20) || (x >= 4 && x <= 19 && y >= 16 && y <= 20) :
          (u / 10) ** 2 + (v / 4.5) ** 2 <= 1;
        I.data[y * n + x] = inside ? 1 : 0;
      }
    return I;
  },

  run: I => clone(I),

  *steps(I): Generator<Step, void> {
    const s = zero();
    const base = { grids: [I, I], src: 0, dst: 1, write: [] };
    for (let y = 0; y < I.h; y++)
      for (let x = 0; x < I.w; x++) {
        if (!I.data[y * I.w + x]) continue;
        s.m00++; s.m10 += x; s.m01 += y; s.m20 += x * x; s.m11 += x * y; s.m02 += y * y;
        const d = derive(s);
        yield {
          ...base, read: [[y, x]], line: 2,
          // The equivalent ellipse of the pixels seen so far.
          shapes: s.m00 >= 3 && d.lmin > 0 ? [ellipse(d), centroid(d)] : [centroid(d)],
          vars: { "(x, y)": `(${x}, ${y})`, "m₀₀ (area)": s.m00, "m₁₀, m₀₁": `${s.m10}, ${s.m01}`,
                  "m₂₀, m₁₁, m₀₂": `${s.m20}, ${s.m11}, ${s.m02}` },
        };
      }
    if (!s.m00) {
      yield { ...base, read: [], line: 1, vars: { "m₀₀": "0 — no foreground pixels; paint some on I" } };
      return;
    }
    const d = derive(s);
    const step = (line: number, shapes: Shape[], vars: Step["vars"]): Step => ({ ...base, read: [], line, shapes, vars });
    yield step(3, [centroid(d)], { "m₀₀ (area)": d.m00, "x̄, ȳ": `${f(d.xbar)}, ${f(d.ybar)}` });
    yield step(4, [centroid(d)], { "μ₂₀": f(d.mu20, 1), "μ₀₂": f(d.mu02, 1), why: "spread around the centroid, not the origin" });
    yield step(5, [centroid(d)], { "μ₁₁": f(d.mu11, 1), why: d.mu11 > 0 ? "x and y grow together" : d.mu11 < 0 ? "x grows as y shrinks" : "no x–y tilt" });
    yield step(6, [centroid(d)], { Σ: `[${f(d.cov[0])} ${f(d.cov[1])}; ${f(d.cov[1])} ${f(d.cov[2])}]` });
    yield step(7, [centroid(d), ...axes(d)], { λmax: f(d.lmax), λmin: f(d.lmin), "v (major axis)": `(${f(d.vmax[0])}, ${f(d.vmax[1])})` });
    yield step(8, [ellipse(d), centroid(d), ...axes(d)], { "a (semi-major)": f(d.a), "b (semi-minor)": f(d.b) });
    yield step(9, [ellipse(d), centroid(d), ...axes(d)], { θ: `${deg(d.theta)}  (clockwise: y points down)` });
    yield step(10, [ellipse(d), centroid(d), ...axes(d)], {
      eccentricity: f(d.ecc, 3), why: d.ecc < 0.3 ? "nearly round" : d.ecc > 0.85 ? "very elongated" : "elongated",
      "area, centroid": `${d.m00} px at (${f(d.xbar, 1)}, ${f(d.ybar, 1)})`,
    });
  },
};
