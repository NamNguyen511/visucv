// Two-view structure from motion: from matched pixels only, the 8-point method estimates the essential
// matrix E, E splits into four candidate poses (R, t), the one that puts the points in front of both
// cameras wins, and each match is triangulated. The scene is the epipolar page's cube and cameras.
import { type M3, type V3, Kinv, SETUPS, T, apply, geometry, matches, mul, render } from "./epipolar";
import { type Algorithm, type Grid, type Params, type Shape, type Step, grid } from "./types";

/** Symmetric eigen-decomposition by Jacobi rotations, largest eigenvalue first. */
export function eigSym(S: number[][]) {
  const n = S.length, A = S.map(r => [...r]), V = A.map((_, i) => A.map((_, j) => +(i === j)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (A[p][q] === 0) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.hypot(th, 1));
        const c = 1 / Math.hypot(t, 1), s = t * c;
        const rot = (M: number[][], cols: boolean) => {
          for (let k = 0; k < n; k++) {
            const a = cols ? M[k][p] : M[p][k], b = cols ? M[k][q] : M[q][k];
            if (cols) { M[k][p] = c * a - s * b; M[k][q] = s * a + c * b; } else { M[p][k] = c * a - s * b; M[q][k] = s * a + c * b; }
          }
        };
        rot(A, true); rot(A, false); rot(V, true);
      }
  }
  return A.map((_, i) => ({ value: A[i][i], vector: V.map(r => r[i]) })).sort((a, b) => b.value - a.value);
}

const dot = (a: number[], b: number[]) => a.reduce((s, v, k) => s + v * b[k], 0);
const cross = ([a, b, c]: number[], [x, y, z]: number[]): V3 => [b * z - c * y, c * x - a * z, a * y - b * x];
const scale = (v: number[], k: number) => v.map(x => x * k) as V3;
const cols = (...c: number[][]): M3 => [0, 1, 2].map(i => c.map(v => v[i]));
const det = (M: M3) => dot(M[0], cross(M[1], M[2]));

/** SVD of a 3×3 matrix with det U = det V = +1, so U·W·Vᵀ is always a rotation. Needs σ₂ > 0, and
 *  rebuilds E exactly only if det E ≥ 0 (σ₃ = 0 for an essential matrix, so either sign works). */
export function svd3(E: M3) {
  const [e1, e2] = eigSym(mul(T(E), E)), v1 = e1.vector, v2 = e2.vector, v3 = cross(v1, v2);
  const s = [e1.value, e2.value, dot(apply(E, v3), apply(E, v3))].map(v => Math.sqrt(Math.max(0, v)));
  const u1 = scale(apply(E, v1 as V3), 1 / s[0]), u2 = scale(apply(E, v2 as V3), 1 / s[1]);
  return { U: cols(u1, u2, cross(u1, u2)), V: cols(v1, v2, v3), s };
}

type Pair = { n1: V3; n2: V3; x1: [number, number]; x2: [number, number]; X: V3 };

/** The 8-point method on normalized coordinates n = K⁻¹x: A·vec(E) = 0, E = A's null vector. */
export function eightPoint(P: Pair[]) {
  // Hartley's normalization: centre each image's points and scale them to mean distance √2, so the
  // equations' entries are all about 1 (raw, the noise drowns the small ones).
  const H = (pts: V3[]): M3 => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const k = Math.SQRT2 / (pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length);
    return [[k, 0, -k * cx], [0, k, -k * cy], [0, 0, 1]];
  };
  const H1 = H(P.map(q => q.n1)), H2 = H(P.map(q => q.n2));
  const rows = P.map(({ n1, n2 }) => { const a = apply(H1, n1), b = apply(H2, n2); return b.flatMap(y => a.map(x => x * y)); }); // row-major E: n2ᵢ·n1ⱼ
  const AtA = Array.from({ length: 9 }, (_, i) => Array.from({ length: 9 }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0)));
  const e = eigSym(AtA).at(-1)!, En: M3 = [e.vector.slice(0, 3), e.vector.slice(3, 6), e.vector.slice(6)];
  const raw = mul(mul(T(H2), En), H1); // undo the normalization: n2ᵀ H2ᵀ E' H1 n1 = 0
  const { U, V, s } = svd3(raw), u = T(U), v = T(V);
  const E = [0, 1, 2].map(i => [0, 1, 2].map(j => u[0][i] * v[0][j] + u[1][i] * v[1][j])); // U·diag(1, 1, 0)·Vᵀ
  return { raw, E, s, residual: e.value };
}

