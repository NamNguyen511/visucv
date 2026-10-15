import { describe, expect, it } from "vitest";
import { histogram, otsu, otsuThreshold, threshold } from "./otsu";
import { type Grid, grid } from "./types";

const fromLevels = (levels: number[]): Grid => ({ ...grid(1, levels.length), data: Float32Array.from(levels, l => l / 255) });

// σ²_B(t) straight from the definition, pixel by pixel: no histogram, no running sums.
function bruteOtsu(I: Grid): number {
  const L = Array.from(I.data, v => Math.round(v * 255));
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  let best = -1, tStar = -1;
  for (let t = 0; t < 256; t++) {
    const c0 = L.filter(l => l <= t), c1 = L.filter(l => l > t);
    if (!c0.length || !c1.length) continue;
    const s2 = (c0.length / L.length) * (c1.length / L.length) * (mean(c0) - mean(c1)) ** 2;
    if (s2 > best + 1e-9) { best = s2; tStar = t; }
  }
  return tStar;
}

describe("otsu", () => {
  it("histogram has 256 bins summing to N", () => {
    const I = otsu.sampleInput({ image: "two peaks", noise: 20 });
    const h = histogram(I);
    expect(h).toHaveLength(256);
    expect(h.reduce((a, b) => a + b)).toBe(I.h * I.w);
  });

  it("running-sum sweep matches the brute-force definition on every sample image", () => {
    for (const image of ["two peaks", "small object", "three peaks"])
      for (const noise of [8, 20, 35]) {
        const I = otsu.sampleInput({ image, noise });
        expect(otsuThreshold(I), `${image} σ=${noise}`).toBe(bruteOtsu(I));
      }
  });

  it("two peaks: t* lands between the background (70) and object (170) levels", () => {
    const t = otsuThreshold(otsu.sampleInput({ image: "two peaks", noise: 8 }));
    expect(t).toBeGreaterThan(70);
    expect(t).toBeLessThan(170);
  });

  it("ties keep the smallest t: two levels 10 and 200 split anywhere in [10, 199]", () => {
    expect(otsuThreshold(fromLevels([10, 10, 200, 200]))).toBe(10);
  });

  it("constant image: t* is that constant and I > t* is empty", () => {
    const I = fromLevels([90, 90, 90]);
    expect(otsuThreshold(I)).toBe(90);
    expect([...otsu.run(I, {}).data]).toEqual([0, 0, 0]);
  });

  it("threshold is strict: level == t goes to class 0", () => {
    expect([...threshold(fromLevels([99, 100, 101]), 100).data]).toEqual([0, 0, 1]);
  });

  it("steps(): histogram step, one per t, return step; last panel equals run()", () => {
    const p = { image: "two peaks", noise: 20 };
    const I = otsu.sampleInput(p);
    const all = [...otsu.steps(I, p)];
    expect(all).toHaveLength(1 + 256 + 1);
    expect(all.at(-1)!.grids[1].data).toEqual(otsu.run(I, p).data);
    expect(all.at(-1)!.plot!.best!.x).toBe(otsuThreshold(I));
  });
});
