import { describe, expect, it } from "vitest";
import { dist, fitLine, lineThrough, points, ransac, ransacAlgo as ra, sampleImage } from "./ransac";
import { grid } from "./types";

const slope = (L: { dx: number; dy: number }) => L.dy / L.dx;
const best = (image: string, iters: number, seed: number, t = 1) => ransac(points(sampleImage(image)), t, iters, seed).best!;

describe("RANSAC", () => {
  it("distance to the line through two points", () => {
    const L = lineThrough([0, 0], [0, 4]); // the x axis (cells are [y, x])
    expect(dist(L, [3, 2])).toBeCloseTo(3, 12);
    expect(dist(lineThrough([0, 0], [2, 2]), [0, 2])).toBeCloseTo(Math.SQRT2, 12);
  });

  it("finds the planted line (slope 0.45) where a fit through all points does not", () => {
    for (const image of ["line + outliers", "many outliers"]) {
      const P = points(sampleImage(image)), b = best(image, 50, 1), fit = fitLine(b.inliers, 28, 28)!;
      expect(b.inliers.length, image).toBeGreaterThanOrEqual(18);
      expect(slope(fit), image).toBeCloseTo(0.45, 1);
      if (image === "line + outliers") expect(Math.abs(slope(fitLine(P, 28, 28)!) - 0.45)).toBeGreaterThan(0.1); // the try-this default
    }
  });

  it("two lines: keeps the one with more support", () => {
    expect(slope(fitLine(best("two lines", 50, 1).inliers, 28, 28)!)).toBeCloseTo(0.45, 1);
  });

  it("too few tries can miss on many outliers (the try-this), enough tries never do", () => {
    const misses = [1, 2, 3].filter(seed => best("many outliers", 5, seed).inliers.length < 12);
    expect(misses.length).toBeGreaterThan(0);
    for (const seed of [1, 2, 3]) expect(best("many outliers", 50, seed).inliers.length).toBeGreaterThanOrEqual(18);
  });

  it("the best inlier count never drops and both sampled points are distinct inliers", () => {
    const { log } = ransac(points(sampleImage("line + outliers")), 1, 50, 2);
    let top = 0;
    for (const it of log) {
      expect(it.pair[0]).not.toEqual(it.pair[1]);
      expect(it.inliers).toContainEqual(it.pair[0]);
      expect(it.better).toBe(it.inliers.length > top);
      top = Math.max(top, it.inliers.length);
    }
  });

  it("fewer than 2 points: no guesses, no crash", () => {
    for (const n of [0, 1]) {
      const I = grid(28, 28);
      if (n) I.data[100] = 1;
      const p = { image: "line + outliers", iters: 20, t: 1, seed: 1 }, all = [...ra.steps(I, p)];
      expect(all).toHaveLength(2);
      expect(all.at(-1)!.grids[2].data).toEqual(ra.run(I, p).data);
      expect(all.at(-1)!.vars["N for 99%"]).toBe("—"); // w = 0: no number of tries is enough
    }
  });

  it("steps: setup, two per iteration, refit; the last panel equals run()", () => {
    for (const iters of [5, 20, 50]) {
      const p = { image: "many outliers", iters, t: 1, seed: 3 }, I = ra.sampleInput(p), all = [...ra.steps(I, p)];
      expect(all).toHaveLength(2 * iters + 2);
      expect(all.at(-1)!.grids[2].data).toEqual(ra.run(I, p).data);
      expect(all.every(s => s.line < ra.pseudocode.length)).toBe(true);
    }
  });
});