/** Closest points of ray 1 (from the origin along n1) and ray 2 (from C₂ along Rᵀn2): their midpoint
 *  and the depth along each ray (depth in each camera, since n has z = 1). */
export function triangulate(n1: V3, n2: V3, R: M3, t: V3) {
  const C2 = scale(apply(T(R), t), -1), d2 = apply(T(R), n2);
  const a = dot(n1, n1), b = dot(n1, d2), c = dot(d2, d2), p = dot(n1, C2), q = dot(d2, C2), D = b * b - a * c;
  const s1 = (b * q - c * p) / D, s2 = (a * q - b * p) / D;
  const X = n1.map((v, k) => (s1 * v + C2[k] + s2 * d2[k]) / 2) as V3;
  return { X, s1, s2, C2 };
}

const W: M3 = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];
/** E's four (R, t) candidates: R = U W Vᵀ or U Wᵀ Vᵀ, t = ±u₃ (unit length). */
export function poses(E: M3) {
  const { U, V } = svd3(E), u3 = T(U)[2] as V3, R1 = mul(mul(U, W), T(V)), R2 = mul(mul(U, T(W)), T(V));
  return [[R1, u3], [R1, scale(u3, -1)], [R2, u3], [R2, scale(u3, -1)]] as [M3, V3][];
}

// Seeded pixel noise, so each setting looks the same on every visit.
function noisy(sigma: number) {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  return ([x, y]: [number, number]): [number, number] => {
    const g = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    return [x + sigma * g(), y + sigma * g()];
  };
}

export function pairs(setup: string, noise: number): Pair[] {
  const jitter = noisy(noise), n = ([x, y]: [number, number]) => apply(Kinv, [x, y, 1]);
  return matches(setup, "cube").map(m => {
    const x1 = jitter(m.x1), x2 = jitter(m.x2);
    return { x1, x2, n1: n(x1), n2: n(x2), X: m.X };
  });
}

/** Everything the steps show, computed once. */
export function solve(setup: string, noise: number) {
  const P = pairs(setup, noise), est = eightPoint(P);
  const cands = poses(est.E).map(([R, t]) => {
    const tri = P.map(q => triangulate(q.n1, q.n2, R, t));
    return { R, t, tri, front: tri.filter(r => r.s1 > 0 && r.s2 > 0).length };
  });
  const best = cands.reduce((a, b) => (b.front > a.front ? b : a));
  const base = Math.hypot(...geometry(setup).c2); // the true baseline: the one thing the images can't give
  return { P, est, cands, best, base, pts: best.tri.map(r => scale(r.X, base)) };
}

// Top view: X across the columns, Z down the rows, one world unit per cell; the cameras sit 2 rows down.
const XMIN = -6, ZMIN = -2, TW = 15, TH = 27; // Z to 24: noise smears the cube's far side past 20
const at = (X: number, Z: number) => ({ x: X - XMIN, y: Z - ZMIN });
const topCell = (X: number, Z: number): [number, number] => [Math.round(Z - ZMIN), Math.round(X - XMIN)];
const inTop = (X: number, Z: number) => { const [r, c] = topCell(X, Z); return c >= 0 && c < TW && r >= 0 && r < TH; };

function top(truth: V3[], found: V3[]): Grid {
  const g = grid(TH, TW);
  for (const [X, , Z] of truth) if (inTop(X, Z)) { const [r, c] = topCell(X, Z); g.data[r * TW + c] = 0.35; }
  for (const [X, , Z] of found) if (inTop(X, Z)) { const [r, c] = topCell(X, Z); g.data[r * TW + c] = 1; }
  return g;
}

