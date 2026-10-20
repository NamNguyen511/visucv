// Epipolar geometry: two cameras see the same 3-D points. Camera 1 sits at the origin; a world point X
// is X₂ = R·X + t in camera 2. The essential matrix E = [t]ₓR and the fundamental matrix F = K⁻ᵀ E K⁻¹
// turn a pixel x₁ into the line l₂ = F·x₁ in image 2, and its match always lies on it: x₂ᵀ F x₁ = 0.
import { type P3, scene } from "./pinhole";
import { type Line, segment } from "./ransac";
import { type Algorithm, type Cell, type Grid, type Params, type Shape, type Step, grid } from "./types";

type M3 = number[][]; // 3×3, row-major
type V3 = [number, number, number];

const S = 21, C = (S - 1) / 2, FOCAL = 20;
export const K: M3 = [[FOCAL, 0, C], [0, FOCAL, C], [0, 0, 1]];
const Kinv: M3 = [[1 / FOCAL, 0, -C / FOCAL], [0, 1 / FOCAL, -C / FOCAL], [0, 0, 1]];

const mul = (A: M3, B: M3): M3 => A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const apply = (A: M3, v: V3): V3 => A.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) as V3;
const T = (A: M3): M3 => A[0].map((_, j) => A.map(r => r[j]));
const skew = ([x, y, z]: V3): M3 => [[0, -z, y], [z, 0, -x], [-y, x, 0]];
const rotY = (a: number): M3 => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];

/** Camera 2's pose: centre C₂ in camera-1 coordinates and rotation R, so t = −R·C₂. */
export const SETUPS: Record<string, { R: M3; c2: V3 }> = {
  sideways: { R: rotY(0), c2: [4, 0, 0] }, // a stereo rig: epipolar lines are image rows
  "turned toward": { R: rotY(Math.atan2(4, 15)), c2: [4, 0, 0] }, // aimed at the scene's centre: lines converge
  "forward + right": { R: rotY(0), c2: [2, 0, 5] }, // the epipole lands inside both images
  forward: { R: rotY(0), c2: [0, 0, 5] }, // moving along the axis: lines radiate from the centre
};

export function geometry(setup: string) {
  const { R, c2 } = SETUPS[setup] ?? SETUPS.sideways, t = apply(R, c2).map(v => -v) as V3;
  const E = mul(skew(t), R), F = mul(mul(T(Kinv), E), Kinv);
  return { R, t, c2, E, F };
}

/** Pixel of a camera-coordinate point, or null behind the camera. */
const pixel = (X: V3): [number, number] | null => {
  if (X[2] <= 1e-9) return null;
  const [u, v, w] = apply(K, X);
  return [u / w, v / w];
};
/** Epipole: the other camera's centre (camera coordinates), projected homogeneously. It can lie behind the
 *  camera (still a valid image point) or at infinity (w = 0: parallel epipolar lines). */
export const epipole = (X: V3): [number, number] | null => {
  const [u, v, w] = apply(K, X);
  return Math.abs(w) < 1e-9 ? null : [u / w, v / w];
};
const inImage = ([x, y]: [number, number]) => Math.round(x) >= 0 && Math.round(x) < S && Math.round(y) >= 0 && Math.round(y) < S;

/** Each scene point's exact pixels in both images (only points both cameras see). */
export function matches(setup: string, name: string) {
  const { R, t } = geometry(setup);
  return scene(name).flatMap((X: P3) => {
    const a = pixel(X as V3), b = pixel(apply(R, X as V3).map((v, k) => v + t[k]) as V3);
    return a && b && inImage(a) && inImage(b) ? [{ x1: a, x2: b }] : [];
  });
}

/** The line ax + by + c = 0 as a point and a unit direction. */
export function toLine([a, b, c]: V3): Line {
  const n = Math.hypot(a, b);
  return { x: (-a * c) / (n * n), y: (-b * c) / (n * n), dx: -b / n, dy: a / n };
}
export const lineDist = ([a, b, c]: V3, [x, y]: [number, number]) => Math.abs(a * x + b * y + c) / Math.hypot(a, b);

const opts = (p: Params) => ({ setup: String(p.setup), name: String(p.scene) });

function render(pts: [number, number][]): Grid {
  const g = grid(S, S);
  for (const [x, y] of pts) if (inImage([x, y])) g.data[Math.round(y) * S + Math.round(x)] = 1;
  return g;
}

/** The left image's white pixels, each with its scene match if a 3-D point projects there. */
function pixels(I: Grid, setup: string, name: string) {
  const M = matches(setup, name), out: { cell: Cell; x1: [number, number]; x2?: [number, number] }[] = [];
  for (let y = 0; y < I.h; y++)
    for (let x = 0; x < I.w; x++) {
      if (!I.data[y * I.w + x]) continue;
      const m = M.find(q => Math.round(q.x1[0]) === x && Math.round(q.x1[1]) === y);
      out.push({ cell: [y, x], x1: m ? m.x1 : [x, y], x2: m?.x2 });
    }
  return out;
}

const fmt = (v: number) => (Math.abs(v) < 5e-4 ? "0" : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3)).replace("-", "−");
const row = (r: number[]) => r.map(fmt).join(" ");
const xy = ([x, y]: [number, number]) => `(${x.toFixed(2)}, ${y.toFixed(2)})`.replace(/-/g, "−");

