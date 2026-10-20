import { describe, expect, it } from "vitest";
import { algorithms } from ".";
import { chapter } from "./card";

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
