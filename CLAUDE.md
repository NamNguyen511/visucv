# VisuCV — computer vision, step by step

VisuAlgo-style step-through visualizations of CV algorithms. Idea and scope: `docs/ideas/visucv.md`.

## Commands
- `npm run dev` — dev server. Restart it after adding a page (`dynamicParams = false` freezes the page list).
- `npm test` — Vitest unit tests (`lib/**/*.test.ts`).
- `npm run test:e2e` — builds the static export, then Playwright on desktop / phone / narrow-1× windows.
- `npm run build` — static export to `out/`.

## Adding an algorithm page
Build the next unbuilt page in `topics` order (`lib/algos/index.ts`); the MVP is the first four groups
(table in `docs/ideas/visucv.md`).
1. `lib/algos/<id>.ts` implementing `Algorithm` (`lib/algos/types.ts`).
2. Register it in `lib/algos/index.ts` (both `algorithms` and its `topics` entry).
3. `lib/algos/<id>.test.ts`: check `run()` against a brute-force or hand-checked answer, and that the last step equals `run()`.
4. Write `meta.lead`, `meta.hook` and `explain` (book notation). Budget, enforced by `lib/algos/explain.test.ts`:
   lead = one sentence ≤ 25 words; hook (home card) ≤ 8 words; 2–4 ideas (bold term + ≤ 22 words); 2–3 "try this" items that
   name a control. Formulas are KaTeX TeX; split multi-part formulas into stacked lines
   (`\begin{gathered}…\\…\end{gathered}`); e2e fails if any formula needs sideways scrolling on a phone.
The player, home-page card and e2e smoke tests pick the page up automatically.

## Conventions
- Pixels draw as literal intensity: 0 = black, 1 = white, in every theme. NaN = "not computed yet".
- Label images set `Grid.labels`: 0 = background, -1 = unlabeled foreground (white), k ≥ 1 = palette colour.
- A param that changes the sample image sets `input: true`; the player regenerates the input only for those.
- Vector overlays (points, lines, ellipses) go in `Step.shapes`, drawn on the `dst` panel unless `panel` is set.
- Pseudocode is Python-style (`def`, `for p in pixels(I):`, `# comments`), one line per step `line` index;
  aim for ≤ 44 characters so lines rarely wrap on phones (long ones wrap under their own code).
- A page may set `challenge` (prompt, hint, pure `solved(p, out, input)`): it must be unsolved by the defaults;
  add its solving settings and near misses to `lib/algos/challenge.test.ts`.
- Window-based pages fill `Step.window` (values under the kernel, "" outside it) for the "Inside the kernel" box.
- Home cards (path stops, outcome pairs) are computed at build time (`lib/algos/card.ts`). Only the hero runs
  algorithms in the browser, and only the four modules its chips import (not the whole registry).
- Photograph lab (`lib/photo.ts`, `/photo`) calls the plain filter functions, never `steps()`; photos reach
  ~150k pixels, so no `Math.max(...array)` spreads on image data (argument limit). Photos must be public domain/CC0,
  credited in `public/photos/CREDITS.md`.
- Learning progress lives in `localStorage` via `lib/progress.ts` (guarded; read after mount).
- Grid tracks that hold canvases or truncated text use `minmax(0, 1fr)`, never a bare auto column.
- Three.js only on pages where 3-D shows something 2-D can't; it's lazy-loaded.

## After building a feature
Before reporting a feature as done, run the `bug-hunter` agent (`.claude/agents/bug-hunter.md`) on the change
and fix what it confirms. It hunts the bug classes earlier sessions shipped and later had to fix.
