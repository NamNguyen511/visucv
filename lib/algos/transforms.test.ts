import { describe, expect, it } from "vitest";
import { type Mat, PRESETS, classify, det, forward, holes, transforms as tf } from "./transforms";
import { grid } from "./types";

const I = () => tf.sampleInput({});
const pts = (A: Mat) => [[3, 4], [10, 7], [15, 2], [6, 18]].map(([x, y]) => forward(I(), A, x, y));
const dist = ([ax, ay]: number[], [bx, by]: number[]) => Math.hypot(ax - bx, ay - by);
const angle = (o: number[], p: number[], q: number[]) =>
  Math.atan2(p[1] - o[1], p[0] - o[0]) - Math.atan2(q[1] - o[1], q[0] - o[0]);
const src = [[3, 4], [10, 7], [15, 2], [6, 18]];

describe("geometric transforms", () => {
  it("identity maps every pixel to itself", () => {
    const J = I();
    expect([...tf.run(J, { transform: "rotate 30°" }).data]).not.toEqual([...J.data]); // sanity: rotation moves it
    for (const [x, y] of src) expect(forward(J, [1, 0, 0, 1], x, y)).toEqual([x, y]);
  });

  it("Euclidean (rotation) preserves lengths", () => {
    const p = pts(PRESETS["rotate 30°"]);
    expect(dist(p[0], p[1])).toBeCloseTo(dist(src[0], src[1]), 9);
    expect(dist(p[2], p[3])).toBeCloseTo(dist(src[2], src[3]), 9);
  });

  it("similarity preserves angles and length ratios, but not lengths", () => {
    const p = pts(PRESETS["rotate 30° + scale 1.3"]);
    expect(angle(p[0], p[1], p[2])).toBeCloseTo(angle(src[0], src[1], src[2]), 9);
    expect(dist(p[0], p[1]) / dist(p[2], p[3])).toBeCloseTo(dist(src[0], src[1]) / dist(src[2], src[3]), 9);
    expect(dist(p[0], p[1])).toBeCloseTo(1.3 * dist(src[0], src[1]), 9);
  });

  it("affine (shear) keeps parallel lines parallel but changes angles", () => {
    const A = PRESETS.shear, J = I();
    // Two parallel segments: (0,0)→(0,5) and (7,0)→(7,5).
    const [a0, a1, b0, b1] = [[0, 0], [0, 5], [7, 0], [7, 5]].map(([x, y]) => forward(J, A, x, y));
    const cross = (a1[0] - a0[0]) * (b1[1] - b0[1]) - (a1[1] - a0[1]) * (b1[0] - b0[0]);
    expect(cross).toBeCloseTo(0, 9);
    const right = angle(forward(J, A, 0, 0), forward(J, A, 5, 0), forward(J, A, 0, 5));
    expect(Math.abs(Math.abs(right) - Math.PI / 2)).toBeGreaterThan(0.1); // the square's corner is no longer 90°
  });

  it("classifies the book's hierarchy, and a flip has det −1 (book exercise 1)", () => {
    expect(classify(PRESETS["rotate 30°"]).kind).toBe("Euclidean");
    expect(classify(PRESETS["rotate 30° + scale 1.3"]).kind).toBe("similarity");
    expect(classify(PRESETS.shear).kind).toBe("affine");
    expect(classify(PRESETS["stretch 1.5 × 0.7"]).kind).toBe("affine");
    expect(det(PRESETS["flip horizontal"])).toBe(-1);
    expect(classify(PRESETS["flip horizontal"]).kind).toBe("affine");
    expect(classify([1, 0, 0, 1]).kind).toBe("Euclidean"); // book exercise 2: s = 1 similarity is Euclidean
  });

  it("flipping twice is the identity; the flipped F is the mirror image", () => {
    const J = I(), A = PRESETS["flip horizontal"];
    for (const [x, y] of src) {
      const [fx, fy] = forward(J, A, x, y);
      expect(forward(J, A, fx, fy)).toEqual([x, y]);
      expect([fx, fy]).toEqual([J.w - 1 - x, y]);
    }
  });

  it("forward mapping leaves holes when scaling up, none for a flip", () => {
    const J = I();
    const up = tf.run(J, { transform: "rotate 30° + scale 1.3" }), flip = tf.run(J, { transform: "flip horizontal" });
    expect(holes(J, PRESETS["rotate 30° + scale 1.3"], up)).toBeGreaterThan(0);
    expect(holes(J, PRESETS["flip horizontal"], flip)).toBe(0);
    expect(flip.data.reduce((a, b) => a + b, 0)).toBe(J.data.reduce((a, b) => a + b, 0));
  });

  it("steps: start, one per foreground pixel, and a summary; last panel equals run()", () => {
    const J = I(), fg = J.data.reduce((a, b) => a + b, 0);
    for (const transform of Object.keys(PRESETS)) {
      const all = [...tf.steps(J, { transform })];
      expect(all).toHaveLength(fg + 2);
      expect(all.at(-1)!.grids[1].data).toEqual(tf.run(J, { transform }).data);
    }
    expect([...tf.steps(grid(4, 4), { transform: "shear" })]).toHaveLength(2); // empty image
  });
});
