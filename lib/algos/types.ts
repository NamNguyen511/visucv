// The contract every algorithm page implements. The player only knows these types.

/** Row-major image. Binary images use 0/1, gray images 0..1. NaN = "not computed yet". */
export type Grid = { h: number; w: number; data: Float32Array };
export type Cell = [y: number, x: number];

export type Param = { key: string; label: string; options: (string | number)[]; default: string | number };
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
};

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
  meta: { id: string; title: string; topic: string; ref: string; blurb: string };
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
export const clone = (g: Grid): Grid => ({ h: g.h, w: g.w, data: g.data.slice() });
