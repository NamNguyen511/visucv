import { describe, expect, it } from "vitest";
import { SETUPS, epipolar as ep, epipole, geometry, lineDist, matches } from "./epipolar";
import { grid } from "./types";

const setups = Object.keys(SETUPS), scenes = ["cube", "posts"];
const line = (F: number[][], [x, y]: [number, number]) => F.map(r => r[0] * x + r[1] * y + r[2]) as [number, number, number];

describe("epipolar geometry", () => {
  it("every true match lies on its epipolar line: x₂ᵀ F x₁ = 0", () => {
    for (const s of setups) for (const n of scenes) {
      const { F } = geometry(s), M = matches(s, n);
      expect(M.length, `${s}/${n}`).toBeGreaterThan(8);
      for (const { x1, x2 } of M) expect(lineDist(line(F, x1), x2)).toBeLessThan(1e-9);
    }
  });

  it("sideways rig: epipolar lines are image rows (b·x term vanishes), epipole at infinity", () => {
    const { F, t } = geometry("sideways");
    for (const { x1 } of matches("sideways", "cube")) {
      const [a, b, c] = line(F, x1);
      expect(Math.abs(a)).toBeLessThan(1e-12 * Math.abs(b));
      expect(-c / b).toBeCloseTo(x1[1], 9); // the same row as x1
    }
    expect(epipole(t)).toBeNull();
  });

  it("all epipolar lines pass through the epipole; forward motion puts it at the centre", () => {
    for (const s of ["forward + right", "forward", "turned toward"]) {
      const { F, t } = geometry(s), e = epipole(t)!;
      for (const { x1 } of matches(s, "cube")) expect(lineDist(line(F, x1), e), s).toBeLessThan(1e-6);
    }
    expect(epipole(geometry("forward").t)).toEqual([10, 10]);
    const e = epipole(geometry("forward + right").t)!;
    expect(e[0]).toBeGreaterThanOrEqual(0); expect(e[0]).toBeLessThan(21); // visible, as the try-this says
  });

  it("a painted pixel with no 3-D point gets a line but no match", () => {
    const p = { setup: "turned toward", scene: "cube" }, I = grid(21, 21);
    I.data[0] = 1;
    const all = [...ep.steps(I, p)];
    expect(all).toHaveLength(3);
    expect(String(all[1].vars.x2)).toMatch(/no 3-D point/);
    expect(all[1].shapes!.some(s => s.kind === "line" && s.panel === 1)).toBe(true);
    expect([...ep.run(I, p).data].every(v => v === 0)).toBe(true);
  });

  // Regression: a pixel painted on the epipole has l₂ = F·e₁ = 0, so no line exists; the readout said
  // "anywhere on l2" for a line that was never drawn.
  it("a pixel on image 1's epipole: its ray holds camera 2's centre, so image 2 sees only the epipole", () => {
    for (const [setup, x, y] of [["forward", 10, 10], ["forward + right", 18, 10]] as const) {
      const I = grid(21, 21);
      I.data[y * 21 + x] = 1;
      const s = [...ep.steps(I, { setup, scene: "cube" })][1];
      expect(s.shapes!.some(q => q.kind === "line"), setup).toBe(false);
      expect(String(s.vars.x2), setup).toMatch(/epipole/);
    }
  });

  it("steps: setup, one per white pixel, finish; the last image equals run()", () => {
    for (const setup of setups) for (const scene of scenes) {
      const p = { setup, scene }, I = ep.sampleInput(p), all = [...ep.steps(I, p)];
      expect(all).toHaveLength(I.data.reduce((s, v) => s + v, 0) + 2);
      expect(all.at(-1)!.grids[1].data).toEqual(ep.run(I, p).data);
      expect(all.every(s => s.line < ep.pseudocode.length)).toBe(true);
    }
  });
});
