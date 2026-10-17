// 2-D geometric transforms x' = A·x + t (book Ch. 8), applied by forward mapping: every source pixel
// is sent to where it lands. Rotation follows cv2.getRotationMatrix2D: positive = counter-clockwise
// on screen (y points down). Transforms act about the image centre c.
import { type Algorithm, type Grid, type Shape, type Step, grid } from "./types";

export type Mat = [number, number, number, number]; // [a, b, c, d] = [[a, b], [c, d]]
export const R = (deg: number, s = 1): Mat => {
  const t = (deg * Math.PI) / 180, a = s * Math.cos(t), b = s * Math.sin(t);
  return [a, b, -b, a];
};
export const PRESETS: Record<string, Mat> = {
  "rotate 30°": R(30),
  "rotate 30° + scale 1.3": R(30, 1.3),
  shear: [1, 0.5, 0, 1],
  "stretch 1.5 × 0.7": [1.5, 0, 0, 0.7],
  "flip horizontal": [-1, 0, 0, 1],
};

export const det = ([a, b, c, d]: Mat) => a * d - b * c;

/** Where the book's hierarchy places A, and what it guarantees to preserve. */
export function classify(A: Mat): { kind: "Euclidean" | "similarity" | "affine"; preserves: string } {
  const [a, b, c, d] = A, eps = 1e-9;
  // AᵀA = s²·I  ⇔  columns orthogonal and equally long.
  const s2 = a * a + c * c, orth = Math.abs(a * b + c * d) < eps && Math.abs(b * b + d * d - s2) < eps;
  if (orth && det(A) > 0 && Math.abs(s2 - 1) < eps) return { kind: "Euclidean", preserves: "lengths, angles" };
  if (orth && det(A) > 0) return { kind: "similarity", preserves: "angles, ratios of lengths" };
  return { kind: "affine", preserves: "parallel lines, ratios along a line" };
}

const centre = (I: Grid) => [(I.w - 1) / 2, (I.h - 1) / 2] as const;

/** Exact landing point of pixel (x, y): A·(p − c) + c. */
export function forward(I: Grid, A: Mat, x: number, y: number): [number, number] {
  const [cx, cy] = centre(I), [a, b, c, d] = A, dx = x - cx, dy = y - cy;
  return [a * dx + b * dy + cx, c * dx + d * dy + cy];
}

/** Inverse of forward(): which source position lands on (x', y'). */
export function inverse(I: Grid, A: Mat, x: number, y: number): [number, number] {
  const [cx, cy] = centre(I), [a, b, c, d] = A, D = det(A), dx = x - cx, dy = y - cy;
  return [(d * dx - b * dy) / D + cx, (-c * dx + a * dy) / D + cy];
}

/** Destination pixels the shape covers (their inverse lands on a source pixel) but nothing landed on. */
export function holes(I: Grid, A: Mat, O: Grid): number {
  let n = 0;
  for (let y = 0; y < O.h; y++)
    for (let x = 0; x < O.w; x++) {
      const [sx, sy] = inverse(I, A, x, y).map(Math.round);
      if (!O.data[y * O.w + x] && sx >= 0 && sx < I.w && sy >= 0 && sy < I.h && I.data[sy * I.w + sx]) n++;
    }
  return n;
}

const f = (v: number) => (Math.abs(v) < 5e-3 ? "0.00" : v.toFixed(2));
const mat = ([a, b, c, d]: Mat) => `[${f(a)} ${f(b)}; ${f(c)} ${f(d)}]`;

/** The source's bounding box of foreground pixels, mapped: a square stays a square only for similarity. */
function boxOutline(I: Grid, A: Mat): Shape[] {
  let x0 = I.w, x1 = -1, y0 = I.h, y1 = -1;
  I.data.forEach((v, k) => {
    if (!v) return;
    const x = k % I.w, y = Math.floor(k / I.w);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  });
  if (x1 < 0) return [];
  // Pixel edges, not centres, so the outline hugs the shape.
  const corners = [[x0 - 0.5, y0 - 0.5], [x1 + 0.5, y0 - 0.5], [x1 + 0.5, y1 + 0.5], [x0 - 0.5, y1 + 0.5]].map(([x, y]) => forward(I, A, x, y));
  return corners.map(([x1_, y1_], i) => {
    const [x2, y2] = corners[(i + 1) % 4];
    return { kind: "line", x1: x1_, y1: y1_, x2, y2 };
  });
}

