import { describe, expect, it } from "vitest";
import { stepsDue } from "./playback";

describe("stepsDue", () => {
  it("advances speed × elapsed seconds, carrying the fraction", () => {
    expect(stepsDue(0, 100, 15)).toEqual({ n: 1, carry: expect.closeTo(0.5, 9) });
    expect(stepsDue(0.5, 100, 15)).toEqual({ n: 2, carry: expect.closeTo(0, 9) });
  });

  // Regression: rAF's timestamp is the frame's start time and can precede the performance.now()
  // taken when play was pressed. A negative delta used to give n = -1 → step index -1 → crash.
  it("never steps backwards when the frame timestamp is earlier than the start time", () => {
    const { n, carry } = stepsDue(0, -9.7, 15);
    expect(n).toBe(0);
    expect(carry).toBe(0);
  });
});
