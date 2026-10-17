// Image warping (book Ch. 9): forward mapping leaves holes; inverse mapping pulls every output pixel
// from M⁻¹ of its position, sampled with nearest neighbour or bilinear interpolation (book eq. 9.1).
// Transforms act about the image centre, as on the Ch. 8 page. Outside the source counts as 0.
import { type Mat, R, forward, inverse } from "./transforms";
import { type Algorithm, type Grid, type Step, grid } from "./types";

export const WARPS: Record<string, Mat> = {
  "rotate 25° + scale 1.6": R(25, 1.6), // the book's §9.1 example
  "scale 0.5": [0.5, 0, 0, 0.5], // book exercise 1
  "rotate 30°": R(30),
};

const px = (I: Grid, x: number, y: number) => (x >= 0 && x < I.w && y >= 0 && y < I.h ? I.data[y * I.w + x] : 0);

/** Book eq. 9.1: blend the 4 pixels around (x, y) by how close (x, y) is to each. */
export function bilinear(I: Grid, x: number, y: number) {
  const x0 = Math.floor(x), y0 = Math.floor(y), dx = x - x0, dy = y - y0;
  const v = [px(I, x0, y0), px(I, x0 + 1, y0), px(I, x0, y0 + 1), px(I, x0 + 1, y0 + 1)];
  const w = [(1 - dx) * (1 - dy), dx * (1 - dy), (1 - dx) * dy, dx * dy];
  return { value: v.reduce((s, vi, i) => s + vi * w[i], 0), x0, y0, dx, dy, v, w };
}

export const nearest = (I: Grid, x: number, y: number) => px(I, Math.round(x), Math.round(y));

const f = (v: number) => v.toFixed(2);
const lvl = (v: number) => String(Math.round(v * 255)); // show intensities as 0–255 like the book

