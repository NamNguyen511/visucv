import { describe, expect, it } from "vitest";
import { filter2d, KERNELS } from "./algos/convolution";
import { gradient } from "./algos/edges";
import { type Grid, grid } from "./algos/types";
import { FILTERS, applyFilter, inspect, toGray } from "./photo";

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

  it("every filter runs on a full-size photo and keeps its size", () => {
    const I = photo();
    for (const { id } of FILTERS) {
      const f = applyFilter(I, id);
      expect(f.shown.data.length, id).toBe(N * N);
      expect(f.raw.length, id).toBe(N * N);
    }
  });

  it("inspector: value × weight products sum to the filter's own output (sharpen, Sobel x)", () => {
    const I = photo(), [y, x] = [100, 150];
    const s = inspect(I, applyFilter(I, "sharpen"), "sharpen", y, x);
    expect(s.products!.reduce((a, p) => a + p.product, 0)).toBeCloseTo(filter2d(I, KERNELS.sharpen, "correlation", "replicate")[y * N + x], 9);
    const e = inspect(I, applyFilter(I, "edges"), "edges", y, x), g = gradient(I, "Sobel");
    expect(e.products!.reduce((a, p) => a + p.product, 0)).toBeCloseTo(g.ix[y * N + x], 9);
    expect(e.out).toBeCloseTo(g.mag[y * N + x], 9);
  });

  it("Otsu splits the bright box from the background; Harris finds its 4 corners", () => {
    const I = photo(), t = applyFilter(I, "otsu");
    expect(t.shown.data[200 * N + 200]).toBe(1);
    expect(t.shown.data[10 * N + 10]).toBe(0);
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
