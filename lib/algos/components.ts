// Flood fill (book §4.1, stack or queue) and connected-component labeling by repeated flood fill (§4.2),
// with blob-size filtering (§4.3). Input: binary grid. Output: a label image (see Grid.labels).
import { type Algorithm, type Cell, type Grid, type Step, grid } from "./types";

const N4: Cell[] = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const N8: Cell[] = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Stack (take newest) or queue (take oldest), with a view of what's waiting. */
class Frontier {
  private items: Cell[] = [];
  private head = 0;
  constructor(readonly kind: "stack" | "queue") {}
  add(c: Cell) { this.items.push(c); }
  take(): Cell { return this.kind === "stack" ? this.items.pop()! : this.items[this.head++]; }
  get size() { return this.items.length - this.head; }
  /** Waiting cells, next-to-be-taken first. */
  waiting(): Cell[] {
    const w = this.items.slice(this.head);
    return this.kind === "stack" ? w.reverse() : w;
  }
}

const fmtCell = ([y, x]: Cell) => `(${y},${x})`;
const preview = (f: Frontier) => {
  const w = f.waiting();
  return w.length ? w.slice(0, 4).map(fmtCell).join(" ") + (w.length > 4 ? ` … +${w.length - 4}` : "") : "empty";
};

/** Label image of A before anything is labeled: foreground −1, background 0. */
const unlabeled = (A: Grid): Grid => ({ ...grid(A.h, A.w), labels: true, data: A.data.map(v => (v ? -1 : 0)) });

/** Book §4.1: pop, skip if outside / background / already labeled, label it, push every neighbour. */
function* floodFill(
  A: Grid, L: Grid, seed: Cell, k: number, kind: "stack" | "queue", nbrs: Cell[], ctx: Record<string, string | number>,
): Generator<Step, number> {
  const f = new Frontier(kind);
  f.add(seed);
  let filled = 0;
  const snap = (p: Cell | null, line: number, note: string): Step => ({
    grids: [A, { ...L, data: L.data.slice() }], src: 1, dst: 1,
    read: f.waiting(), write: p ? [p] : [], line,
    vars: { ...ctx, p: p ? fmtCell(p) : "—", [kind === "stack" ? "stack (top first)" : "queue (front first)"]: preview(f),
            [`${kind} size`]: f.size, "pixels filled": filled, why: note },
  });
  yield snap(null, 1, `start at seed ${fmtCell(seed)}`);
  while (f.size) {
    const p = f.take(), [y, x] = p;
    const outside = y < 0 || y >= A.h || x < 0 || x >= A.w;
    const why = outside ? "outside the image" : !A.data[y * A.w + x] ? "background" : L.data[y * A.w + x] > 0 ? "already labeled" : "";
    if (why) { yield snap(p, 4, `skip: ${why}`); continue; }
    L.data[y * A.w + x] = k;
    filled++;
    for (const [dy, dx] of nbrs) f.add([y + dy, x + dx]);
    yield snap(p, 6, `label ${k}, push ${nbrs.length} neighbours`);
  }
  return filled;
}

const SEED: Cell = [2, 2];

