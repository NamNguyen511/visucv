import { describe, expect, it } from "vitest";
import { SETUPS, geometry } from "./epipolar";
import { eigSym, eightPoint, pairs, poses, sfm, solve, svd3, triangulate } from "./sfm";

const setups = Object.keys(SETUPS);
const close = (a: number[][], b: number[][], tol = 1e-9) => a.flat().every((v, k) => Math.abs(v - b.flat()[k]) < tol);

describe("structure from motion", () => {
  it("Jacobi eigenvectors satisfy S v = λ v; svd3 rebuilds its matrix with rotation-valued U, V", () => {
    const S = [[4, 1, 2], [1, 3, 0], [2, 0, 5]];
    for (const { value, vector } of eigSym(S)) S.forEach((r, i) => expect(r.reduce((s, v, k) => s + v * vector[k], 0)).toBeCloseTo(value * vector[i], 9));
    const E = [[1, 2, 0], [0, 1, 3], [2, 0, 1]], { U, V, s } = svd3(E);
    const back = U.map(r => V.map(q => r.reduce((a, u, k) => a + u * s[k] * q[k], 0))); // U Σ Vᵀ
    expect(close(back, E)).toBe(true);
  });

  it("noise-free: the 8-point E matches the true E up to scale, and exactly one pose is in front", () => {
    for (const setup of setups) {
      const P = pairs(setup, 0), { E } = eightPoint(P), T = geometry(setup).E;
      const n = (M: number[][]) => { const k = Math.hypot(...M.flat()), sg = Math.sign(M.flat().find(v => Math.abs(v) > 1e-6)!); return M.map(r => r.map(v => (v * sg) / k)); };
      expect(close(n(E), n(T), 1e-6), setup).toBe(true);
      const fronts = solve(setup, 0).cands.map(c => c.front).sort((a, b) => b - a);
      expect(fronts, setup).toEqual([P.length, 0, 0, 0]);
    }
  });

  it("noise-free: the chosen pose is the true R and the true direction of t; points come back exactly", () => {
    for (const setup of setups) {
      const g = geometry(setup), { best, P, pts } = solve(setup, 0), tu = g.t.map(v => v / Math.hypot(...g.t));
      expect(close(best.R, g.R, 1e-6), setup).toBe(true);
      best.t.forEach((v, k) => expect(v).toBeCloseTo(tu[k], 6));
      pts.forEach((X, i) => X.forEach((v, k) => expect(v).toBeCloseTo(P[i].X[k], 6)));
    }
  });

  it("triangulation: depths along each ray are the depths in each camera", () => {
    const g = geometry("turned toward"), q = pairs("turned toward", 0)[3], t = g.t;
    const { s1, s2 } = triangulate(q.n1, q.n2, g.R, t);
    expect(s1).toBeCloseTo(q.X[2], 9);
    const X2 = g.R.map((r, i) => r.reduce((s, v, k) => s + v * q.X[k], 0) + t[i]);
    expect(s2).toBeCloseTo(X2[2], 9);
  });

  it("E's four poses: two rotations, each with ± t", () => {
    const P = poses(geometry("sideways").E);
    expect(P).toHaveLength(4);
    expect(close(P[0][0], P[1][0])).toBe(true);
    expect(P[0][1].map(v => -v)).toEqual(P[1][1]);
  });

  it("noise grows the error, mostly in depth (the try-this)", () => {
    const err = (n: number) => { const { P, pts } = solve("sideways", n); return pts.map((X, i) => [Math.abs(X[0] - P[i].X[0]), Math.abs(X[2] - P[i].X[2])]); };
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length, e = err(0.1);
    expect(mean(e.map(d => d[1]))).toBeGreaterThan(0.5);
    expect(mean(e.map(d => d[1]))).toBeGreaterThan(3 * mean(e.map(d => d[0])));
    expect(mean(err(0.05).map(d => d[1]))).toBeLessThan(mean(e.map(d => d[1])));
  });

  it("steps: one per match, solve, snap, 4 poses, pick, one per match, finish; the last top view equals run()", () => {
    for (const setup of setups) for (const noise of [0, 0.05, 0.1]) {
      const p = { setup, noise }, I = sfm.sampleInput(p), all = [...sfm.steps(I, p)], n = pairs(setup, noise).length;
      expect(all).toHaveLength(2 * n + 8);
      expect(all.at(-1)!.grids[2].data).toEqual(sfm.run(I, p).data);
      expect(all.every(s => s.line < sfm.pseudocode.length)).toBe(true);
    }
  });
});

describe("structure from motion: display", () => {
  it("the top view is tall enough for every reconstructed point, even at the noisiest setting", () => {
    for (const setup of setups) for (const noise of [0, 0.05, 0.1]) {
      const p = { setup, noise }, g = sfm.run(sfm.sampleInput(p), p), { pts } = solve(setup, noise);
      for (const [X, , Z] of pts) expect(Math.round(Z + 2) < g.h && Math.round(X + 6) < g.w, `${setup} ${noise}`).toBe(true);
    }
  });

  it("σ before the snap is shown at E's display scale, so noise-free reads 1, 1, 0", () => {
    const p = { setup: "sideways", noise: 0 }, all = [...sfm.steps(sfm.sampleInput(p), p)];
    expect(all.find(s => s.line === 3)!.vars!["σ before"]).toBe("1.000, 1.000, 0");
  });
});