export const epipolar: Algorithm = {
  meta: {
    id: "epipolar",
    title: "Epipolar Geometry",
    topic: "3-D vision",
    ref: "Birchfield",
    lead: "A pixel in one camera fixes a ray, not a point; the other camera sees that ray as a line holding the match.",
    hook: "Search a line, not the image.",
  },
  explain: {
    ideas: [
      { term: "One pixel, one ray", text: "The depth along the ray is unknown, so in the other view the match can be anywhere on a line." },
      { term: "Fundamental matrix", text: "F packs the cameras' intrinsics and relative pose; F·x₁ is the epipolar line, and x₂ᵀ F x₁ = 0 checks a match." },
      { term: "Epipoles", text: "Each camera's centre seen by the other camera; every epipolar line in an image passes through its epipole." },
      { term: "Rectified stereo", text: "Cameras side by side push the epipoles to infinity: lines become rows, so matching searches one row." },
    ],
    formulas: [
      { label: "Epipolar constraint", tex: String.raw`\begin{gathered}\tilde x_2^{\mathsf T} F\,\tilde x_1=0,\qquad l_2=F\,\tilde x_1\\ F=K^{-\mathsf T}EK^{-1},\quad E=[t]_\times R\end{gathered}`, note: "x̃ = (x, y, 1); l = (a, b, c) means ax + by + c = 0" },
    ],
    tryThis: [
      "Keep Setup sideways and step through: every epipolar line is a row, and the match sits on it.",
      "Switch Setup to forward + right and step to the end: all the lines meet at one dot, the epipole.",
      "Paint a new pixel on image 1: it still gets a line, but no match, because no scene point lies on its ray.",
    ],
  },
  params: [
    { key: "setup", label: "Setup", options: Object.keys(SETUPS), default: "sideways", input: true }, // image 1 keeps only points camera 2 sees
    { key: "scene", label: "Scene", options: ["cube", "posts"], default: "cube", input: true },
  ],
  pseudocode: [
    "def epipolar_lines(K, R, t, pts1):",
    "    E = skew(t) @ R",
    "    F = inv(K).T @ E @ inv(K)",
    "    for x1 in pts1:",
    "        l2 = F @ [x1, 1]   # x2 lies on l2",
    "    return lines",
  ],
  paintable: true,

  panelTitles: () => ["image 1  (camera 1)", "image 2  (camera 2, lines = F·x₁)"],

  sampleInput: p => { const { setup, name } = opts(p); return render(matches(setup, name).map(m => m.x1)); },

  run(I, p) {
    const { setup, name } = opts(p);
    return render(pixels(I, setup, name).flatMap(q => (q.x2 ? [q.x2] : [])));
  },

  *steps(I, p): Generator<Step, void> {
    const { setup, name } = opts(p), { t, c2, E, F } = geometry(setup), P = pixels(I, setup, name);
    const e1 = epipole(c2), e2 = epipole(t); // camera 2's centre in image 1; camera 1's (the origin, at t) in image 2
    const epi = (e: [number, number] | null, panel: number): Shape[] => (e && inImage(e) ? [{ kind: "point", x: e[0], y: e[1], panel }] : []);
    const lines: Shape[] = [], found: [number, number][] = [];
    yield {
      grids: [I, grid(S, S)], src: 0, dst: 1, read: [], write: [], line: 2, shapes: [...epi(e1, 0), ...epi(e2, 1)],
      vars: { t: `(${t.map(fmt).join(", ")})`, "E rows": E.map(row).join(" ; "), "F rows": F.map(row).join(" ; "), epipole: e2 ? xy(e2) : "at infinity" },
    };
    for (const q of P) {
      const l2 = apply(F, [q.x1[0], q.x1[1], 1]), l1 = q.x2 && apply(T(F), [q.x2[0], q.x2[1], 1]); // l1: the same plane seen in image 1
      const now = [...segment(toLine(l2), S, S, 0, true, 1), ...(l1 ? segment(toLine(l1), S, S, 0, true, 0) : [])];
      if (q.x2) found.push(q.x2);
      const mark: Shape[] = q.x2 ? [{ kind: "point", x: q.x2[0], y: q.x2[1], panel: 1 }] : [];
      yield {
        grids: [I, render(found)], src: 0, dst: 1, read: [q.cell], write: q.x2 && inImage(q.x2) ? [[Math.round(q.x2[1]), Math.round(q.x2[0])]] : [],
        line: 4, shapes: [...lines, ...now, ...mark, ...epi(e1, 0), ...epi(e2, 1)],
        vars: {
          x1: xy(q.x1),
          "l2 = (a, b, c)": `(${l2.map(fmt).join(", ")})`,
          x2: q.x2 ? xy(q.x2) : Math.hypot(l2[0], l2[1]) < 1e-9 ? "ray holds camera 2's centre: only the epipole" : "no 3-D point here: anywhere on l2",
          ...(q.x2 ? { "x₂ᵀ F x₁": fmt(l2[0] * q.x2[0] + l2[1] * q.x2[1] + l2[2]) } : {}),
        },
      };
      lines.push(...segment(toLine(l2), S, S, 0, false, 1));
    }
    yield {
      grids: [I, render(found)], src: 1, dst: 1, read: [], write: [], line: 5, shapes: [...lines, ...epi(e1, 0), ...epi(e2, 1)],
      vars: { lines: P.length, matches: found.length, epipole: e2 ? xy(e2) : "at infinity" },
    };
  },
};
