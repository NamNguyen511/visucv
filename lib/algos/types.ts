// The contract every algorithm page implements. The player only knows these types.

/** Row-major image. Binary images use 0/1, gray images 0..1. NaN = "not computed yet".
 *  `labels`: a label image instead: 0 = background, -1 = foreground not labeled yet, k ≥ 1 = label k. */
export type Grid = { h: number; w: number; data: Float32Array; labels?: boolean };
export type Cell = [y: number, x: number];

export type Param = {
  key: string; label: string; options: (string | number)[]; default: string | number;
  /** Changes the sample image: the player regenerates the input (discarding any painting). */
  input?: boolean;
};
export type Params = Record<string, string | number>;

export type Step = {
  /** Panels to draw, in order (e.g. A, A ⊖ B, result). */
  grids: Grid[];
  /** Panel being read from, and panel being written to. */
  src: number;
  dst: number;
  /** Cells read on `src` (the kernel footprint) and written on `dst` this step. */
  read: Cell[];
  write: Cell[];
  /** Index into `pseudocode` of the line executing now. */
  line: number;
  /** Live variables shown under the pseudocode. */
  vars: Record<string, string | number>;
  /** Optional height map for the 3-D view. */
  surface?: Grid;
  /** Optional chart: bars (e.g. a histogram) with a line over them, on a shared x axis. */
  plot?: Plot;
  /** Vector overlays, drawn on the `dst` panel unless a shape names its own `panel`. */
  shapes?: Shape[];
};

/** Overlay in pixel coordinates: x = column, y = row, (x, y) = that pixel's centre. */
export type Shape = (
  | { kind: "point"; x: number; y: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; thick?: boolean }
  /** theta: radians from +x toward +y (clockwise on screen, since y points down). */
  | { kind: "ellipse"; cx: number; cy: number; a: number; b: number; theta: number }
) & { panel?: number };

export type Plot = {
  bars: number[];
  /** Same length as `bars`; NaN = not computed yet. Scaled to its own max (`lineMax`). */
  line: number[];
  lineMax: number;
  barLabel: string;
  lineLabel: string;
  /** Vertical markers at x positions. */
  cursor?: { x: number; label: string };
  best?: { x: number; label: string };
};

export type Algorithm = {
  /** lead: one sentence, ≤ 25 words, saying what the algorithm does. hook: ≤ 8 words, for the home card. */
  meta: { id: string; title: string; topic: string; ref: string; lead: string; hook: string };
  /** Shown below the demo. Budget enforced by lib/algos/explain.test.ts. */
  explain: {
    ideas: { term: string; text: string }[];
    formulas?: { label: string; tex: string; note?: string }[];
    tryThis: string[];
  };
  params: Param[];
  pseudocode: string[];
  /** Panel captions for the current params. */
  panelTitles(p: Params): string[];
  sampleInput(p: Params): Grid;
  run(input: Grid, p: Params): Grid;
  steps(input: Grid, p: Params): Generator<Step, void>;
  /** Input panel can be painted (binary images). */
  paintable?: boolean;
  /** Show the 3-D height-map view of `step.surface`. */
  view3d?: boolean;
};

export const defaultParams = (a: Algorithm): Params => Object.fromEntries(a.params.map(p => [p.key, p.default]));

export const grid = (h: number, w: number, fill = 0): Grid => ({ h, w, data: new Float32Array(h * w).fill(fill) });
export const clone = (g: Grid): Grid => ({ ...g, data: g.data.slice() });
