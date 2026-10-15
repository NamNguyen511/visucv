import { describe, expect, it } from "vitest";
import { morphology as m, structuringElement } from "./morphology";
import { type Grid, grid } from "./types";

const fromRows = (rows: string[]): Grid => {
  const g = grid(rows.length, rows[0].length);
  rows.join("").split("").forEach((c, k) => { g.data[k] = c === "#" ? 1 : 0; });
  return g;
};
const toRows = (g: Grid) =>
  Array.from({ length: g.h }, (_, y) => Array.from(g.data.subarray(y * g.w, (y + 1) * g.w), v => (v ? "#" : ".")).join(""));
const invert = (g: Grid): Grid => ({ ...g, data: g.data.map(v => 1 - v) });
const sq3 = { size: 3, shape: "square" };

describe("morphology", () => {
  it("erode 3x3: only the centre of a 3x3 block survives; outside counts as 0", () => {
    const A = fromRows([".....", ".###.", ".###.", ".###.", "....."]);
    expect(toRows(m.run(A, { op: "erode", ...sq3 }))).toEqual([".....", ".....", "..#..", ".....", "....."]);
    expect(toRows(m.run(fromRows(["###", "###", "###"]), { op: "erode", ...sq3 }))).toEqual(["...", ".#.", "..."]);
  });

  it("dilate 3x3: a single pixel grows into a 3x3 block", () => {
    const A = fromRows([".....", ".....", "..#..", ".....", "....."]);
    expect(toRows(m.run(A, { op: "dilate", ...sq3 }))).toEqual([".....", ".###.", ".###.", ".###.", "....."]);
  });

  it("opening removes a speck, closing fills a hole", () => {
    const speck = fromRows([".......", ".###...", ".###.#.", ".###...", "......."]);
    expect(toRows(m.run(speck, { op: "open", ...sq3 }))).toEqual([".......", ".###...", ".###...", ".###...", "......."]);
    const hole = fromRows([".......", ".#####.", ".##.##.", ".#####.", "......."]);
    expect(m.run(hole, { op: "close", ...sq3 }).data[2 * 7 + 3]).toBe(1);
  });

  it("duality away from the border: erode(A) = not dilate(not A)", () => {
    const A = m.sampleInput({});
    for (const shape of ["square", "cross", "disk"])
      for (const size of [3, 5]) {
        const r = (size - 1) / 2;
        const e = m.run(A, { op: "erode", size, shape });
        const d = invert(m.run(invert(A), { op: "dilate", size, shape }));
        // Outside = 0 for both ops breaks duality within r of the border, so compare the interior.
        for (let y = r; y < A.h - r; y++)
          for (let x = r; x < A.w - r; x++) expect(e.data[y * A.w + x], `${shape}${size} ${y},${x}`).toBe(d.data[y * A.w + x]);
      }
  });

  it("opening and closing are idempotent", () => {
    const A = m.sampleInput({});
    for (const op of ["open", "close"]) {
      const once = m.run(A, { op, ...sq3 });
      expect(m.run(once, { op, ...sq3 }).data).toEqual(once.data);
    }
  });

  it("steps(): one step per pixel per pass, and the last step equals run()", () => {
    const A = m.sampleInput({});
    for (const op of ["erode", "dilate", "open", "close"]) {
      const all = [...m.steps(A, { op, ...sq3 })];
      expect(all.length).toBe(A.h * A.w * (op === "open" || op === "close" ? 2 : 1));
      expect(all.at(-1)!.grids.at(-1)!.data).toEqual(m.run(A, { op, ...sq3 }).data);
    }
  });

  it("structuring elements", () => {
    expect(structuringElement(3, "square")).toHaveLength(9);
    expect(structuringElement(3, "cross")).toHaveLength(5);
    expect(structuringElement(5, "cross")).toHaveLength(9);
    expect(structuringElement(5, "disk").length).toBeLessThan(25);
  });
});
