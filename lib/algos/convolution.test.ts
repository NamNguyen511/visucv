import { describe, expect, it } from "vitest";
import { type Border, KERNELS, convolution as cv, filter2d, rotate180, sample } from "./convolution";
import { type Grid, grid } from "./types";

const I = () => cv.sampleInput({});
const borders: Border[] = ["zero", "replicate", "reflect 101"];
const row = (vals: number[]): Grid => ({ ...grid(1, vals.length), data: Float32Array.from(vals) });

describe("convolution vs correlation", () => {
  it("convolving with K equals correlating with K rotated 180°", () => {
    for (const K of Object.values(KERNELS))
      for (const b of borders) expect([...filter2d(I(), K, "convolution", b)]).toEqual([...filter2d(I(), rotate180(K), "correlation", b)]);
  });

  it("symmetric kernels give identical results; asymmetric ones don't", () => {
    for (const name of ["box 3×3", "sharpen"])
      expect([...filter2d(I(), KERNELS[name], "convolution", "replicate")]).toEqual([...filter2d(I(), KERNELS[name], "correlation", "replicate")]);
    expect([...filter2d(I(), KERNELS["Sobel x"], "convolution", "replicate")]).not.toEqual([...filter2d(I(), KERNELS["Sobel x"], "correlation", "replicate")]);
  });

  it("one-hot kernel: convolution shifts the image right, correlation shifts it left", () => {
    const J = I(), K = KERNELS["one-hot (asymmetric)"];
    const c = filter2d(J, K, "convolution", "zero"), r = filter2d(J, K, "correlation", "zero");
    for (let y = 0; y < J.h; y++)
      for (let x = 1; x < J.w - 1; x++) {
        expect(c[y * J.w + x]).toBeCloseTo(J.data[y * J.w + x - 1], 6);
        expect(r[y * J.w + x]).toBeCloseTo(J.data[y * J.w + x + 1], 6);
      }
  });

  it("book exercise 2: Sobel x convolution is the negative of its correlation", () => {
    const c = filter2d(I(), KERNELS["Sobel x"], "convolution", "reflect 101");
    const r = filter2d(I(), KERNELS["Sobel x"], "correlation", "reflect 101");
    c.forEach((v, k) => expect(v).toBeCloseTo(-r[k], 9));
  });

  it("border rules (book §10.3): zero, replicate, and reflect-101 (edge pixel not repeated)", () => {
    const g = row([10, 20, 30, 40]);
    expect([-2, -1, 4, 5].map(x => sample(g, 0, x, "zero"))).toEqual([0, 0, 0, 0]);
    expect([-2, -1, 4, 5].map(x => sample(g, 0, x, "replicate"))).toEqual([10, 10, 40, 40]);
    expect([-2, -1, 4, 5].map(x => sample(g, 0, x, "reflect 101"))).toEqual([30, 20, 30, 20]);
  });

  it("a box blur keeps a constant image constant, except zero padding darkens the border", () => {
    const flat = grid(5, 6, 0.5), K = KERNELS["box 3×3"];
    for (const b of ["replicate", "reflect 101"] as Border[]) filter2d(flat, K, "convolution", b).forEach(v => expect(v).toBeCloseTo(0.5, 9));
    const z = filter2d(flat, K, "convolution", "zero");
    expect(z[0]).toBeCloseTo((0.5 * 4) / 9, 9); // corner: 4 of 9 taps inside
    expect(z[2 * 6 + 2]).toBeCloseTo(0.5, 9);
  });

  it("steps: setup, one per pixel, summary; last panel equals run()", () => {
    const J = I();
    for (const kernel of Object.keys(KERNELS)) {
      const p = { kernel, mode: "convolution", border: "reflect 101" }, all = [...cv.steps(J, p)];
      expect(all).toHaveLength(J.h * J.w + 2);
      expect(all.at(-1)!.grids[1].data).toEqual(cv.run(J, p).data);
    }
  });
});
