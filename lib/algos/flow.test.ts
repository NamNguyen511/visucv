import { describe, expect, it } from "vitest";
import { MOTIONS, flow as fl, inner, lucasKanade, sampleImage, shift } from "./flow";
import { type Grid, grid } from "./types";

const fromFn = (n: number, fn: (x: number, y: number) => number): Grid => {
  const g = grid(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) g.data[y * n + x] = fn(x, y);
  return g;
};
const at = (I: Grid, d: [number, number], x: number, y: number, r = 2) => {
  const F = lucasKanade(I, shift(I, d), r), k = y * I.w + x;
  return { u: F.u[k], v: F.v[k], kind: F.kind[k] };
};

describe("Lucas–Kanade", () => {
  it("shift moves content by d: J(x) = I(x − d)", () => {
    const I = fromFn(8, x => x / 8), J = shift(I, [1, 0]);
    expect(J.data[3 * 8 + 4]).toBeCloseTo(I.data[3 * 8 + 3], 6);
  });

  it("a smooth blob moved a little is recovered closely", () => {
    const I = fromFn(16, (x, y) => Math.exp(-((x - 8) ** 2 + (y - 8) ** 2) / 18)), r = at(I, [0.1, -0.05], 6, 7);
    expect(r.kind).toBe("tracked");
    // Not exact: bilinear shifting makes I − J a one-sided difference, Sobel a centred one (second-order gap).
    expect(Math.hypot(r.u - 0.1, r.v + 0.05) / Math.hypot(0.1, 0.05)).toBeLessThan(0.2);
    expect(Math.hypot(r.u, r.v)).toBeGreaterThan(0.09);
  });

  it("square corner tracks the full motion; its top edge gets only the normal flow (aperture)", () => {
    const I = sampleImage("shapes"), y = 5, corner = 5, edge = 10;
    for (const [m, normal] of [["→ 0.5 px", 0], ["↘ 0.5 px", MOTIONS["↘ 0.5 px"][1]]] as const) {
      const d = MOTIONS[m], c = at(I, d, corner, y), e = at(I, d, edge, y);
      expect(c.kind).toBe("tracked");
      expect(Math.hypot(c.u - d[0], c.v - d[1])).toBeLessThan(0.1);
      expect(e.kind).toBe("edge");
      expect(e.u).toBeCloseTo(0, 2); // nothing measurable along a horizontal edge
      expect(e.v).toBeCloseTo(normal, 1);
    }
  });

  it("stripes: never tracked, flow always across the stripes", () => {
    const I = sampleImage("stripes"), F = lucasKanade(I, shift(I, MOTIONS["→ 0.5 px"]), 2);
    for (let k = 0; k < I.h * I.w; k++) {
      expect(F.kind[k]).toBe(inner(k, I.h, I.w, 2) ? "edge" : "rim");
      if (F.kind[k] === "edge") expect(F.u[k]).toBeCloseTo(F.v[k], 1); // stripes run along x = −y (borders blur them slightly)
    }
  });

  it("the stripes try-this picks a motion that shows the aperture problem (not one already across them)", () => {
    const tip = fl.explain.tryThis.find(t => /stripes/.test(t))!, m = Object.keys(MOTIONS).find(k => tip.includes(k))!;
    const p = { image: "stripes", motion: m, window: "5×5" }, I = fl.sampleInput(p), out = fl.run(I, p).data;
    const ks = [...out.keys()].filter(k => inner(k, I.h, I.w, 2));
    expect(ks.reduce((s, k) => s + out[k], 0) / ks.length).toBeLessThan(0.9); // only part of the motion found
  });

  it("a 2 px jump breaks the linear step: worse than at 0.5 px", () => {
    const err = (m: string) => {
      const I = sampleImage("dots"), d = MOTIONS[m], F = lucasKanade(I, shift(I, d), 2);
      const e = [...F.kind.keys()].filter(k => F.kind[k] === "tracked").map(k => Math.hypot(F.u[k] - d[0], F.v[k] - d[1]) / Math.hypot(...d));
      return e.reduce((a, b) => a + b, 0) / e.length;
    };
    expect(err("→ 0.5 px")).toBeLessThan(0.3);
    expect(err("→ 2 px")).toBeGreaterThan(2 * err("→ 0.5 px"));
  });

  it("steps: setup, one per inner pixel, summary; the last panel equals run()", () => {
    for (const window of ["3×3", "5×5", "7×7"]) {
      const p = { image: "shapes", motion: "↘ 0.5 px", window }, I = fl.sampleInput(p), all = [...fl.steps(I, p)];
      const r = window === "3×3" ? 1 : window === "5×5" ? 2 : 3, side = I.w - 2 * (r + 1);
      expect(all).toHaveLength(side * side + 2);
      expect(all.at(-1)!.grids[2].data).toEqual(fl.run(I, p).data);
      expect(all.every(s => s.line < fl.pseudocode.length)).toBe(true);
    }
  });
});
