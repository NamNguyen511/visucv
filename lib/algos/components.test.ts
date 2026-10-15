import { describe, expect, it } from "vitest";
import { components as cc } from "./components";
import { type Grid, grid } from "./types";

const fromRows = (rows: string[]): Grid => {
  const g = grid(rows.length, rows[0].length);
  rows.join("").split("").forEach((c, k) => { g.data[k] = c === "#" ? 1 : 0; });
  return g;
};

// Independent reference: classic two-pass union-find (the algorithm OpenCV uses), labels renumbered
// by first appearance in raster order, which is also the order LABEL creates them in.
function unionFind(A: Grid, conn: 4 | 8): number[] {
  const parent: number[] = [];
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const prev = conn === 8 ? [[0, -1], [-1, -1], [-1, 0], [-1, 1]] : [[0, -1], [-1, 0]];
  const L = new Array(A.h * A.w).fill(0);
  let next = 1;
  for (let y = 0; y < A.h; y++)
    for (let x = 0; x < A.w; x++) {
      if (!A.data[y * A.w + x]) continue;
      const roots = prev
        .map(([dy, dx]) => [y + dy, x + dx])
        .filter(([yy, xx]) => yy >= 0 && xx >= 0 && xx < A.w && L[yy * A.w + xx])
        .map(([yy, xx]) => find(L[yy * A.w + xx]));
      if (!roots.length) { parent[next] = next; L[y * A.w + x] = next++; continue; }
      const r = Math.min(...roots);
      for (const o of roots) parent[o] = r;
      L[y * A.w + x] = r;
    }
  const renum = new Map<number, number>();
  return L.map(v => (v ? renum.get(find(v)) ?? (renum.set(find(v), renum.size + 1), renum.size) : 0));
}

const label = (A: Grid, conn: number, minSize = 1, frontier = "queue") =>
  [...cc.run(A, { op: "label all blobs", frontier, conn, minSize }).data];
const countLabels = (L: number[]) => new Set(L.filter(v => v > 0)).size;

describe("components", () => {
  it("labeling matches an independent union-find, for 4/8 connectivity and stack/queue", () => {
    const A = cc.sampleInput({});
    for (const conn of [4, 8] as const)
      for (const frontier of ["stack", "queue"]) expect(label(A, conn, 1, frontier), `${conn} ${frontier}`).toEqual(unionFind(A, conn));
  });

  it("book exercise: a diagonal staircase is 5 blobs with 4-connectivity, 1 with 8", () => {
    const stairs = fromRows(["#....", ".#...", "..#..", "...#.", "....#"]);
    expect(countLabels(label(stairs, 4))).toBe(5);
    expect(countLabels(label(stairs, 8))).toBe(1);
  });

  it("min blob size erases small blobs and keeps the rest", () => {
    const A = fromRows(["##...#", "##....", "......", "...###"]);
    expect(countLabels(label(A, 4, 1))).toBe(3);
    const kept = label(A, 4, 3);
    expect(countLabels(kept)).toBe(2);
    expect(kept[5]).toBe(0); // the single-pixel speck
  });

  it("flood fill with stack or queue fills exactly the seed's blob", () => {
    const A = cc.sampleInput({});
    const ref = unionFind(A, 4);
    const blobOfSeed: number[] = ref.map(v => (v === ref[2 * A.w + 2] ? 1 : 0)); // seed is (2,2)
    for (const frontier of ["stack", "queue"]) {
      const F = [...cc.run(A, { op: "flood fill", frontier, conn: 4, minSize: 1 }).data];
      expect(F.map(v => (v === 1 ? 1 : 0)), frontier).toEqual(blobOfSeed);
      expect(F.filter(v => v === -1).length).toBe(A.data.reduce((a, b) => a + b, 0) - blobOfSeed.reduce((a, b) => a + b, 0));
    }
  });

  it("queue fills in rings (path distance never decreases); stack dives and comes back", () => {
    const A = cc.sampleInput({});
    // True 4-connected path distance from the seed, by an independent BFS.
    const dist = new Map<number, number>([[2 * A.w + 2, 0]]);
    for (const todo = [2 * A.w + 2]; todo.length; ) {
      const k = todo.shift()!, y = Math.floor(k / A.w), x = k % A.w;
      for (const [yy, xx] of [[y, x + 1], [y, x - 1], [y + 1, x], [y - 1, x]]) {
        const kk = yy * A.w + xx;
        if (yy >= 0 && yy < A.h && xx >= 0 && xx < A.w && A.data[kk] && !dist.has(kk)) { dist.set(kk, dist.get(k)! + 1); todo.push(kk); }
      }
    }
    const order = (frontier: string) =>
      [...cc.steps(A, { op: "flood fill", frontier, conn: 4, minSize: 1 })]
        .filter(s => s.line === 6) // "frontier.add": a pixel was labeled this step
        .map(s => dist.get(s.write[0][0] * A.w + s.write[0][1])!);
    const sorted = (d: number[]) => d.every((v, i) => i === 0 || v >= d[i - 1]);
    expect(order("queue")).toHaveLength(dist.size);
    expect(sorted(order("queue"))).toBe(true);
    expect(sorted(order("stack"))).toBe(false);
  });

  it("seed on background fills nothing", () => {
    const A = cc.sampleInput({});
    A.data[2 * A.w + 2] = 0;
    const F = cc.run(A, { op: "flood fill", frontier: "stack", conn: 4, minSize: 1 });
    expect([...F.data].filter(v => v > 0)).toHaveLength(0);
  });

  it("output is a label image and the last step equals run()", () => {
    const A = cc.sampleInput({});
    for (const op of ["flood fill", "label all blobs"]) {
      const p = { op, frontier: "stack", conn: 8, minSize: 3 };
      const all = [...cc.steps(A, p)];
      expect(all.at(-1)!.grids[1].labels).toBe(true);
      expect(all.at(-1)!.grids[1].data).toEqual(cc.run(A, p).data);
    }
  });
});
