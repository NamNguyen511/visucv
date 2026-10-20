import { describe, expect, it } from "vitest";
import { algorithms } from ".";
import { chapter } from "./card";
import { defaultParams } from "./types";

describe("card chapter label", () => {
  it("reads one or a range of chapters", () => {
    expect(chapter("Birchfield, Ch. 5")).toBe("Ch. 5");
    expect(chapter("Birchfield, Ch. 5 — a · Ch. 6 — b")).toBe("Ch. 5–6");
  });
  // Regression: the pinhole page's ref has no chapter yet, and its home card read "Ch. undefined".
  it("never prints undefined", () => {
    expect(chapter("Birchfield")).toBe("Birchfield");
    for (const a of Object.values(algorithms)) expect(chapter(a.meta.ref), a.meta.id).not.toMatch(/undefined/);
  });
});

// Regression: the player regenerates the input only for `input: true` params, so a sample image that
// depends on any other param goes stale (epipolar's image 1 depended on Setup).
describe("sample input depends only on input params", () => {
  it("changing a non-input param leaves sampleInput unchanged", () => {
    for (const a of Object.values(algorithms)) {
      const base = defaultParams(a), I = a.sampleInput(base).data;
      for (const p of a.params.filter(q => !q.input)) for (const o of p.options)
        expect(a.sampleInput({ ...base, [p.key]: o }).data, `${a.meta.id} ${p.key}=${o}`).toEqual(I);
    }
  });
});
