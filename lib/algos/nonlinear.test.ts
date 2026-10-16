import { describe, expect, it } from "vitest";
import { gaussian } from "./gaussian";
import { morphology } from "./morphology";
import { cleanImage, mae, nonlinear as nl, nonlinearFilter } from "./nonlinear";
import { type Grid, grid } from "./types";

const P = { filter: "median", image: "salt & pepper", window: "3×3", sigmaR: 50 };
const fromRows = (r: number[][]): Grid => ({ ...grid(r.length, r[0].length), data: Float32Array.from(r.flat()) });

describe("nonlinear filters", () => {
  it("median: a single outlier in a flat patch disappears completely", () => {
    const I = fromRows([[0.2, 0.2, 0.2], [0.2, 1, 0.2], [0.2, 0.2, 0.2]]);
    expect(nonlinearFilter(I, P).data[4]).toBeCloseTo(0.2, 6);
  });

  it("book §14.1: on salt & pepper, the median's error is far below the Gaussian's", () => {
    const I = nl.sampleInput(P), C = cleanImage("salt & pepper");
    const med = mae(nonlinearFilter(I, P), C), gau = mae(gaussian.run(I, { sigma: 1 }), C);
    expect(med).toBeLessThan(gau / 3);
  });

  it("book §14.2: on a binary image, the 3×3 min filter equals erosion with a 3×3 square (interior)", () => {
    const A = grid(12, 12);
    A.data.forEach((_, k) => { const y = Math.floor(k / 12), x = k % 12; A.data[k] = (y > 2 && y < 9 && x > 1 && x < 10) || (y === 10 && x === 5) ? 1 : 0; });
    const mn = nonlinearFilter(A, { ...P, filter: "min (erosion)" });
    const er = morphology.run(A, { op: "erode", size: 3, shape: "square" });
    for (let y = 1; y < 11; y++) for (let x = 1; x < 11; x++) expect(mn.data[y * 12 + x], `(${x},${y})`).toBe(er.data[y * 12 + x]);
  });

  it("max is min of the inverted image, inverted back (dilation/erosion duality)", () => {
    const I = nl.sampleInput({ ...P, image: "noisy step edge" }), inv = { ...I, data: I.data.map(v => 1 - v) };
    const mx = nonlinearFilter(I, { ...P, filter: "max (dilation)", window: "5×5" });
    const mn = nonlinearFilter(inv, { ...P, filter: "min (erosion)", window: "5×5" });
    mx.data.forEach((v, k) => expect(v).toBeCloseTo(1 - mn.data[k], 6));
  });

  it("book exercise 2: with σ_r = ∞ the bilateral filter is a plain spatial Gaussian over the window", () => {
    const I = nl.sampleInput({ ...P, image: "noisy step edge" }), B = nonlinearFilter(I, { ...P, filter: "bilateral", sigmaR: "∞" });
    const g = [-1, 0, 1].map(k => Math.exp(-k * k / 2)), s = g.reduce((a, b) => a + b, 0) ** 2;
    const y = 10, x = 12;
    let want = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) want += (g[i + 1] * g[j + 1] / s) * I.data[(y + i) * I.w + x + j];
    expect(B.data[y * I.w + x]).toBeCloseTo(want, 6);
  });

  it("book §14.3: on the noisy step, the bilateral filter keeps the edge sharper than the Gaussian", () => {
    const p = { ...P, image: "noisy step edge", filter: "bilateral", window: "5×5" };
    const I = nl.sampleInput(p), B = nonlinearFilter(I, p), G = gaussian.run(I, { sigma: 1.5 });
    const jump = (O: Grid) => { let s = 0; for (let y = 0; y < O.h; y++) s += O.data[y * O.w + 12] - O.data[y * O.w + 11]; return s / O.h; };
    expect(jump(B)).toBeGreaterThan(0.4); // true step is 0.5
    expect(jump(G)).toBeLessThan(0.25);
  });

  it("steps: setup, one per pixel, summary; the output panel equals run()", () => {
    for (const filter of ["median", "min (erosion)", "max (dilation)", "bilateral"]) {
      const p = { ...P, filter }, I = nl.sampleInput(p), all = [...nl.steps(I, p)];
      expect(all).toHaveLength(I.h * I.w + 2);
      expect(all.at(-1)!.grids[1].data).toEqual(nl.run(I, p).data);
    }
  });
});