export const transforms: Algorithm = {
  meta: {
    id: "transforms",
    title: "Geometric Transforms",
    topic: "Geometry",
    ref: "Birchfield, Ch. 8 — Geometric Transformations",
    lead: "Move, rotate, scale or shear an image by sending every pixel through the same 2×2 matrix plus a shift.",
    hook: "Move, rotate and shear with one matrix.",
  },
  explain: {
    ideas: [
      { term: "One formula", text: "Flips, rotations, scaling and shears are all x′ = Ax + t, with a different A." },
      { term: "Euclidean", text: "Rotation and translation only: lengths and angles survive." },
      { term: "Similarity", text: "Adds a uniform scale: angles and ratios of lengths survive, lengths themselves don't." },
      { term: "Affine", text: "Any invertible A: squares shear into parallelograms, but parallel lines stay parallel." },
    ],
    formulas: [
      {
        label: "General 2-D transform",
        tex: String.raw`\begin{bmatrix}x'\\ y'\end{bmatrix}=\begin{bmatrix}a&b\\ c&d\end{bmatrix}\begin{bmatrix}x\\ y\end{bmatrix}+\begin{bmatrix}t_x\\ t_y\end{bmatrix}`,
      },
      {
        label: "Euclidean (rigid)", tex: String.raw`A=R(\theta)=\begin{bmatrix}\cos\theta&\sin\theta\\ -\sin\theta&\cos\theta\end{bmatrix}`,
        note: "counter-clockwise on screen, like cv2.getRotationMatrix2D",
      },
      { label: "Similarity", tex: String.raw`A=s\,R(\theta)` },
      { label: "Affine", tex: String.raw`A\ \text{any }2\times2\text{ with }\det A\neq0`, note: "a flip has det A = −1 (book exercise 1)" },
    ],
    tryThis: [
      "Pick rotate 30° + scale 1.3 and step through: gaps open between the landed pixels.",
      "Pick shear: the F's box turns into a parallelogram, yet its sides stay parallel.",
      "Pick flip horizontal and read det A on the last step (book exercise 1).",
    ],
  },
  params: [
    { key: "transform", label: "Transform", options: Object.keys(PRESETS), default: "rotate 30°" },
  ],
  pseudocode: [
    "def forward_map(I, A):      # about the centre c",
    "    for x in foreground(I):",
    "        x2 = A @ (x - c) + c",
    "        O[round(x2)] = 1        # may leave holes",
    "    classify(A)  # Euclidean / similarity / affine",
  ],
  paintable: true,

  panelTitles: () => ["I", "O = I mapped forward"],

  // The book's test image: a letter F, which has no rotational or mirror symmetry.
  sampleInput() {
    const n = 24, I = grid(n, n);
    for (let y = 5; y <= 17; y++) for (let x = 8; x <= 9; x++) I.data[y * n + x] = 1; // stem
    for (let y = 5; y <= 6; y++) for (let x = 10; x <= 15; x++) I.data[y * n + x] = 1; // top bar
    for (let y = 10; y <= 11; y++) for (let x = 10; x <= 13; x++) I.data[y * n + x] = 1; // middle bar
    return I;
  },

  run(I, p) {
    let last: Step | undefined;
    for (const s of transforms.steps(I, p)) last = s;
    return last!.grids[1];
  },

  *steps(I, { transform }): Generator<Step, void> {
    const A = PRESETS[transform as string], O = grid(I.h, I.w), box = boxOutline(I, A);
    const [cx, cy] = centre(I);
    let written = 0, outside = 0, collided = 0;
    yield { grids: [I, { ...O, data: O.data.slice() }], src: 0, dst: 1, read: [], write: [], line: 0, shapes: box,
            vars: { A: mat(A), "det A": f(det(A)), "centre c": `(${cx}, ${cy})` } };
    for (let y = 0; y < I.h; y++)
      for (let x = 0; x < I.w; x++) {
        if (!I.data[y * I.w + x]) continue;
        const [px, py] = forward(I, A, x, y), [rx, ry] = [Math.round(px), Math.round(py)];
        const inside = rx >= 0 && rx < O.w && ry >= 0 && ry < O.h;
        const taken = inside && O.data[ry * O.w + rx] === 1;
        if (!inside) outside++;
        else if (taken) collided++;
        else { O.data[ry * O.w + rx] = 1; written++; }
        yield {
          grids: [I, { ...O, data: O.data.slice() }], src: 0, dst: 1, line: 3,
          read: [[y, x]], write: inside ? [[ry, rx]] : [],
          shapes: [...box, { kind: "point", x: px, y: py }],
          vars: { x: `(${x}, ${y})`, "x − c": `(${f(x - cx)}, ${f(y - cy)})`, "x′": `(${f(px)}, ${f(py)})`,
                  "writes to": !inside ? "outside the image" : `(${rx}, ${ry})${taken ? ", already set: two pixels landed here" : ""}` },
        };
      }
    const kind = classify(A), gaps = holes(I, A, O);
    yield {
      grids: [I, O], src: 0, dst: 1, read: [], write: [], line: 4, shapes: box,
      vars: { A: mat(A), "det A": f(det(A)), type: kind.kind, preserves: kind.preserves,
              "pixels landed": `${written}  (${collided} on top of another, ${outside} outside)`,
              holes: gaps ? `${gaps}: inverse mapping (Ch. 9) fills them` : "none" },
    };
  },
};