const opts = (p: Params) => ({ setup: String(p.setup), noise: Number(p.noise) });
const fmt = (v: number) => (Math.abs(v) < 5e-4 ? "0" : v.toFixed(3)).replace("-", "−");
const vec = (v: number[]) => `(${v.map(fmt).join(", ")})`;
const rows = (M: number[][]) => M.map(r => r.map(fmt).join(" ")).join(" ; ");
const unitE = (E: number[][], like: number[][]) => {
  const n = Math.hypot(...E.flat()) / Math.SQRT2, sign = dot(E.flat(), like.flat()) < 0 ? -1 : 1;
  return E.map(r => r.map(v => (sign * v) / n));
};
/** Where most triangulated points of a pose candidate end up. */
const where = (tri: { s1: number; s2: number }[]) => {
  const n = (f: (r: { s1: number; s2: number }) => boolean) => tri.filter(f).length;
  const c = [["in front of both", n(r => r.s1 > 0 && r.s2 > 0)], ["behind camera 1", n(r => r.s1 <= 0 && r.s2 > 0)],
             ["behind camera 2", n(r => r.s1 > 0 && r.s2 <= 0)], ["behind both", n(r => r.s1 <= 0 && r.s2 <= 0)]] as const;
  return c.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
};
const angle = (R: M3) => (Math.acos(Math.min(1, Math.max(-1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2))) * 180) / Math.PI;

