import { describe, expect, it } from "vitest";
import { K, detect, eig2, harris as hr, sampleImage, score, structureTensor } from "./harris";
import { type Grid, grid } from "./types";

const fromFn = (n: number, fn: (x: number, y: number) => number): Grid => {
  const g = grid(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) g.data[y * n + x] = fn(x, y);
  return g;
};
const corners = (image: string, method: string, r: number) => {
  const I = sampleImage(image), T = structureTensor(I, r);
  return detect(Float64Array.from({ length: I.h * I.w }, (_, k) => score(T, k, method)), I.h, I.w).map(([y, x]) => `${x},${y}`).sort();
};

describe("corner detection", () => {
  it("book §20.1: flat → both λ ≈ 0; edge → one large λ; corner → both large", () => {
    const n = 12, k = 6 * n + 6;
    const at = (I: Grid) => { const T = structureTensor(I, 1); return { ...eig2(T.a[k], T.b[k], T.c[k]), R: score(T, k, "Harris") }; };
    const flat = at(fromFn(n, () => 0.5)), edge = at(fromFn(n, x => (x >= 6 ? 1 : 0))), corner = at(fromFn(n, (x, y) => (x >= 6 && y >= 6 ? 1 : 0)));
    expect(flat.l1).toBeCloseTo(0, 12);
    expect(edge.l1).toBeGreaterThan(1);
    expect(edge.l2).toBeCloseTo(0, 12);
    expect(edge.R).toBeLessThan(0); // Harris: negative at edges
    expect(corner.l2).toBeGreaterThan(0.1);
    expect(corner.R).toBeGreaterThan(0);
  });

  it("det − k·trace² equals λ₁λ₂ − k(λ₁+λ₂)²", () => {
    const T = structureTensor(sampleImage("shapes"), 1);
    for (const k of [3 * 24 + 3, 3 * 24 + 6, 15 * 24 + 16, 10 * 24 + 16]) {
      const { l1, l2 } = eig2(T.a[k], T.b[k], T.c[k]);
      expect(score(T, k, "Harris")).toBeCloseTo(l1 * l2 - K * (l1 + l2) ** 2, 9);
      expect(score(T, k, "Shi-Tomasi")).toBeCloseTo(l2, 9);
    }
  });

  it("finds the square's 4 corners and the diamond's 4 tips, and nothing along the edges", () => {
    expect(corners("shapes", "Harris", 1)).toEqual(["3,3", "10,3", "3,10", "10,10", "16,10", "11,15", "21,15", "16,20"].sort());
    const st = corners("shapes", "Shi-Tomasi", 1); // tips may land one pixel inward
    expect(st).toHaveLength(8);
    for (const c of ["3,3", "10,3", "3,10", "10,10"]) expect(st).toContain(c);
  });

  it("checkerboard: exactly one corner per X junction, centred on it, for both window sizes", () => {
    // Junctions sit between pixels 5|6, 11|12, 17|18; a box window gives a flat plateau around each.
    const want = [5.5, 11.5, 17.5].flatMap(y => [5.5, 11.5, 17.5].map(x => `${x},${y}`)).sort();
    for (const r of [1, 2]) for (const method of ["Harris", "Shi-Tomasi"]) expect(corners("checkerboard", method, r), `${method} r=${r}`).toEqual(want);
  });

  it("steps: setup, one per pixel, detection; the score panel equals run()", () => {
    for (const method of ["Harris", "Shi-Tomasi"]) {
      const p = { image: "shapes", method, window: "3×3" }, I = hr.sampleInput(p), all = [...hr.steps(I, p)];
      expect(all).toHaveLength(I.h * I.w + 2);
      expect(all.at(-1)!.grids[1].data).toEqual(hr.run(I, p).data);
    }
  });
});
