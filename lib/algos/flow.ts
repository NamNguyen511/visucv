// Lucas–Kanade optical flow (book Ch. 21): solve Z d = e at every pixel, Z = Σ g gᵀ (the Ch. 20 structure
// tensor) and e = Σ (I − J) g over the window. Frame J is frame I shifted by the chosen motion (bilinear,
// book eq. 9.1), so the true answer is known. A single linearized step, no iterations or pyramid.
import { filter2d } from "./convolution";
import { gradient } from "./edges";
import { gaussianKernel } from "./gaussian";
import { eig2 } from "./harris";
import { type Algorithm, type Cell, type Grid, type Params, type Shape, type Step, grid } from "./types";
import { bilinear } from "./warping";

export const MOTIONS: Record<string, [dx: number, dy: number]> = {
  "→ 0.5 px": [0.5, 0],
  "↘ 0.5 px": [0.5 / Math.SQRT2, 0.5 / Math.SQRT2],
  "→ 2 px": [2, 0],
};
const TAU = 0.1; // eigenvalue threshold, as a fraction of the image's largest λ₁
const ARROW = 3; // arrows drawn this many times longer than d, on every STRIDE-th pixel so they don't overlap
const STRIDE = 3;

const N = 28;
export function sampleImage(image: string): Grid {
  const I = grid(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const on = image === "stripes" ? Math.floor((x + y) / 4) % 2 === 0
        : image === "dots" ? ((x * 7 + y * 13 + x * y * 5) % 11) < 2
        : (x >= 5 && x <= 14 && y >= 5 && y <= 14) || (x - 20) ** 2 + (y - 20) ** 2 <= 16;
      I.data[y * N + x] = on ? 0.85 : 0.15;
    }
  // Soften the edges: the linearization I(x + d) ≈ I(x) + gᵀd needs gradients wider than d.
  const g = gaussianKernel(1);
  return { ...I, data: Float32Array.from(filter2d(I, g.map(a => g.map(b => a * b)), "correlation", "replicate")) };
}

/** J(x) = I(x − d): the frame after the content moves by d. Off-image samples repeat the edge pixel. */
export function shift(I: Grid, [dx, dy]: [number, number]): Grid {
  const J = grid(I.h, I.w), cl = (v: number, m: number) => Math.min(m - 1, Math.max(0, v));
  for (let y = 0; y < I.h; y++) for (let x = 0; x < I.w; x++) J.data[y * I.w + x] = bilinear(I, cl(x - dx, I.w), cl(y - dy, I.h)).value;
  return J;
}

export type Flow = { u: Float64Array; v: Float64Array; kind: ("tracked" | "edge" | "flat" | "rim")[]; Z: number[][]; e: number[][]; It: Float64Array };

/** d at every pixel. λ₂ > τ: full solve. Only λ₁ > τ (an edge): the aperture problem, so keep only the
 *  component along the gradient (the normal flow). Neither: unknown, d = 0. The rim, where the window or
 *  its Sobel taps leave the image, is skipped: repeated edge pixels there fake corners. */
export function lucasKanade(I: Grid, J: Grid, r: number): Flow {
  // The edges-page Sobel is gain-normalized (an ideal step reads 1), which is 2 · ∂I/∂x; halve it.
  const { ix, iy } = gradient(I, "Sobel"), { h, w } = I, n = h * w;
  for (let k = 0; k < n; k++) { ix[k] /= 2; iy[k] /= 2; }
  const It = Float64Array.from({ length: n }, (_, k) => J.data[k] - I.data[k]);
  const cl = (v: number, m: number) => Math.min(m - 1, Math.max(0, v));
  const Z: number[][] = [], e: number[][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const z = [0, 0, 0], b = [0, 0];
      for (let i = -r; i <= r; i++)
        for (let j = -r; j <= r; j++) {
          const q = cl(y + i, h) * w + cl(x + j, w);
          z[0] += ix[q] * ix[q]; z[1] += ix[q] * iy[q]; z[2] += iy[q] * iy[q];
          b[0] -= ix[q] * It[q]; b[1] -= iy[q] * It[q];
        }
      Z.push(z); e.push(b);
    }
  const tau = TAU * Z.reduce((m, [a, b, c], k) => (inner(k, h, w, r) ? Math.max(m, eig2(a, b, c).l1) : m), 1e-12);
  const F: Flow = { u: new Float64Array(n), v: new Float64Array(n), kind: [], Z, e, It };
  for (let k = 0; k < n; k++) {
    if (!inner(k, h, w, r)) { F.kind.push("rim"); continue; }
    const [a, b, c] = Z[k], [e1, e2] = e[k], { l1, l2, theta } = eig2(a, b, c);
    if (l2 > tau) {
      const det = a * c - b * b;
      F.u[k] = (c * e1 - b * e2) / det; F.v[k] = (a * e2 - b * e1) / det; F.kind.push("tracked");
    } else if (l1 > tau) {
      const cx = Math.cos(theta), sy = Math.sin(theta), s = (cx * e1 + sy * e2) / l1;
      F.u[k] = s * cx; F.v[k] = s * sy; F.kind.push("edge");
    } else F.kind.push("flat");
  }
  return F;
}