export const sfm: Algorithm = {
  meta: {
    id: "sfm",
    title: "Structure from Motion (Two Views)",
    topic: "3-D vision",
    ref: "Birchfield",
    lead: "From matched pixels alone, recover how the second camera moved and where each 3-D point sits, up to an unknown scale.",
    hook: "Camera motion and 3-D from two images.",
  },
  explain: {
    ideas: [
      { term: "Eight matches, one E", text: "Each match gives one linear equation in E's nine entries, so eight or more pin E down up to scale." },
      { term: "Snap to an essential matrix", text: "A true E has singular values (1, 1, 0); setting them so removes what noise added." },
      { term: "Four poses, one real", text: "E splits into two rotations and ± t; only one pose puts the points in front of both cameras." },
      { term: "Up to scale", text: "Rays from both cameras meet at each point, but a small near scene and a big far one look identical." },
    ],
    formulas: [
      { label: "8-point equations", tex: String.raw`\begin{gathered}\tilde n_2^{\mathsf T} E\,\tilde n_1=0,\qquad \tilde n=K^{-1}\tilde x\\ A\,\operatorname{vec}(E)=0\end{gathered}` },
      { label: "Pose from E", tex: String.raw`\begin{gathered}E=U\operatorname{diag}(1,1,0)\,V^{\mathsf T}\\ R=UWV^{\mathsf T}\ \text{or}\ UW^{\mathsf T}V^{\mathsf T},\quad t=\pm u_3\end{gathered}`, note: "W = rotation by 90° about z; u₃ = U's last column" },
    ],
    tryThis: [
      "Step through the four poses: only one puts every point in front of both cameras.",
      "Set Noise to 0.1 px and step to the end: a tenth of a pixel pushes the points off the gray truth, mostly in depth.",
      "Switch Setup to turned toward: the rotation angle is recovered too, not only the direction of travel.",
    ],
  },
  params: [
    { key: "setup", label: "Setup", options: Object.keys(SETUPS), default: "sideways", input: true },
    { key: "noise", label: "Noise (px)", options: [0, 0.05, 0.1], default: 0 }, // sub-pixel: moves the matches, not the drawn pixels
  ],
  pseudocode: [
    "def sfm(m, K):          # n = inv(K) @ x",
    "    A = [kron(n2, n1) for n1, n2 in m]",
    "    E = null_vector(A).reshape(3, 3)",
    "    E = closest_essential(E)  # σ: 1, 1, 0",
    "    for R, t in four_poses(E):",
    "        score = points_in_front(R, t)",
    "    R, t = pose with the best score",
    "    for n1, n2 in m:",
    "        X = triangulate(n1, n2, R, t)",
    "    return points        # up to scale",
  ],

  panelTitles: () => ["image 1", "image 2", "top view  (X →, Z ↓; gray = truth)"],

  sampleInput: p => render(matches(opts(p).setup, "cube").map(m => m.x1)),

  run(_, p) {
    const { setup, noise } = opts(p), { P, pts } = solve(setup, noise);
    return top(P.map(q => q.X), pts);
  },

  *steps(I1, p): Generator<Step, void> {
    const { setup, noise } = opts(p), { P, est, cands, best, base, pts } = solve(setup, noise), g = geometry(setup);
    const M = matches(setup, "cube"), I2 = render(M.map(m => m.x2)), truth = P.map(q => q.X); // M: noise-free pixels, as drawn
    const cell = ([x, y]: [number, number]): [number, number] => [Math.round(y), Math.round(x)];
    const cam1: Shape = { kind: "point", ...at(0, 0), panel: 2 };
    const frame = (found: V3[]) => [I1, I2, top(truth, found)];
    const trueE = unitE(g.E, g.E), E = unitE(est.E, trueE);
    const sig = est.s.map(v => fmt((v * Math.SQRT2) / Math.hypot(...est.s))).join(", "); // E's display scale

    for (const [i, q] of P.entries())
      yield {
        grids: frame([]), src: 0, dst: 1, read: [cell(M[i].x1)], write: [cell(M[i].x2)], line: 1, shapes: [cam1],
        vars: { match: `${i + 1} of ${P.length}`, "n1 = K⁻¹x1": vec(q.n1), "n2 = K⁻¹x2": vec(q.n2), "row of A": "n2ᵢ · n1ⱼ for all i, j" },
      };
    yield {
      grids: frame([]), src: 1, dst: 2, read: [], write: [], line: 2, shapes: [cam1],
      vars: { equations: P.length, "smallest eigenvalue of AᵀA": fmt(est.residual), "singular values": sig },
    };
    yield {
      grids: frame([]), src: 1, dst: 2, read: [], write: [], line: 3, shapes: [cam1],
      vars: { "σ before": sig, "σ after": "1, 1, 0", "E (estimated)": rows(E), "E (true, same scale)": rows(trueE) },
    };
    for (const [k, c] of cands.entries()) {
      const C2 = scale(c.tri[0].C2, base);
      yield {
        grids: [I1, I2, top(truth, c.tri.map(r => scale(r.X, base)))], src: 1, dst: 2, read: [], write: [], line: 5,
        shapes: [cam1, { kind: "point", ...at(C2[0], C2[2]), panel: 2 }],
        vars: { pose: `${k + 1} of 4`, "R angle": `${angle(c.R).toFixed(1)}°`, "t (unit)": vec(c.t), "in front of both": `${c.front} of ${P.length}`,
                "most points land": where(c.tri) },
      };
    }
    const C2 = scale(best.tri[0].C2, base), cam2: Shape = { kind: "point", ...at(C2[0], C2[2]), panel: 2 };
    const tTrue = scale(g.t, 1 / Math.hypot(...g.t));
    yield {
      grids: frame([]), src: 1, dst: 2, read: [], write: [], line: 6, shapes: [cam1, cam2],
      vars: { pose: `${cands.indexOf(best) + 1} of 4`, "R angle": `${angle(best.R).toFixed(1)}° (true ${angle(g.R).toFixed(1)}°)`, "t (unit)": vec(best.t), "t (true, unit)": vec(tTrue) },
    };
    for (const [i, q] of P.entries()) {
      const X = pts[i], rays: Shape[] = [
        { kind: "line", x1: at(0, 0).x, y1: at(0, 0).y, x2: at(X[0], X[2]).x, y2: at(X[0], X[2]).y, thick: true, panel: 2 },
        { kind: "line", x1: at(C2[0], C2[2]).x, y1: at(C2[0], C2[2]).y, x2: at(X[0], X[2]).x, y2: at(X[0], X[2]).y, thick: true, panel: 2 },
      ];
      yield {
        grids: frame(pts.slice(0, i + 1)), src: 0, dst: 2, read: [cell(M[i].x1)], write: inTop(X[0], X[2]) ? [topCell(X[0], X[2])] : [],
        line: 8, shapes: [cam1, cam2, ...rays],
        vars: { match: `${i + 1} of ${P.length}`, "X (found)": vec(X), "X (true)": vec(q.X), error: fmt(Math.hypot(...X.map((v, k) => v - q.X[k]))) },
      };
    }
    const err = pts.reduce((s, X, i) => s + Math.hypot(...X.map((v, k) => v - P[i].X[k])), 0) / Math.max(1, P.length);
    yield {
      grids: frame(pts), src: 2, dst: 2, read: [], write: [], line: 9, shapes: [cam1, cam2],
      vars: { points: P.length, "mean error": fmt(err), scale: `×${fmt(base)}: the true baseline, which the images can't give` },
    };
  },
};