export const warping: Algorithm = {
  meta: {
    id: "warping",
    title: "Bilinear Interpolation & Inverse Mapping",
    topic: "Geometry",
    ref: "Birchfield, Ch. 9 — Image Warping, Inverse Mapping, and Bilinear Interpolation",
    lead: "Warp an image without holes by asking where each output pixel came from, then blending its four source neighbours.",
    hook: "Ask where each output pixel came from.",
  },
  explain: {
    ideas: [
      { term: "Forward mapping", text: "Push each source pixel to its new spot; when the image grows, gaps appear." },
      { term: "Inverse mapping", text: "Pull instead: apply M⁻¹ to each output pixel to find its source. No holes, by construction." },
      { term: "Nearest neighbour", text: "Round to the closest source pixel: simple, but blocky where the image is enlarged." },
      { term: "Bilinear", text: "Blend the 4 surrounding pixels by distance: smooth edges, slightly blurrier." },
    ],
    formulas: [
      { label: "Forward vs inverse", tex: String.raw`\mathbf{x}'=M\mathbf{x}\qquad\text{vs.}\qquad \mathbf{x}=M^{-1}\mathbf{x}'` },
      {
        label: "Bilinear (book eq. 9.1)",
        tex: String.raw`\begin{aligned}I(x,y)\approx\ &(1-d_x)(1-d_y)\,I_{00}\\ +\ &d_x\,(1-d_y)\,I_{10}\\ +\ &(1-d_x)\,d_y\,I_{01}\\ +\ &d_x\,d_y\,I_{11}\end{aligned}`,
        note: "dx = x − x₀, dy = y − y₀: offsets from the pixel just up and left",
      },
      {
        label: "Two 1-D blends",
        tex: String.raw`\begin{aligned}\operatorname{lerp}(a,b,t)&=(1-t)\,a+t\,b\\ \text{top}&=\operatorname{lerp}(I_{00},I_{10},d_x)\\ \text{bottom}&=\operatorname{lerp}(I_{01},I_{11},d_x)\\ I&=\operatorname{lerp}(\text{top},\text{bottom},d_y)\end{aligned}`,
      },
    ],
    tryThis: [
      "Pick forward and play: holes appear where no source pixel lands (the book fills only 39%).",
      "Switch to inverse · nearest, then inverse · bilinear: blocky steps turn into smooth edges.",
      "Pick scale 0.5 with forward (book exercise 1): shrinking leaves no holes.",
    ],
  },
  params: [
    { key: "method", label: "Method", options: ["forward", "inverse · nearest", "inverse · bilinear"], default: "inverse · bilinear" },
    { key: "warp", label: "Transform", options: Object.keys(WARPS), default: "rotate 25° + scale 1.6" },
  ],
  pseudocode: [
    "def forward(I, M):          # push source pixels",
    "    for p in pixels(I): O[round(M @ p)] = I[p]",
    "def inverse(I, M):          # pull output pixels",
    "    for q in pixels(O):",
    "        x, y = inv(M) @ q           # fractional",
    "        O[q] = I[round(y), round(x)]   # nearest",
    "        O[q] = bilinear(I, x, y)    # blend 4 pixels",
  ],

  panelTitles: ({ method }) => ["I (source)", method === "forward" ? "O = pushed forward" : "O = pulled back"],

  // A bright triangle and a mid-gray rectangle on a dark background, like the book's test image.
  sampleInput() {
    const n = 24, I = grid(n, n, 0.12);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const t = (y - 6) / 9; // triangle: apex at (9, 6), base on row 15 from x = 5 to 13
        if (t >= 0 && t <= 1 && Math.abs(x - 9) <= 4 * t + 0.01) I.data[y * n + x] = 0.92;
        if (x >= 13 && x <= 18 && y >= 9 && y <= 16) I.data[y * n + x] = 0.55;
      }
    return I;
  },

  run(I, p) {
    let last: Step | undefined;
    for (const s of warping.steps(I, p)) last = s;
    return last!.grids[1];
  },

  *steps(I, { method, warp }): Generator<Step, void> {
    const M = WARPS[warp as string], O = grid(I.h, I.w, NaN), n = I.h * I.w;
    const snap = () => ({ ...O, data: O.data.slice() });

    if (method === "forward") {
      let landed = 0;
      for (let y = 0; y < I.h; y++)
        for (let x = 0; x < I.w; x++) {
          const [fx, fy] = forward(I, M, x, y), [rx, ry] = [Math.round(fx), Math.round(fy)];
          const inside = rx >= 0 && rx < O.w && ry >= 0 && ry < O.h;
          if (inside) { if (Number.isNaN(O.data[ry * O.w + rx])) landed++; O.data[ry * O.w + rx] = I.data[y * I.w + x]; }
          yield {
            grids: [I, snap()], src: 0, dst: 1, line: 1, read: [[y, x]], write: inside ? [[ry, rx]] : [],
            shapes: [{ kind: "point", x: fx, y: fy }],
            vars: { p: `(${x}, ${y})`, "M·p": `(${f(fx)}, ${f(fy)})`, "writes to": inside ? `(${rx}, ${ry})` : "outside the image" },
          };
        }
      yield {
        grids: [I, O], src: 0, dst: 1, read: [], write: [], line: 0,
        vars: { "pixels filled": `${landed} of ${n} (${Math.round((100 * landed) / n)}%)`,
                "never written": `${n - landed}: the holes (inverse mapping has none)` },
      };
      return;
    }

    const bil = method === "inverse · bilinear";
    for (let y = 0; y < O.h; y++)
      for (let x = 0; x < O.w; x++) {
        const [sx, sy] = inverse(I, M, x, y);
        const b = bilinear(I, sx, sy), value = bil ? b.value : nearest(I, sx, sy);
        O.data[y * O.w + x] = value;
        const [rx, ry] = [Math.round(sx), Math.round(sy)];
        yield {
          grids: [I, snap()], src: 0, dst: 1, line: bil ? 6 : 5, write: [[y, x]],
          read: bil ? [[b.y0, b.x0], [b.y0, b.x0 + 1], [b.y0 + 1, b.x0], [b.y0 + 1, b.x0 + 1]] : [[ry, rx]],
          shapes: [{ kind: "point", x: sx, y: sy, panel: 0 }],
          vars: bil
            ? { q: `(${x}, ${y})`, "M⁻¹·q": `(${f(sx)}, ${f(sy)})`, "dx, dy": `${f(b.dx)}, ${f(b.dy)}`,
                "I₀₀ I₁₀ I₀₁ I₁₁": b.v.map(lvl).join("  "), weights: b.w.map(f).join("  "), "O[q]": lvl(value) }
            : { q: `(${x}, ${y})`, "M⁻¹·q": `(${f(sx)}, ${f(sy)})`, "rounds to": `(${rx}, ${ry})`, "O[q]": lvl(value) },
        };
      }
    yield { grids: [I, O], src: 0, dst: 1, read: [], write: [], line: 2,
            vars: { "pixels filled": `${n} of ${n}: every output pixel was asked, so no holes` } };
  },
};
