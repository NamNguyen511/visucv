// Pinhole projection: a 3-D point (X, Y, Z) lands on the image at x = f·X/Z + cx, y = f·Y/Z + cy.
// The image plane is drawn in front of the pinhole (the virtual plane), so the picture is upright.
// Units: one world unit = one sensor pixel at depth f. y points down, as on the image.
import { type Algorithm, type Cell, type Grid, type Params, type Shape, type Step, grid } from "./types";

export type P3 = [X: number, Y: number, Z: number];

const S = 21, C = (S - 1) / 2; // sensor: S×S pixels, principal point (cx, cy) = (C, C)
const SIDE_W = 41, PIN = 1; // side view: Z runs along the columns, pinhole at column PIN

export function scene(name: string): P3[] {
  const P: P3[] = [];
  if (name === "posts") // two equal posts, the second twice as far
    for (const [X, Z] of [[-3, 10], [3, 20]]) for (let Y = -4; Y <= 4; Y++) P.push([X, Y, Z]);
  else if (name === "cube") { // edges of a 6-unit cube centred on the axis at depth 15
    const e = [-3, -1, 1, 3], c = [-3, 3];
    for (const a of e) for (const b of c) for (const d of c) P.push([a, b, 15 + d], [b, a, 15 + d], [b, d, 15 + a]);
  } else // rails: two parallel lines on the ground running away from the camera
    for (let Z = 3; Z <= 39; Z += 2) P.push([-3, 4, Z], [3, 4, Z]);
  return P.filter((p, i) => P.findIndex(q => q.every((v, k) => v === p[k])) === i);
}

/** Image coordinates; weak perspective divides every point by the scene's mean depth instead of its own Z. */
export function project([X, Y, Z]: P3, f: number, zbar?: number): [x: number, y: number] {
  const z = zbar ?? Z;
  return [(f * X) / z + C, (f * Y) / z + C];
}

const meanZ = (P: P3[]) => P.reduce((s, p) => s + p[2], 0) / P.length;
const opts = (p: Params) => ({ f: Number(p.f), weak: p.model === "weak perspective", P: scene(String(p.scene)) });
const onSensor = (x: number, y: number) => Math.round(x) >= 0 && Math.round(x) < S && Math.round(y) >= 0 && Math.round(y) < S;

function image(P: P3[], f: number, zbar: number | undefined, upto = Infinity): Grid {
  const g = grid(S, S);
  P.forEach((q, i) => {
    const [x, y] = project(q, f, zbar);
    if (i <= upto && onSensor(x, y)) g.data[Math.round(y) * S + Math.round(x)] = 1;
  });
  return g;
}

/** Side view (looking along −X): the object's points by (Z, Y). */
function side(P: P3[]): Grid {
  const g = grid(S, SIDE_W);
  for (const [, Y, Z] of P) if (PIN + Z < SIDE_W) g.data[(Y + C) * SIDE_W + PIN + Z] = 0.6;
  return g;
}

// Side-view pixel coordinates of world (Z, Y).
const sv = (Z: number, Y: number) => ({ x: PIN + Z, y: Y + C });

function camera(f: number): Shape[] {
  const pin = sv(0, 0), top = sv(f, -C), bottom = sv(f, C), far = sv(SIDE_W - 1 - PIN, 0);
  return [
    { kind: "line", x1: pin.x, y1: pin.y, x2: far.x, y2: far.y, panel: 0 }, // optical axis
    { kind: "line", x1: top.x, y1: top.y, x2: bottom.x, y2: bottom.y, panel: 0 }, // image plane at Z = f
    { kind: "point", x: pin.x, y: pin.y, panel: 0 },
  ];
}

const r2 = (v: number) => v.toFixed(2);
const n = (v: number) => (Number.isInteger(v) ? String(v) : r2(v)).replace("-", "−");
const term = (f: number, a: number, z: number) => `${f}·${a < 0 ? `(${n(a)})` : n(a)}/${n(z)}`;

