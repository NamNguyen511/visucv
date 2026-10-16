import { describe, expect, it } from "vitest";
import { direction, edges as ed, gradient, hysteresis, nmsAt, operatorNames } from "./edges";
import { gaussian } from "./gaussian";
import { type Grid, grid } from "./types";

const fromFn = (h: number, w: number, fn: (x: number, y: number) => number): Grid => {
  const g = grid(h, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g.data[y * w + x] = fn(x, y);
  return g;
};
const std = (a: number[]) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

describe("edge detection", () => {
  it("a vertical step edge: Ix carries it, Iy ≈ 0, θ ≈ 0°, same height for every operator", () => {
    const step = fromFn(9, 10, x => (x >= 5 ? 1 : 0)), k = 4 * 10 + 5;
    for (const op of operatorNames) {
      const g = gradient(step, op);
      expect(g.ix[k], op).toBeCloseTo(op === "central difference" ? 1 : 1, 9); // gain-normalized: step height 1
      expect(g.iy[k]).toBeCloseTo(0, 9);
      expect(direction(g.theta[k])[2]).toBe("0°");
    }
  });

  it("book §12.2: on pure noise, the plain difference is noisiest; Prewitt < Sobel < Scharr", () => {
    let seed = 9;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const noise = fromFn(40, 40, () => rand());
    const s = Object.fromEntries(operatorNames.map(op => {
      const ix = gradient(noise, op).ix, inner: number[] = [];
      for (let y = 2; y < 38; y++) for (let x = 2; x < 38; x++) inner.push(ix[y * 40 + x]);
      return [op, std(inner)];
    }));
    expect(s.Prewitt).toBeLessThan(s.Sobel);
    expect(s.Sobel).toBeLessThan(s.Scharr);
    expect(s.Scharr).toBeLessThan(s["central difference"]);
  });

  it("non-max suppression thins a blurred step edge to exactly one pixel per row", () => {
    const B = gaussian.run(fromFn(12, 16, x => (x >= 8 ? 1 : 0)), { sigma: 1 }), g = gradient(B, "Sobel");
    for (let y = 1; y < 11; y++) {
      const kept = [...Array(16).keys()].filter(x => g.mag[y * 16 + x] > 1e-6 && nmsAt(16, 12, g.mag, g.theta[y * 16 + x], y * 16 + x).keep);
      expect(kept, `row ${y}`).toHaveLength(1);
    }
  });

  it("hysteresis keeps weak pixels touching strong ones; a 1-pixel gap breaks the link (book exercise 3)", () => {
    // Row: strong, weak, weak, gap, weak, weak.
    const thin = Float64Array.from([0.9, 0.3, 0.3, 0, 0.3, 0.3]);
    expect([...hysteresis(6, 1, thin, 0.2, 0.5)]).toEqual([1, 2, 2, 0, 0, 0]);
  });

  it("on the sample: the bar's faint end is linked through its edge; the isolated faint disk is dropped", () => {
    const I = ed.sampleInput({ noise: 0.02 }), E = ed.run(I, { operator: "Sobel", thresholds: "0.15 / 0.40", noise: 0.02 });
    const region = (x0: number, x1: number, y0: number, y1: number) => {
      const v: number[] = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) v.push(E.data[y * I.w + x]);
      return v;
    };
    expect(region(2, 10, 3, 16).filter(v => v === 1).length).toBeGreaterThan(10); // bright end: strong
    expect(region(20, 26, 3, 16).filter(v => v === 2).length).toBeGreaterThan(4); // faint end: weak, linked
    expect(region(13, 25, 17, 26).filter(v => v > 0)).toHaveLength(0); // faint disk: weak and alone
  });

  it("every edge pixel survived non-max suppression; steps end with the same image as run()", () => {
    const p = { operator: "Sobel", thresholds: "0.15 / 0.25", noise: 0.05 };
    const I = ed.sampleInput(p), all = [...ed.steps(I, p)];
    const thinned = all.at(-1)!.grids[3].data, E = all.at(-1)!.grids[4].data;
    E.forEach((v, k) => { if (v > 0) expect(thinned[k]).toBeGreaterThan(0); });
    expect(E).toEqual(ed.run(I, p).data);
    expect(all.at(-1)!.grids[4].labels).toBe(true);
  });
});
