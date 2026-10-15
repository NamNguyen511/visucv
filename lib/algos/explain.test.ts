import katex from "katex";
import { describe, expect, it } from "vitest";
import { algorithms } from ".";

// "Easy to read" as a budget every page must meet, including future ones.
const words = (s: string) => s.trim().split(/\s+/).length;

describe.each(Object.values(algorithms))("$meta.id explanation", a => {
  it("lead is one short sentence", () => {
    expect(words(a.meta.lead)).toBeLessThanOrEqual(25);
    expect(a.meta.lead.replace(/\.$/, "")).not.toMatch(/[.!?]\s/);
  });

  it("2–4 key ideas, each short", () => {
    expect(a.explain.ideas.length).toBeGreaterThanOrEqual(2);
    expect(a.explain.ideas.length).toBeLessThanOrEqual(4);
    for (const i of a.explain.ideas) expect(words(i.text), i.term).toBeLessThanOrEqual(22);
  });

  it("2–3 things to try", () => {
    expect(a.explain.tryThis.length).toBeGreaterThanOrEqual(2);
    expect(a.explain.tryThis.length).toBeLessThanOrEqual(3);
  });

  it("every formula is valid TeX", () => {
    for (const f of a.explain.formulas ?? [])
      expect(() => katex.renderToString(f.tex, { displayMode: true, throwOnError: true }), f.label).not.toThrow();
  });
});
