import { describe, expect, it } from "vitest";
import { gaussian as gs, gaussianKernel } from "./gaussian";
import { grid } from "./types";

describe("gaussian", () => {
  it("kernel sums to 1, is symmetric, and has radius ⌈3σ⌉", () => {
    for (const s of [0.5, 1, 2, 3]) {
      const g = gaussianKernel(s);
      expect(g.reduce((a, b) => a + b)).toBeCloseTo(1, 10);
      expect(g).toEqual([...g].reverse());
      expect(g.length).toBe(2 * Math.ceil(3 * s) + 1);
    }
  });

  it("a constant image stays constant (edges repeat)", () => {
    const I = grid(9, 7, 0.4);
    for (const v of gs.run(I, { sigma: 2 }).data) expect(v).toBeCloseTo(0.4, 6);
  });

  it("separable result equals a direct 2-D Gaussian convolution", () => {
    const I = gs.sampleInput({ image: "noisy hills" }), sigma = 1;
    const g = gaussianKernel(sigma), r = (g.length - 1) / 2;
    const c = (v: number, n: number) => Math.min(n - 1, Math.max(0, v));
    const O = gs.run(I, { sigma });
    for (let y = 0; y < I.h; y++)
      for (let x = 0; x < I.w; x++) {
        let s = 0;
        for (let i = -r; i <= r; i++)
          for (let j = -r; j <= r; j++) s += g[i + r] * g[j + r] * I.data[c(y + i, I.h) * I.w + c(x + j, I.w)];
        expect(O.data[y * I.w + x]).toBeCloseTo(s, 5);
      }
  });

  it("a single spike away from the border comes out as the 2-D kernel", () => {
    const I = gs.sampleInput({ image: "single spike" }), g = gaussianKernel(1);
    const O = gs.run(I, { sigma: 1 });
    expect(O.data[16 * 32 + 16]).toBeCloseTo(g[3] * g[3], 6);
    expect(O.data[17 * 32 + 15]).toBeCloseTo(g[4] * g[2], 6);
  });

  it("steps(): kernel step, one per row, one per column, return; last equals run()", () => {
    const I = gs.sampleInput({ image: "noisy hills" });
    const all = [...gs.steps(I, { sigma: 1 })];
    expect(all).toHaveLength(1 + I.h + I.w + 1);
    expect(all.at(-1)!.grids[2].data).toEqual(gs.run(I, { sigma: 1 }).data);
    expect(all.at(-1)!.surface!.data).toEqual(gs.run(I, { sigma: 1 }).data);
  });
});
