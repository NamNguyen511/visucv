import { describe, expect, it } from "vitest";
import { moments, momentsAlgo as m } from "./moments";
import { type Grid, grid } from "./types";

const sample = (shape: string, angle = 30) => m.sampleInput({ shape, angle });
const angleDiff = (a: number, b: number) => { // orientation is only defined mod 180°
  const d = (((a - b) % Math.PI) + Math.PI) % Math.PI;
  return Math.min(d, Math.PI - d);
};
const DEG = Math.PI / 180;

describe("moments", () => {
  it("raw moments: m00 is the area, centroid is the mean pixel position", () => {
    const I = grid(4, 5);
    for (const [y, x] of [[1, 1], [1, 2], [2, 3]]) I.data[y * 5 + x] = 1;
    const d = moments(I);
    expect(d.m00).toBe(3);
    expect(d.xbar).toBeCloseTo(2, 12);
    expect(d.ybar).toBeCloseTo(4 / 3, 12);
  });

  it("shift-of-origin identity equals the central-moment definition (book eq. 5.2)", () => {
    for (const shape of ["ellipse", "bar", "L-shape", "circle"]) {
      const I = sample(shape), d = moments(I);
      let mu20 = 0, mu11 = 0, mu02 = 0;
      for (let y = 0; y < I.h; y++)
        for (let x = 0; x < I.w; x++)
          if (I.data[y * I.w + x]) {
            mu20 += (x - d.xbar) ** 2; mu11 += (x - d.xbar) * (y - d.ybar); mu02 += (y - d.ybar) ** 2;
          }
      expect(d.mu20, shape).toBeCloseTo(mu20, 6);
      expect(d.mu11, shape).toBeCloseTo(mu11, 6);
      expect(d.mu02, shape).toBeCloseTo(mu02, 6);
    }
  });

  it("recovers a drawn ellipse's orientation and semi-axes (a = 10, b = 4.5)", () => {
    for (const angle of [0, 30, 60, 120]) {
      const d = moments(sample("ellipse", angle));
      expect(angleDiff(d.theta, angle * DEG), `θ at ${angle}°`).toBeLessThan(2 * DEG);
      expect(d.a).toBeGreaterThan(9.5); expect(d.a).toBeLessThan(10.5);
      expect(d.b).toBeGreaterThan(4); expect(d.b).toBeLessThan(5);
    }
  });

  it("eigenvector of λmax points along θ, and Σv = λv", () => {
    for (const shape of ["ellipse", "bar", "L-shape"]) {
      const d = moments(sample(shape, 60));
      expect(angleDiff(Math.atan2(d.vmax[1], d.vmax[0]), d.theta), shape).toBeLessThan(1e-9);
      const [sxx, sxy, syy] = d.cov, [vx, vy] = d.vmax;
      expect(sxx * vx + sxy * vy).toBeCloseTo(d.lmax * vx, 9);
      expect(sxy * vx + syy * vy).toBeCloseTo(d.lmax * vy, 9);
    }
  });

  it("book exercise: a circle has eccentricity close to 0; a bar is very elongated", () => {
    expect(moments(sample("circle")).ecc).toBeLessThan(0.15);
    expect(moments(sample("bar")).ecc).toBeGreaterThan(0.95);
  });

  it("central moments don't change when the shape moves (translation invariance)", () => {
    const I = sample("L-shape"), J = grid(I.h, I.w);
    for (let y = 0; y < I.h - 2; y++) for (let x = 0; x < I.w - 3; x++) J.data[(y + 2) * I.w + x + 3] = I.data[y * I.w + x];
    const a = moments(I), b = moments(J);
    expect(b.m00).toBe(a.m00); // the L doesn't touch the bottom/right edges, so nothing is cut off
    expect(b.xbar).toBeCloseTo(a.xbar + 3, 9);
    for (const k of ["mu20", "mu11", "mu02"] as const) expect(b[k]).toBeCloseTo(a[k], 6);
  });

  it("steps(): one per foreground pixel plus 8 derivation steps; empty image doesn't crash", () => {
    const I = sample("ellipse");
    const all = [...m.steps(I, {})];
    expect(all).toHaveLength(moments(I).m00 + 8);
    expect(all.at(-1)!.shapes!.some(s => s.kind === "ellipse")).toBe(true);
    const empty = [...m.steps(grid(5, 5), {})];
    expect(empty).toHaveLength(1);
    expect(String(empty[0].vars["m₀₀"])).toMatch(/^0/);
  });
});
