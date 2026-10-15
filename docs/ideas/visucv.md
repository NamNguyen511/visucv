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
Topic map + five pages: morphology (done first), thresholding + Otsu, flood fill / connected
components, convolution, bilinear interpolation (forward vs inverse mapping).

## Not Doing (and Why)
- Running user code / Pyodide — pseudocode chosen; saves ~10 MB and complexity.
- Accounts / progress tracking — no users yet.
- Deep-learning pages — prove the format on classical CV first.
- Image upload / real photos — small grids are what make stepping readable.
- Pipeline playground and challenge mode — later layers on top of `run()`.

## Open Questions
- Is the name free? Check GitHub `visucv` and .com/.dev/.io before publishing.
- Hosting: GitHub Pages when ready to share.