export const components: Algorithm = {
  meta: {
    id: "components",
    title: "Flood Fill & Connected Components",
    topic: "Binary images",
    ref: "Birchfield, Ch. 4 — Flood Fill and Connected Components",
    blurb:
      "Flood fill grows a region from one seed pixel: take a pixel from the frontier, label it, add its " +
      "neighbours, repeat. A stack dives down one path first; a queue spreads in rings. Labeling every blob " +
      "is just flood fill from each unlabeled pixel in raster order. (OpenCV uses a faster two-pass " +
      "union-find; the answer is the same.) Try 4- vs 8-connectivity on the diagonal staircase.",
  },
  params: [
    { key: "op", label: "Run", options: ["flood fill", "label all blobs"], default: "flood fill" },
    { key: "frontier", label: "Frontier", options: ["stack", "queue"], default: "stack" },
    { key: "conn", label: "Connectivity", options: [4, 8], default: 4 },
    { key: "minSize", label: "Min blob size", options: [1, 3, 10], default: 1 },
  ],
  pseudocode: [
    "FLOOD_FILL(A, seed, k):",
    "  frontier ← [seed]",
    "  while frontier not empty:",
    "    p ← frontier.take()   ▸ newest or oldest",
    "    if p outside, background or labeled: skip",
    "    label[p] ← k",
    "    frontier.add(every neighbour of p)   ▸ 4 or 8",
    "LABEL(A, minSize):",
    "  k ← 0",
    "  for each pixel p, in raster order:",
    "    if A[p] = 1 and p unlabeled:",
    "      k ← k + 1;  FLOOD_FILL(A, p, k)",
    "  erase blobs with fewer than minSize pixels",
    "  return label",
  ],
  paintable: true,

  panelTitles: ({ op }) => (op === "flood fill" ? ["A", `filled from seed ${fmtCell(SEED)}`] : ["A", "labels"]),

  // A U (stack vs queue take different routes), a diagonal staircase (4- vs 8-connectivity),
  // a ring around a hole, a block touching the ring diagonally, and specks for the size filter.
  sampleInput() {
    const h = 18, w = 24, A = grid(h, w);
    const set = (y: number, x: number) => { A.data[y * w + x] = 1; };
    for (let y = 2; y <= 12; y++) { for (let x = 1; x <= 3; x++) set(y, x); for (let x = 8; x <= 10; x++) set(y, x); }
    for (let y = 10; y <= 12; y++) for (let x = 1; x <= 10; x++) set(y, x);
    for (let i = 0; i < 6; i++) set(1 + i, 13 + i);
    for (let y = 11; y <= 16; y++) for (let x = 14; x <= 21; x++) if (y === 11 || y === 16 || x === 14 || x === 21) set(y, x);
    for (let y = 7; y <= 9; y++) for (let x = 19; x <= 22; x++) set(y, x);
    for (const [y, x] of [[15, 3], [16, 7], [14, 10], [15, 11], [1, 22]]) set(y, x);
    return A;
  },

  run(A, p) {
    let last: Step | undefined;
    for (const s of components.steps(A, p)) last = s;
    return last!.grids[1];
  },

  *steps(A, { op, frontier, conn, minSize }): Generator<Step, void> {
    const kind = frontier as "stack" | "queue", nbrs = +conn === 8 ? N8 : N4;
    const L = unlabeled(A);

    if (op === "flood fill") {
      const filled = yield* floodFill(A, L, SEED, 1, kind, nbrs, {});
      yield { grids: [A, L], src: 1, dst: 1, read: [], write: [], line: 2,
              vars: { "frontier empty": "done", "pixels filled": filled } };
      return;
    }

    let k = 0;
    const sizes: number[] = [];
    yield { grids: [A, { ...L, data: L.data.slice() }], src: 1, dst: 1, read: [], write: [], line: 8, vars: { k } };
    for (let y = 0; y < A.h; y++)
      for (let x = 0; x < A.w; x++) {
        if (!A.data[y * A.w + x]) continue; // background: nothing to show
        const p: Cell = [y, x];
        if (L.data[y * A.w + x] > 0) {
          yield { grids: [A, { ...L, data: L.data.slice() }], src: 1, dst: 1, read: [], write: [p], line: 10,
                  vars: { p: fmtCell(p), k, why: `already label ${L.data[y * A.w + x]}` } };
          continue;
        }
        k++;
        yield { grids: [A, { ...L, data: L.data.slice() }], src: 1, dst: 1, read: [], write: [p], line: 11,
                vars: { p: fmtCell(p), k, why: "unlabeled foreground: new blob" } };
        sizes[k] = yield* floodFill(A, L, p, k, kind, nbrs, { k });
      }
    const small = sizes.map((n, i) => (n < +minSize ? i : 0)).filter(Boolean);
    const out: Grid = { ...L, data: L.data.map(v => (small.includes(v) ? 0 : v)) };
    yield { grids: [A, out], src: 1, dst: 1, read: [], write: [], line: 12,
            vars: { "blobs found": k, "blob sizes": sizes.slice(1).join(", ") || "—",
                    [`erased (< ${minSize} px)`]: small.length, kept: k - small.length } };
    yield { grids: [A, out], src: 1, dst: 1, read: [], write: [], line: 13, vars: { "blobs kept": k - small.length } };
  },
};
