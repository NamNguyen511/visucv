// Binary morphology: erosion, dilation, opening, closing.
// Binary grid: 1 = foreground. Pixels outside the image count as 0.
import { type Algorithm, type Cell, type Grid, type Params, type Step, clone, grid } from "./types";

type Kind = "erode" | "dilate";

/** Structuring element as [dy, dx] offsets from its centre. */
export function structuringElement(size: number, shape: string): Cell[] {
  const r = (size - 1) / 2;
  const out: Cell[] = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (
        shape === "square" ||
        (shape === "cross" && (dy === 0 || dx === 0)) ||
        (shape === "disk" && dy * dy + dx * dx <= r * r + r / 2) // + r/2 rounds the disk edge
      )
        out.push([dy, dx]);
  return out;
}

/** How many SE cells, centred at (y, x), land on a foreground pixel. */
function hitCount(A: Grid, se: Cell[], y: number, x: number) {
  let n = 0;
  for (const [dy, dx] of se) {
    const yy = y + dy, xx = x + dx;
    if (yy >= 0 && yy < A.h && xx >= 0 && xx < A.w && A.data[yy * A.w + xx]) n++;
  }
  return n;
}

/** One erode/dilate sweep. With `panels`, yields a step per pixel; returns the output. */
function* pass(A: Grid, se: Cell[], kind: Kind, panels: Grid[] | null, src: number): Generator<Step, Grid> {
  const out = grid(A.h, A.w, NaN);
  const base = kind === "erode" ? 1 : 5;
  for (let y = 0; y < A.h; y++)
    for (let x = 0; x < A.w; x++) {
      const hits = hitCount(A, se, y, x);
      const on = kind === "erode" ? hits === se.length : hits > 0;
      out.data[y * A.w + x] = on ? 1 : 0;
      if (!panels) continue;
      const grids = panels.slice();
      grids[src + 1] = clone(out);
      yield {
        grids, src, dst: src + 1,
        read: se.map(([dy, dx]) => [y + dy, x + dx]),
        write: [[y, x]],
        line: base + (on ? 1 : 2),
        vars: {
          p: `(${y}, ${x})`,
          "cells of B on 1": `${hits} / ${se.length}`,
          [kind === "erode" ? "fits" : "hits"]: String(on),
          "out[p]": on ? 1 : 0,
        },
      };
    }
  return out;
}

const plan = (op: Params[string]): Kind[] =>
  ({ erode: ["erode"], dilate: ["dilate"], open: ["erode", "dilate"], close: ["dilate", "erode"] })[op as string] as Kind[];

export const morphology: Algorithm = {
  meta: {
    id: "morphology",
    title: "Erosion, Dilation, Opening & Closing",
    topic: "Binary images",
    ref: "Birchfield, Ch. 3 — Thresholding, Erosion, and Dilation",
    lead: "Slide a small shape B over a binary image to shrink it, grow it, or clean up its noise.",
    hook: "Small neighborhoods. Big changes in shape.",
  },
  explain: {
    ideas: [
      { term: "Erosion", text: "Keeps a pixel only if B, centred there, fits entirely inside the white region." },
      { term: "Dilation", text: "Turns a pixel on if B, centred there, hits any white pixel." },
      { term: "Opening", text: "Erode, then dilate: removes white specks and thin bridges, keeps big shapes." },
      { term: "Closing", text: "Dilate, then erode: fills small black holes and gaps." },
    ],
    formulas: [
      { label: "Erosion", tex: String.raw`A\ominus B=\{\,z : B_z\subseteq A\,\}`, note: "B_z = B shifted to pixel z; outside the image counts as black" },
      { label: "Dilation", tex: String.raw`A\oplus B=\{\,z : B_z\cap A\neq\varnothing\,\}` },
      { label: "Opening", tex: String.raw`A\circ B=(A\ominus B)\oplus B` },
      { label: "Closing", tex: String.raw`A\bullet B=(A\oplus B)\ominus B` },
    ],
    tryThis: [
      "Step through erosion and read “cells of B on 1”: only 9 / 9 survives.",
      "Switch Operation to close: the hole in the left square fills in.",
      "Set Kernel size to 5 (book exercise 2): more specks vanish and corners round off.",
    ],
  },
  params: [
    { key: "op", label: "Operation", options: ["erode", "dilate", "open", "close"], default: "open" },
    { key: "size", label: "Kernel size", options: [3, 5, 7], default: 3 },
    { key: "shape", label: "Kernel shape", options: ["square", "cross", "disk"], default: "square" },
  ],
  pseudocode: [
    "ERODE(A, B):",
    "  for each pixel p in A:",
    "    if B centred at p fits inside A:  out[p] ← 1",
    "    else:                             out[p] ← 0",
    "DILATE(A, B):",
    "  for each pixel p in A:",
    "    if B centred at p hits A:         out[p] ← 1",
    "    else:                             out[p] ← 0",
    "OPEN(A, B)  = DILATE(ERODE(A, B), B)",
    "CLOSE(A, B) = ERODE(DILATE(A, B), B)",
  ],
  paintable: true,

  panelTitles: ({ op }) =>
    ({
      erode: ["A", "A ⊖ B"],
      dilate: ["A", "A ⊕ B"],
      open: ["A", "A ⊖ B", "(A ⊖ B) ⊕ B"],
      close: ["A", "A ⊕ B", "(A ⊕ B) ⊖ B"],
    })[op as string]!,

  // A blob with a black hole, a 1-px bridge, a second blob, a small block and white specks.
  sampleInput() {
    const h = 20, w = 24, A = grid(h, w);
    const set = (y: number, x: number) => { if (y >= 0 && y < h && x >= 0 && x < w) A.data[y * w + x] = 1; };
    for (let y = 3; y < 12; y++) for (let x = 2; x < 11; x++) set(y, x);
    A.data[7 * w + 6] = 0; A.data[7 * w + 7] = 0;
    for (let x = 11; x < 15; x++) set(7, x);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((y - 8) ** 2 + (x - 18) ** 2 <= 14) set(y, x);
    for (const [y, x] of [[15, 3], [16, 12], [2, 15], [17, 20], [14, 8]]) set(y, x);
    for (let y = 14; y < 18; y++) for (let x = 14; x < 18; x++) set(y, x);
    return A;
  },

  run(A, { op, size, shape }) {
    const se = structuringElement(+size, String(shape));
    let cur = A;
    for (const kind of plan(op)) {
      const it = pass(cur, se, kind, null, 0);
      let r = it.next();
      while (!r.done) r = it.next();
      cur = r.value;
    }
    return cur;
  },

  *steps(A, { op, size, shape }) {
    const se = structuringElement(+size, String(shape));
    const kinds = plan(op);
    // Later panels start as "not computed" and fill in as each pass sweeps.
    const panels = [A, ...kinds.map(() => grid(A.h, A.w, NaN))];
    for (let i = 0; i < kinds.length; i++) panels[i + 1] = yield* pass(panels[i], se, kinds[i], panels, i);
  },
};
