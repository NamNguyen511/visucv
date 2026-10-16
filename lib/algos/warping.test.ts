import { describe, expect, it } from "vitest";
import { inverse } from "./transforms";
import { type Grid, grid } from "./types";
import { WARPS, bilinear, nearest, warping as w } from "./warping";

const I = () => w.sampleInput({});
const lerp = (a: number, b: number, t: number) => (1 - t) * a + t * b;
const filled = (O: Grid) => O.data.filter(v => !Number.isNaN(v)).length / O.data.length;

describe("warping", () => {
  it("bilinear returns the exact pixel at integer coordinates", () => {
    const J = I();
    for (const [x, y] of [[9, 10], [15, 12], [0, 0]]) expect(bilinear(J, x, y).value).toBeCloseTo(J.data[y * J.w + x], 12);
  });

  it("bilinear = two 1-D lerps (along x, then y), and its weights sum to 1", () => {
    const g = grid(2, 2);
    g.data.set([0.1, 0.9, 0.4, 0.2]); // I00 I10 / I01 I11
    for (const [x, y] of [[0.3, 0.6], [0.5, 0.5], [0.9, 0.1]]) {
      const b = bilinear(g, x, y);
      expect(b.value).toBeCloseTo(lerp(lerp(0.1, 0.9, x), lerp(0.4, 0.2, x), y), 6); // grids are Float32
      expect(b.w.reduce((s, v) => s + v)).toBeCloseTo(1, 12);
    }
    expect(bilinear(g, 0.5, 0.5).value).toBeCloseTo((0.1 + 0.9 + 0.4 + 0.2) / 4, 6);
  });

  it("forward mapping with 25° + 1.6× fills about 1/1.6² of the output, like the book's 39%", () => {
    const fill = filled(w.run(I(), { method: "forward", warp: "rotate 25° + scale 1.6" }));
    expect(fill).toBeGreaterThan(0.33);
    expect(fill).toBeLessThan(0.45);
  });

  it("book exercise 1: shrinking by 0.5 leaves no holes inside the shrunken image", () => {
    const J = I(), M = WARPS["scale 0.5"], O = w.run(J, { method: "forward", warp: "scale 0.5" });
    for (let y = 0; y < O.h; y++)
      for (let x = 0; x < O.w; x++) {
        const [sx, sy] = inverse(J, M, x, y);
        if (sx >= 0.5 && sx <= J.w - 1.5 && sy >= 0.5 && sy <= J.h - 1.5) expect(O.data[y * O.w + x], `(${x},${y})`).not.toBeNaN();
      }
  });

  it("inverse mapping fills every output pixel, with either sampler", () => {
    for (const method of ["inverse · nearest", "inverse · bilinear"])
      for (const warp of Object.keys(WARPS)) expect(filled(w.run(I(), { method, warp })), `${method} ${warp}`).toBe(1);
  });

  it("nearest only copies source values; bilinear creates in-between values on edges", () => {
    const J = I(), levels = new Set([...J.data, 0]);
    const p = { warp: "rotate 25° + scale 1.6" };
    expect([...w.run(J, { ...p, method: "inverse · nearest" }).data].every(v => levels.has(v))).toBe(true);
    expect([...w.run(J, { ...p, method: "inverse · bilinear" }).data].some(v => !levels.has(v))).toBe(true);
    expect(nearest(J, 9.4, 10.6)).toBe(J.data[11 * J.w + 9]);
  });

  it("steps: one per pixel plus a summary; last panel equals run()", () => {
    const J = I();
    for (const method of ["forward", "inverse · nearest", "inverse · bilinear"]) {
      const p = { method, warp: "rotate 30°" }, all = [...w.steps(J, p)];
      expect(all).toHaveLength(J.h * J.w + 1);
      expect(all.at(-1)!.grids[1].data).toEqual(w.run(J, p).data);
    }
  });
});
