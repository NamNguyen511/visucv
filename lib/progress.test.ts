import { afterEach, describe, expect, it } from "vitest";
import { markVisited, readProgress } from "./progress";

const store = (v: string | null) => {
  const m = new Map<string, string>(v === null ? [] : [["visucv:progress", v]]);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, s: string) => void m.set(k, s),
  };
};

describe("progress", () => {
  afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

  it("is empty without storage, and survives storage that throws", () => {
    expect(readProgress()).toEqual({ visited: [] });
    Object.defineProperty(globalThis, "localStorage", { get() { throw new Error("blocked"); }, configurable: true });
    expect(readProgress()).toEqual({ visited: [] });
    expect(() => markVisited("otsu")).not.toThrow();
  });

  it("records visits and the last page", () => {
    store(null);
    markVisited("otsu"); markVisited("edges"); markVisited("otsu");
    expect(readProgress()).toEqual({ visited: ["otsu", "edges"], last: "otsu" });
  });

  // Hand-edited or stale data must not reach the page: a non-string `last` (or "__proto__") crashed the home page.
  it("keeps only string ids", () => {
    store('{"visited":["otsu",null,3],"last":5}');
    expect(readProgress()).toEqual({ visited: ["otsu"] });
    store('{"visited":"x"}');
    expect(readProgress()).toEqual({ visited: [] });
  });
});
