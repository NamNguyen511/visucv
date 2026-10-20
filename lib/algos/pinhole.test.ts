import { describe, expect, it } from "vitest";
import { type P3, pinhole as ph, project, scene } from "./pinhole";
import type { Shape } from "./types";

const C = 10;
describe("pinhole projection", () => {
  it("x = f·X/Z + cx; doubling the depth halves the offset from the centre", () => {
    expect(project([2, -3, 6], 6)).toEqual([12, 7]);
    const [a] = project([4, 0, 10], 6), [b] = project([4, 0, 20], 6);
    expect(a - C).toBeCloseTo(2 * (b - C), 12);
  });

  it("every point on one ray through the pinhole lands on the same pixel (depth is lost)", () => {
    const q: P3 = [1, 2, 5];
    for (const k of [2, 3, 7]) expect(project([k * q[0], k * q[1], k * q[2]], 8)).toEqual(project(q, 8));
  });

  it("posts: equal heights, the post twice as far is half as tall in the image", () => {
    const P = scene("posts"), height = (Z: number) => {
      const ys = P.filter(p => p[2] === Z).map(p => project(p, 6)[1]);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(height(10)).toBeCloseTo(2 * height(20), 12);
  });

  it("rails converge on the principal point under perspective, keep a constant gap under weak perspective", () => {
    const P = scene("rails"), zbar = P.reduce((s, p) => s + p[2], 0) / P.length;
    const gap = (Z: number, z?: number) => project([3, 4, Z], 6, z)[0] - project([-3, 4, Z], 6, z)[0];
    expect(gap(35)).toBeLessThan(gap(5) / 5);
    const [x, y] = project([3, 4, 1e9], 6);
    expect(x).toBeCloseTo(C, 6); expect(y).toBeCloseTo(C, 6); // the vanishing point
    expect(gap(35, zbar)).toBeCloseTo(gap(5, zbar), 12);
  });

  // Regression: the try-this text said the rails "stay parallel" under weak perspective; on the real
  // output each rail (a line along Z) collapses to a single pixel, since Z no longer moves x or y.
  it("weak perspective: each rail collapses to one pixel; the posts come out equally tall", () => {
    const lit = (scene_: string, f: number) => {
      const p = { scene: scene_, f, model: "weak perspective" }, g = ph.run(ph.sampleInput(p), p);
      return [...g.data.keys()].filter(i => g.data[i]).map(i => [i % g.w, Math.floor(i / g.w)]);
    };
    for (const f of [4, 6, 8]) expect(lit("rails", f)).toHaveLength(2);
    expect(ph.explain.tryThis.join(" ")).not.toMatch(/parallel/);
    const posts = lit("posts", 6), col = (x: number) => posts.filter(q => q[0] === x).length;
    expect(new Set(posts.map(q => q[0])).size).toBe(2);
    expect(col(posts[0][0])).toBe(posts.length / 2);
  });

  // Regression: for points nearer than f (rails at Z = 3, 5) the ray stopped at the point, so the
  // plane-crossing marker floated off it, beyond the ray's end.
  it("the drawn ray passes through both the scene point and its plane-crossing marker", () => {
    const on = (l: Shape, x: number, y: number) => {
      if (l.kind !== "line") throw new Error("not a line");
      const t = Math.abs(l.x2 - l.x1) > Math.abs(l.y2 - l.y1) ? (x - l.x1) / (l.x2 - l.x1) : (y - l.y1) / (l.y2 - l.y1);
      return t > -1e-9 && t < 1 + 1e-9 && Math.abs(l.x1 + t * (l.x2 - l.x1) - x) < 1e-9 && Math.abs(l.y1 + t * (l.y2 - l.y1) - y) < 1e-9;
    };
    for (const scene_ of ["rails", "posts", "cube"]) for (const model of ["perspective", "weak perspective"]) for (const f of [4, 6, 8]) {
      const p = { scene: scene_, f, model };
      for (const s of ph.steps(ph.sampleInput(p), p)) if (s.line === 2) {
        const ray = s.shapes!.find(q => q.kind === "line" && q.thick)!, here = s.shapes![4], [[r, c]] = s.read;
        if (here.kind !== "point") throw new Error("no marker");
        expect(on(ray, here.x, here.y), `${scene_} ${model} f=${f} marker`).toBe(true);
        expect(on(ray, c, r), `${scene_} ${model} f=${f} point`).toBe(true);
      }
    }
  });

  it("scenes have no duplicate points", () => {
    for (const s of ["rails", "posts", "cube"]) {
      const P = scene(s);
      expect(new Set(P.map(p => p.join())).size, s).toBe(P.length);
    }
  });

  it("steps: setup, two per point, finish; the last image equals run()", () => {
    for (const scene_ of ["rails", "posts", "cube"]) for (const model of ["perspective", "weak perspective"]) for (const f of [4, 8]) {
      const p = { scene: scene_, f, model }, I = ph.sampleInput(p), all = [...ph.steps(I, p)];
      expect(all).toHaveLength(2 * scene(scene_).length + 2);
      expect(all.at(-1)!.grids[1].data).toEqual(ph.run(I, p).data);
      expect(all.every(s => s.line < ph.pseudocode.length)).toBe(true);
    }
  });
});
