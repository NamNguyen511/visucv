import { describe, expect, it } from "vitest";
import { applyMask, dft2, fourier as ft, freq, frequencyFilter, idft2, sampleImage } from "./fourier";
import { type Grid, grid } from "./types";

let seed = 3;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const random = (n: number): Grid => { const g = grid(n, n); g.data.forEach((_, k) => (g.data[k] = rand())); return g; };
const mag = (S: { re: Float64Array; im: Float64Array }, k: number) => Math.hypot(S.re[k], S.im[k]);
const P = { image: "shapes", filter: "ideal low-pass", cutoff: 5 };

describe("Fourier transform", () => {
  it("separable row/column DFT equals the brute-force double sum", () => {
    const I = random(6), n = 6, S = dft2(I);
    for (let v = 0; v < n; v++)
      for (let u = 0; u < n; u++) {
        let re = 0, im = 0;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          const a = (-2 * Math.PI * (u * x + v * y)) / n;
          re += I.data[y * n + x] * Math.cos(a); im += I.data[y * n + x] * Math.sin(a);
        }
        expect(S.re[v * n + u]).toBeCloseTo(re, 9);
        expect(S.im[v * n + u]).toBeCloseTo(im, 9);
      }
  });

  it("inverse DFT gives the image back; F(0,0) is the sum of all pixels", () => {
    const I = random(8), S = dft2(I), back = idft2(S);
    back.data.forEach((v, k) => expect(v).toBeCloseTo(I.data[k], 5));
    expect(S.re[0]).toBeCloseTo(I.data.reduce((a, b) => a + b, 0), 6);
  });

  it("book §15.2: a grating's spectrum peaks at its frequency, as a mirrored pair", () => {
    const peaks = (image: string) => {
      const S = dft2(sampleImage(image)), n = 32, m = Math.max(...[...S.re.keys()].slice(1).map(k => mag(S, k)));
      return [...S.re.keys()].slice(1).filter(k => mag(S, k) > m * 0.99).map(k => [freq(k % n, n), freq(Math.floor(k / n), n)]);
    };
    expect(peaks("grating")).toEqual(expect.arrayContaining([[4, 0], [-4, 0]]));
    expect(peaks("grating")).toHaveLength(2);
    expect(peaks("diagonal grating")).toEqual(expect.arrayContaining([[3, 3], [-3, -3]])); // book exercise 1
  });

  it("real images have a symmetric magnitude: |F(−f)| = |F(f)|", () => {
    const S = dft2(sampleImage("square")), n = 32;
    for (let v = 0; v < n; v++) for (let u = 0; u < n; u++)
      expect(mag(S, v * n + u)).toBeCloseTo(mag(S, ((n - v) % n) * n + ((n - u) % n)), 6);
  });

  it("book eq. 15.1: multiplying spectra = circular convolution in space", () => {
    const n = 8, I = random(n), K = grid(n, n);
    const taps: [number, number, number][] = [[0, 0, 0.5], [0, 1, 0.2], [1, 0, 0.2], [n - 1, n - 1, 0.1]]; // (dy, dx, w), wrapping
    for (const [dy, dx, w] of taps) K.data[dy * n + dx] = w;
    const A = dft2(I), B = dft2(K);
    const prod = { n, re: A.re.map((r, k) => r * B.re[k] - A.im[k] * B.im[k]), im: A.re.map((r, k) => r * B.im[k] + A.im[k] * B.re[k]) };
    const viaFFT = idft2(prod);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const want = taps.reduce((s, [dy, dx, w]) => s + w * I.data[((y - dy + n) % n) * n + ((x - dx + n) % n)], 0);
      expect(viaFFT.data[y * n + x]).toBeCloseTo(want, 5);
    }
  });

  it("ideal low-pass + ideal high-pass with the same cutoff add up to the original", () => {
    const I = sampleImage("shapes"), lo = frequencyFilter(I, P), hi = frequencyFilter(I, { ...P, filter: "ideal high-pass" });
    lo.data.forEach((v, k) => expect(v + hi.data[k]).toBeCloseTo(I.data[k], 5));
  });

  it("book §15.3: the ideal mask rings past the input's range; the Gaussian mask doesn't", () => {
    const I = sampleImage("shapes"), range = (g: Grid) => [Math.min(...g.data), Math.max(...g.data)];
    const [lo, hi] = range(frequencyFilter(I, P));
    expect(lo < 0.15 - 0.03 || hi > 0.85 + 0.03).toBe(true);
    const [glo, ghi] = range(frequencyFilter(I, { ...P, filter: "Gaussian low-pass" }));
    expect(glo).toBeGreaterThan(0.15 - 0.01);
    expect(ghi).toBeLessThan(0.85 + 0.01);
  });

  it("including every ring reproduces the full mask", () => {
    const F = dft2(sampleImage("square")), a = applyMask(F, P, 100), b = applyMask(F, P);
    expect([...a.re]).toEqual([...b.re]);
  });

  it("steps: last output panel equals run() for every filter", () => {
    for (const filter of ["ideal low-pass", "Gaussian low-pass", "ideal high-pass"]) {
      const p = { ...P, filter }, I = ft.sampleInput(p), all = [...ft.steps(I, p)];
      expect(all.at(-1)!.grids[2].data).toEqual(ft.run(I, p).data);
      expect(all.length).toBeGreaterThan(2 * 32);
    }
  });
});
