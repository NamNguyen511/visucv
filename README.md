# VisuCV — computer vision, step by step

Interactive, step-through visualizations of computer vision algorithms. Each page runs one
algorithm on a small image; you step, play or scrub through it while the pseudocode line for
every step lights up beside it.

Live pages: thresholding & Otsu, erosion / dilation / opening / closing, flood fill & connected
components, image moments & orientation, distance transforms, geometric transforms, bilinear
interpolation & inverse mapping, and Gaussian smoothing as a 3-D height map. More on the roadmap (see the home page).

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests
npm run test:e2e   # build + browser smoke tests
```

Built with Next.js (static export), React, TypeScript, Tailwind, and Three.js for 3-D views.
