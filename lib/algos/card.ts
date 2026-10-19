// Home-page card data, computed once at build time (the home page is a server component), so the
// browser never runs every algorithm just to draw thumbnails and count steps.
import { algorithms } from ".";
import { type Grid, type GridData, type Shape, type Step, defaultParams } from "./types";

export type CardData = {
  id: string; title: string; topic: string; ref: string; hook: string; chapter: string; steps: number;
  input: GridData; output: GridData; shapes: Shape[];
};

const plain = (g: Grid): GridData => ({ h: g.h, w: g.w, data: [...g.data], labels: g.labels });

/** "Birchfield, Ch. 5 — … · Ch. 6 — …" → "Ch. 5–6". */
export function chapter(ref: string) {
  const n = [...ref.matchAll(/Ch\. (\d+)/g)].map(m => m[1]);
  return n.length > 1 ? `Ch. ${n[0]}–${n.at(-1)}` : `Ch. ${n[0]}`;
}

export function cardData(id: string): CardData {
  const algo = algorithms[id], p = defaultParams(algo), input = algo.sampleInput(p);
  let steps = 0, last: Step | undefined;
  for (const s of algo.steps(input, p)) { steps++; last = s; }
  const lastPanel = (last?.grids.length ?? 1) - 1;
  return {
    id, title: algo.meta.title, topic: algo.meta.topic, ref: algo.meta.ref, hook: algo.meta.hook, chapter: chapter(algo.meta.ref), steps,
    input: plain(input), output: plain(algo.run(input, p)),
    shapes: last?.shapes?.filter(s => (s.panel ?? last.dst) === lastPanel) ?? [],
  };
}