export const pinhole: Algorithm = {
  meta: {
    id: "pinhole",
    title: "Pinhole Camera & Image Formation",
    topic: "3-D vision",
    ref: "Birchfield, Ch. 16",
    lead: "Every scene point sends one ray through the pinhole; where it crosses the image plane, x = f·X/Z, is its pixel.",
    hook: "How 3-D points become pixels.",
  },
  explain: {
    ideas: [
      { term: "Similar triangles", text: "The ray through the pinhole makes x/f = X/Z, so image size shrinks in proportion to depth." },
      { term: "Depth is lost", text: "Every point on one ray lands on the same pixel: one image cannot tell near-and-small from far-and-big." },
      { term: "Vanishing points", text: "Parallel 3-D lines meet in the image; lines along the optical axis meet at the principal point." },
      { term: "Weak perspective", text: "Divide everything by one mean depth: fine for shallow, distant objects, wrong when depth varies a lot." },
    ],
    formulas: [
      { label: "Perspective projection", tex: String.raw`x=f\,\frac{X}{Z}+c_x,\qquad y=f\,\frac{Y}{Z}+c_y` },
      { label: "In homogeneous coordinates", tex: String.raw`\begin{gathered}\lambda\begin{bmatrix}x\\y\\1\end{bmatrix}=\begin{bmatrix}f&0&c_x\\0&f&c_y\\0&0&1\end{bmatrix}\begin{bmatrix}X\\Y\\Z\end{bmatrix}\\ \lambda=Z\end{gathered}` },
    ],
    tryThis: [
      "Pick Scene posts: the two posts are the same height, but the one twice as far looks half as tall.",
      "Pick Scene rails and step along: the rails close in toward the centre pixel, their vanishing point.",
      "Pick Model weak perspective on the rails: each rail collapses to one pixel, since depth no longer moves it.",
    ],
  },
  params: [
    { key: "scene", label: "Scene", options: ["rails", "posts", "cube"], default: "rails", input: true },
    { key: "f", label: "Focal length f", options: [4, 6, 8], default: 6 },
    { key: "model", label: "Model", options: ["perspective", "weak perspective"], default: "perspective" },
  ],
  pseudocode: [
    "def project(points, f, cx, cy):",
    "    for (X, Y, Z) in points:",
    "        x = f * X / Z + cx   # weak: Z → Z̄",
    "        y = f * Y / Z + cy",
    "        if on_sensor(x, y):",
    "            image[round(y), round(x)] = 1",
    "    return image",
  ],

  panelTitles: () => ["side view  (Z →, Y ↓)", "image  (x →, y ↓)"],

  sampleInput: p => side(scene(String(p.scene))),

  run(_, p) {
    const { f, weak, P } = opts(p);
    return image(P, f, weak ? meanZ(P) : undefined);
  },

  *steps(sideView, p): Generator<Step, void> {
    const { f, weak, P } = opts(p), zbar = weak ? meanZ(P) : undefined, cam = camera(f);
    let hits = 0;
    yield {
      grids: [sideView, image(P, f, zbar, -1)], src: 0, dst: 1, read: [], write: [], line: 1, shapes: cam,
      vars: { points: P.length, f, "(cx, cy)": `(${C}, ${C})`, ...(weak ? { "Z̄ (mean depth)": r2(zbar!) } : {}) },
    };
    for (const [i, q] of P.entries()) {
      const [X, Y, Z] = q, [x, y] = project(q, f, zbar), on = onSensor(x, y), pt = sv(Z, Y);
      // The ray from the point through the pinhole crosses the image plane at height f·Y/Z.
      // Weak perspective has no single centre, so its "ray" just joins the point to where it lands.
      // A point nearer than f sits between the pinhole and the plane, so its ray runs on out to the plane.
      const cross = sv(f, (f * Y) / (zbar ?? Z)), end = weak ? cross : sv(0, 0), start = !weak && Z < f ? cross : pt;
      const ray: Shape = { kind: "line", x1: start.x, y1: start.y, x2: end.x, y2: end.y, thick: true, panel: 0 };
      const read: Cell[] = PIN + Z < SIDE_W ? [[Y + C, PIN + Z]] : [];
      const z = zbar ?? Z, here: Shape = { kind: "point", x: cross.x, y: cross.y, panel: 0 };
      const vars = { "(X, Y, Z)": `(${n(X)}, ${n(Y)}, ${n(Z)})`, x: `${term(f, X, z)} + ${C} = ${n(x)}`, y: `${term(f, Y, z)} + ${C} = ${n(y)}` };
      yield {
        grids: [sideView, image(P, f, zbar, i - 1)], src: 0, dst: 1, read, write: [], line: 2,
        shapes: [...cam, ray, here, ...(on ? [{ kind: "point", x, y, panel: 1 } as Shape] : [])], vars,
      };
      if (on) hits++;
      yield {
        grids: [sideView, image(P, f, zbar, i)], src: 0, dst: 1, read, write: on ? [[Math.round(y), Math.round(x)]] : [], line: on ? 5 : 4,
        shapes: [...cam, ray, here], vars: { ...vars, pixel: on ? `(${Math.round(x)}, ${Math.round(y)})` : "off the sensor" },
      };
    }
    yield {
      grids: [sideView, image(P, f, zbar)], src: 1, dst: 1, read: [], write: [], line: 6, shapes: cam,
      vars: { points: P.length, "on the sensor": hits },
    };
  },
};