export const inner = (k: number, h: number, w: number, r: number) => {
  const y = Math.floor(k / w), x = k % w;
  return y > r && x > r && y < h - 1 - r && x < w - 1 - r;
};

const radius = (p: Params) => (p.window === "3×3" ? 1 : p.window === "7×7" ? 3 : 2);
const motion = (p: Params) => MOTIONS[String(p.motion)] ?? MOTIONS["→ 0.5 px"];

/** |d| ÷ the true shift, capped at 1: white = full motion found, gray = only part (normal flow), black = none; the rim stays NaN (never computed). */
function view(F: Flow, h: number, w: number, d: [number, number], upto = Infinity): Grid {
  const g = grid(h, w, NaN), m = Math.hypot(...d);
  for (let k = 0; k < h * w && k <= upto; k++) if (F.kind[k] !== "rim") g.data[k] = Math.min(1, Math.hypot(F.u[k], F.v[k]) / m);
  return g;
}

function arrow(x: number, y: number, u: number, v: number, panel: number, thick = false): Shape[] {
  const x2 = x + ARROW * u, y2 = y + ARROW * v, len = Math.hypot(u, v) * ARROW;
  if (len < 0.15) return [];
  const a = Math.atan2(v, u), hl = Math.min(0.4, 0.5 * len);
  const head = (s: number): Shape => ({ kind: "line", x1: x2, y1: y2, x2: x2 - hl * Math.cos(a + s), y2: y2 - hl * Math.sin(a + s), thick, panel });
  return [{ kind: "line", x1: x, y1: y, x2, y2, thick, panel }, head(0.5), head(-0.5)];
}

const f = (v: number) => (Math.abs(v) < 5e-4 ? "0.000" : v.toFixed(3));

