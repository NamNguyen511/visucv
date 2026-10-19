import { describe, expect, it } from "vitest";
import { algorithms } from ".";
import { gaussian } from "./gaussian";
import { cleanImage, mae } from "./nonlinear";
import { type Params, defaultParams } from "./types";

// The settings that solve each challenge, and near misses that must not (measured on the samples).
const CASES: Record<string, { solve: Params; miss: Params[] }> = {
  morphology: {
    solve: { op: "open", size: 3, shape: "square" },
    miss: [{ op: "erode", size: 3 }, { op: "dilate", size: 3 }, { op: "close", size: 3 }, { op: "open", size: 5 }],
  },
  components: { solve: { op: "label all blobs", conn: 8 }, miss: [{ op: "label all blobs", conn: 4 }, { op: "flood fill", conn: 8 }] },
  convolution: { solve: { kernel: "one-hot (asymmetric)", mode: "convolution" }, miss: [{ kernel: "one-hot (asymmetric)", mode: "correlation" }] },
  nonlinear: {
    solve: { image: "noisy step edge", filter: "bilateral", window: "5×5", sigmaR: 50 },
    miss: [{ image: "noisy step edge", filter: "median", window: "5×5" }, { image: "noisy step edge", filter: "bilateral", window: "5×5", sigmaR: "∞" }],
  },
};

const solved = (id: string, over: Params) => {
  const a = algorithms[id], p = { ...defaultParams(a), ...over }, input = a.sampleInput(p);
  return a.challenge!.solved(p, a.run(input, p), input);
};

describe("try-it challenges", () => {
  it("every page with a challenge has test cases", () => {
    expect(Object.keys(algorithms).filter(id => algorithms[id].challenge).sort()).toEqual(Object.keys(CASES).sort());
  });
  for (const [id, { solve, miss }] of Object.entries(CASES))
    it(`${id}: unsolved by default, solved by the intended settings, not by near misses`, () => {
      expect(solved(id, {})).toBe(false);
      expect(solved(id, solve)).toBe(true);
      for (const m of miss) expect(solved(id, m), JSON.stringify(m)).toBe(false);
    });
});

// The nonlinear prompt quotes the Gaussian's error: it must hold for every window (3×3 gave 7.1, not the 7.9 it said).
describe("nonlinear prompt", () => {
  it("the comparison Gaussian stays above 7 levels on the noisy step edge", () => {
    expect(algorithms.nonlinear.challenge!.prompt).toContain("stays above 7");
    for (const sigma of [1, 1.5]) {
      const I = algorithms.nonlinear.sampleInput({ image: "noisy step edge" });
      expect(mae(gaussian.run(I, { sigma }), cleanImage("noisy step edge"))).toBeGreaterThan(7);
    }
  });
});
