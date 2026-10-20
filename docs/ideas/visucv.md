# VisuCV — computer vision, step by step

## Problem Statement
How might we help aspiring CV engineers build real intuition for CV algorithms by letting them
step through each algorithm on a small image and watch the matching pseudocode line light up —
the way VisuAlgo does for data structures and algorithms?

## Recommended Direction
A statically exported Next.js 16 + React 19 + TypeScript + Tailwind 4 site (same stack as the
author's flashcard app), no backend. 2-D pixel grids draw on <canvas>; pages where 3-D shows
something 2-D can't (height maps, cameras, epipolar geometry) use Three.js via react-three-fiber,
loaded only on those pages. Each algorithm page has the demo on the left
(small pixel grid, parameter controls, step/play/scrub player) and pseudocode on the right with
the current line highlighted plus a box of live variables.

Each algorithm is one typed module in `lib/algos/` implementing `Algorithm` (`lib/algos/types.ts`):
`meta`, `params`, `pseudocode`, `sampleInput`, `run`, `steps`. The shared `components/player.tsx`
drives any module, so a new page = one module + one entry in `lib/algos/index.ts` + a test. `run()` is kept separate
so a later pipeline playground (chain ops on a photo) and challenge mode (match the target) can
reuse it for free.

Prior art covers single topics only (Setosa image kernels, CNN Explainer, TF Playground);
nobody covers the CV curriculum VisuAlgo-style.

## Key Assumptions to Validate
- [ ] Stepping (not just sliders) is what makes it click — post the morphology page to
  r/computervision; do people use step/play?
- [ ] Pseudocode is enough — after using a page, can you implement it in NumPy unaided?
- [ ] Sustainable on free time — page #2 should take ≤ half the time of page #1.
- [ ] Deep-learning toys are feasible in plain JS — deferred, not promised.

## MVP Scope
The MVP follows the roadmap: its first four groups, which are the book's classical 2-D part
(Ch. 3–15). Built in this order. The roadmap (`topics` in `lib/algos/index.ts`, shown on the
home page) is the single source of order: change the order there first, then here.

| # | Group | Page | Book | Status |
|---|---|---|---|---|
| 1 | Binary images | Thresholding & Otsu | Ch 3 | ✅ |
| 2 | Binary images | Erosion, Dilation, Opening & Closing | Ch 3 | ✅ |
| 3 | Binary images | Flood fill & Connected components | Ch 4 | ✅ |
| 4 | Shape | Image moments & orientation | Ch 5–6 | ✅ |
| 5 | Shape | Distance transforms | Ch 7 | ✅ |
| 6 | Geometry | Geometric transforms | Ch 8 | ✅ |
| 7 | Geometry | Bilinear interpolation & inverse mapping | Ch 9 | ✅ |
| 8 | Filtering | Convolution vs correlation | Ch 10 | ✅ |
| 9 | Filtering | Gaussian smoothing as a height map | Ch 11 | ✅ |
| 10 | Filtering | Edge detection (Sobel, Canny) | Ch 12 | ✅ |
| 11 | Filtering | Median, min/max & bilateral filters | Ch 14 | ✅ |
| 12 | Filtering | Fourier transform & frequency filtering | Ch 15 | ✅ |

The MVP ends with the Filtering group. Features & motion, 3-D vision and Deep learning come after,
in the same roadmap order:

| # | Group | Page | Book | Status |
|---|---|---|---|---|
| 13 | Features & motion | Harris corners (with Shi-Tomasi) | Ch 20 | ✅ |
| 14 | Features & motion | Optical flow (Lucas–Kanade) | Ch 21 | ✅ |
| 15 | Features & motion | RANSAC | Ch 23 | ✅ |
| 16 | 3-D vision | Pinhole camera & image formation | Ch 16 | ✅ |
| 17 | 3-D vision | Epipolar geometry | — | ✅ |

## Not Doing (and Why)
- Running user code / Pyodide — pseudocode chosen; saves ~10 MB and complexity.
- Accounts / server-side progress — no users yet. (Visited pages are remembered in this browser only, via `lib/progress.ts`.)
- Deep-learning pages — prove the format on classical CV first.
- Real photos on the step-through pages — small grids are what make stepping readable. (Photos, samples or
  your own, live in the separate Photograph lab at `/photo`, which runs the filters without stepping.)
- Pipeline playground — a later layer on top of `run()`. (Small try-it challenges exist on four pages, via `Algorithm.challenge`.)
- Post-MVP groups (features, 3-D, deep learning) — until the 12 classical pages ship.
- Hough transform (§12.4) and Laplacian / LoG zero crossings (Ch. 13) — different algorithms from Canny; candidates for their own pages after the MVP.

## Open Questions
- Is the name free? Check GitHub `visucv` and .com/.dev/.io before publishing.
- Hosting: live on Vercel at https://visucv.vercel.app (deploys `main` on push).