export const flow: Algorithm = {
  meta: {
    id: "flow",
    title: "Optical Flow (Lucas–Kanade)",
    topic: "Features & motion",
    ref: "Birchfield, Ch. 21 — Optical Flow and Motion Estimation",
    lead: "Compare two frames through a small window and solve a 2×2 system for how far the pixels under it moved.",
    hook: "How far did each pixel move?",
  },
  explain: {
    ideas: [
      { term: "Brightness constancy", text: "A moving point keeps its brightness, so I − J ≈ gᵀd: the frame difference tells you the motion along the gradient." },
      { term: "One window, one d", text: "One pixel gives one equation for two unknowns; summing over a window gives the 2×2 system Z d = e." },
      { term: "Aperture problem", text: "On a straight edge Z has one large eigenvalue: only motion across the edge is measurable, sliding along it is invisible." },
      { term: "Small motion only", text: "The linearization holds while d is smaller than the blur of the edges; bigger jumps need iterations or a pyramid." },
    ],
    formulas: [
      { label: "Lucas–Kanade system", tex: String.raw`\begin{gathered}Z\,d=e\\ Z=\sum_{\text{window}} g\,g^{\mathsf T},\quad e=\sum_{\text{window}}\bigl(I-J\bigr)\,g\end{gathered}`, note: "g = (Ix, Iy); Z is the Chapter 20 structure tensor" },
      { label: "Edge (λ₂ ≈ 0): normal flow only", tex: String.raw`d_\perp=\frac{v_1^{\mathsf T}e}{\lambda_1}\,v_1` },
    ],
    tryThis: [
      "Step along the square's top edge with Motion → 0.5 px: the edge says it didn't move, yet the corner gets the full arrow.",
      "Pick Image stripes with Motion → 0.5 px: the arrows tilt 45° across the stripes instead of pointing right.",
      "Pick Motion → 2 px: the arrows come out short, the linear guess breaks once d outgrows the blur.",
    ],
  },
  params: [
    { key: "image", label: "Image", options: ["shapes", "dots", "stripes"], default: "shapes", input: true },
    { key: "motion", label: "Motion", options: Object.keys(MOTIONS), default: "→ 0.5 px" },
    { key: "window", label: "Window", options: ["3×3", "5×5", "7×7"], default: "5×5" },
  ],
  pseudocode: [
    "def lucas_kanade(I, J, r):",
    "    Ix, Iy = sobel(I); It = J - I",
    "    for p in pixels(I, margin=r + 1):",
    "        Z = Σ [[Ix², IxIy], [IxIy, Iy²]]",
    "        e = -Σ [Ix·It, Iy·It]",
    "        if min(eigvals(Z)) > τ:",
    "            d[p] = solve(Z, e)",
    "        elif max(eigvals(Z)) > τ:",
    "            d[p] = normal flow   # aperture",
    "        else: d[p] = unknown",
    "    return d",
  ],
  paintable: true,

  panelTitles: p => ["I  (frame t)", `J  (frame t+1, moved ${String(p.motion)})`, `|d| ÷ true shift  (arrows ×${ARROW})`],

  sampleInput: ({ image }) => sampleImage(String(image)),

  run(I, p) {
    const d = motion(p);
    return view(lucasKanade(I, shift(I, d), radius(p)), I.h, I.w, d);
  },

  *steps(I, p): Generator<Step, void> {
    const r = radius(p), d = motion(p), J = shift(I, d), { h, w } = I, F = lucasKanade(I, J, r);
    const arrows = (upto: number) => {
      const out: Shape[] = [];
      for (let k = 0; k <= upto && k < h * w; k++)
        if (k % w % STRIDE === 0 && Math.floor(k / w) % STRIDE === 0) out.push(...arrow(k % w, Math.floor(k / w), F.u[k], F.v[k], 2));
      return out;
    };
    yield {
      grids: [I, J, grid(h, w, NaN)], src: 0, dst: 2, read: [], write: [], line: 1,
      vars: { "true d": `(${f(d[0])}, ${f(d[1])})`, window: `${2 * r + 1}×${2 * r + 1}`, τ: `${TAU} · max λ₁` },
    };
    for (let y = r + 1; y < h - 1 - r; y++)
      for (let x = r + 1; x < w - 1 - r; x++) {
        const k = y * w + x, [a, b, c] = F.Z[k], { l1, l2 } = eig2(a, b, c), win: Cell[] = [], kind = F.kind[k];
        for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) win.push([y + i, x + j]);
        yield {
          grids: [I, J, view(F, h, w, d, k)], src: 0, dst: 2, read: win, write: [[y, x]],
          line: kind === "tracked" ? 6 : kind === "edge" ? 8 : 9,
          shapes: [...arrows(k), ...arrow(x, y, F.u[k], F.v[k], 1, true)],
          window: {
            cells: Array.from({ length: 2 * r + 1 }, (_, i) => Array.from({ length: 2 * r + 1 }, (_, j) => {
              const yy = Math.min(h - 1, Math.max(0, y + i - r)), xx = Math.min(w - 1, Math.max(0, x + j - r));
              return F.It[yy * w + xx].toFixed(2);
            })),
            note: "It = J − I in the window: how much each pixel brightened",
          },
          vars: {
            "p = (x, y)": `(${x}, ${y})`,
            Z: `[${f(a)} ${f(b)} ; ${f(b)} ${f(c)}]`,
            e: `(${f(F.e[k][0])}, ${f(F.e[k][1])})`,
            "λ₁, λ₂": `${f(l1)}, ${f(Math.max(l2, 0))}`,
            d: kind === "flat" ? "unknown" : `(${f(F.u[k])}, ${f(F.v[k])})`,
            looks: kind === "edge" ? "edge: normal flow only" : kind,
          },
        };
      }
    const count = (s: string) => F.kind.filter(q => q === s).length;
    yield {
      grids: [I, J, view(F, h, w, d)], src: 2, dst: 2, read: [], write: [], line: 10, shapes: arrows(h * w),
      vars: { tracked: count("tracked"), "edge (normal flow)": count("edge"), unknown: count("flat"), "true d": `(${f(d[0])}, ${f(d[1])})` },
    };
  },
};
