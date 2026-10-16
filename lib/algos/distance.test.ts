import { describe, expect, it } from "vitest";
import { chamfer, distance as dt, exactEuclidean, scaleMax, show } from "./distance";
import { type Grid, grid } from "./types";

// Brute force: distance from each foreground pixel to its nearest background pixel under a metric.
function brute(A: Grid, metric: (dy: number, dx: number) => number): number[] {
  const bg: [number, number][] = [];
  A.data.forEach((v, k) => { if (!v) bg.push([Math.floor(k / A.w), k % A.w]); });
  return Array.from(A.data, (v, k) => {
    if (!v) return 0;
    const y = Math.floor(k / A.w), x = k % A.w;
    return Math.min(...bg.map(([by, bx]) => metric(Math.abs(y - by), Math.abs(x - bx))));
  });
}
const images = () => [dt.sampleInput({ image: "shapes" }), dt.sampleInput({ image: "single seed" })];

describe("distance transform", () => {
  it("city-block two-pass result is exact (D4 = |dx| + |dy|)", () => {
    for (const A of images()) expect([...chamfer(A, "city-block")]).toEqual(brute(A, (dy, dx) => dy + dx));
  });

  it("chessboard two-pass result is exact (D8 = max(|dx|, |dy|))", () => {
    for (const A of images()) expect([...chamfer(A, "chessboard")]).toEqual(brute(A, (dy, dx) => Math.max(dy, dx)));
  });

  it("3-4 chamfer stays within its known ~8% of exact Euclidean", () => {
    for (const A of images()) {
      const c = chamfer(A, "chamfer 3-4"), e = exactEuclidean(A);
      e.forEach((d, k) => expect(Math.abs(c[k] - d), `pixel ${k}`).toBeLessThanOrEqual(0.085 * d + 1e-9));
    }
  });

  it("metrics agree along the axes from a single seed, and differ on the diagonal (book Fig. 7.1)", () => {
    const A = dt.sampleInput({ image: "single seed" }), at = (y: number, x: number) => y * A.w + x;
    const d4 = chamfer(A, "city-block"), d8 = chamfer(A, "chessboard"), c = chamfer(A, "chamfer 3-4");
    expect([d4[at(10, 17)], d8[at(10, 17)], c[at(10, 17)]]).toEqual([5, 5, 5]); // 5 right of the seed
    expect([d4[at(14, 16)], d8[at(14, 16)]]).toEqual([8, 4]); // 4 down, 4 right
    expect(c[at(14, 16)]).toBeCloseTo(16 / 3, 9); // 4 diagonal steps × 4 / 3 ≈ 5.33 (true: 5.66)
  });

  it("pass 1 alone never under-estimates, and pass 2 only lowers distances", () => {
    const A = dt.sampleInput({ image: "shapes" }), p = { metric: "chamfer 3-4", image: "shapes", shading: "smooth" };
    const all = [...dt.steps(A, p)];
    const endOfPass1 = all.filter(s => s.line === 3).at(-1)!.grids[1].data, final = all.at(-1)!.grids[2].data;
    final.forEach((v, k) => { if (!Number.isNaN(endOfPass1[k])) expect(endOfPass1[k]).toBeGreaterThanOrEqual(v - 1e-6); });
  });

  it("steps: one per foreground pixel per pass, plus start and end; last panel = show(chamfer())", () => {
    for (const image of ["shapes", "single seed"]) {
      const A = dt.sampleInput({ image }), p = { metric: "chamfer 3-4", image, shading: "bands" };
      const all = [...dt.steps(A, p)], fg = A.data.reduce((s, v) => s + v, 0);
      expect(all).toHaveLength(2 + 2 * fg);
      const c = chamfer(A, "chamfer 3-4");
      expect(all.at(-1)!.grids[2].data).toEqual(show(c, A, scaleMax(c), true).data);
      expect(dt.run(A, p).data).toEqual(all.at(-1)!.grids[2].data);
    }
  });

  it("all-foreground image: distances stay ∞ and nothing crashes", () => {
    const A = grid(4, 4, 1), all = [...dt.steps(A, { metric: "chessboard", image: "custom", shading: "smooth" })];
    expect(String(all.at(-1)!.vars.why)).toMatch(/∞/);
    expect([...all.at(-1)!.grids[2].data].every(Number.isNaN)).toBe(true);
  });
});
