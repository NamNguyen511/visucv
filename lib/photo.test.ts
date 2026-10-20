import { describe, expect, it } from "vitest";
import { type Grid, grid } from "./algos/types";
import { FILTERS, applyFilter, defaults, toGray } from "./photo";

// A photo-sized test image (384×384 ≈ 147k pixels): big arrays must not hit argument limits.
const N = 384;
const photo = (): Grid => {
  const g = grid(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g.data[y * N + x] = (x > 150 && x < 250 && y > 100 && y < 300 ? 0.8 : 0.2) + 0.05 * Math.sin(x / 7) * Math.cos(y / 5);
  return g;
};

describe("photograph lab", () => {
  it("gray conversion uses OpenCV's BT.601 weights", () => {
    const rgba = Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 200, 100, 50, 255]);
    const g = toGray(rgba, 4, 1);
    expect([...g.data].map(v => +v.toFixed(4))).toEqual([0.299, 0.587, 0.114, +((0.299 * 200 + 0.587 * 100 + 0.114 * 50) / 255).toFixed(4)]);
  });

  it("every filter, at every option of every knob, runs on a full-size photo, keeps its size and stays drawable", () => {
    const I = photo();
    for (const f of FILTERS)
      for (const p of [defaults(f), ...f.params.flatMap(k => k.options.map(o => ({ ...defaults(f), [k.key]: o })))]) {
        const t = performance.now(), { shown } = applyFilter(I, f.id, p), what = `${f.id} ${JSON.stringify(p)}`;
        expect(performance.now() - t, what).toBeLessThan(3000); // the browser is faster; this guards a step-per-pixel slip
        expect(shown.data.length, what).toBe(N * N);
        expect(shown.data.every(v => Number.isFinite(v) && (shown.labels ? v >= 0 : v >= 0 && v <= 1)), what).toBe(true);
      }
  });

  it("every knob is a real option list with its default in it", () => {
    for (const f of FILTERS) for (const k of f.params) expect(k.options, `${f.id}.${k.key}`).toContain(k.default);
  });

  it("Otsu splits the bright box from the background; the binary filters work on that split", () => {
    const I = photo(), t = applyFilter(I, "otsu").shown;
    expect(t.data[200 * N + 200]).toBe(1);
    expect(t.data[10 * N + 10]).toBe(0);
    const L = applyFilter(I, "components", { conn: 4, minSize: 1 }).shown;
    expect(L.labels).toBe(true);
    expect(new Set(L.data).size).toBe(2); // background + the one box
    const D = applyFilter(I, "distance", { metric: "chessboard", shading: "smooth" }).shown;
    expect(D.data[200 * N + 200]).toBeGreaterThan(D.data[102 * N + 200]); // deeper inside = brighter
    const E = applyFilter(I, "morphology", { op: "erode", size: 7, shape: "square" }).shown;
    expect(E.data[101 * N + 200]).toBe(0); // the box's edge row erodes away
    expect(E.data[200 * N + 200]).toBe(1);
  });

  it("components: the size filter drops small blobs and renumbers the rest from 1", () => {
    const A = grid(10, 10);
    for (const k of [0, 1, 10, 11, 55, 99]) A.data[k] = 1; // a 2×2 blob and two single pixels
    const big = applyFilter(A, "components", { conn: 8, minSize: 2 }).shown.data;
    expect([...new Set(big)].sort()).toEqual([0, 1]);
  });

  it("Canny finds the box outline and nothing in the flat inside; Harris finds its 4 corners", () => {
    const I = photo(), e = applyFilter(I, "edges").shown.data;
    expect([...e.slice(195 * N + 140, 195 * N + 160)].some(v => v === 1)).toBe(true); // crosses x ≈ 150
    expect(e[200 * N + 200]).toBe(0);
    const c = applyFilter(I, "corners").corners!;
    for (const [cy, cx] of [[101, 151], [101, 249], [299, 151], [299, 249]])
      expect(c.some(([y, x]) => Math.abs(y - cy) <= 2 && Math.abs(x - cx) <= 2), `${cx},${cy}`).toBe(true);
  });

  it("Harris corners are whole pixel cells (a 2×2 blob's plateau centre is fractional)", () => {
    const g = grid(40, 40);
    for (const k of [20 * 40 + 20, 20 * 40 + 21, 21 * 40 + 20, 21 * 40 + 21]) g.data[k] = 1;
    const c = applyFilter(g, "corners").corners!;
    expect(c.length).toBeGreaterThan(0);
    for (const [y, x] of c) expect(Number.isInteger(y) && Number.isInteger(x), `${y},${x}`).toBe(true);
  });
});
