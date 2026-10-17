# VisuCV — computer vision, step by step

Interactive, step-through visualizations of computer vision algorithms. Each page runs one
algorithm on a small image; you step, play or scrub through it while the pseudocode line for
every step lights up beside it.

## Why this exists

I found Stan Birchfield's *Introduction to Computer Vision* really interesting while working
through it, but some ideas only clicked once I could watch them run step by step. So I started
building interactive visualizations to understand them better, and this site is the result. I'm
learning alongside it.

## Live pages

| Page | Book chapter |
|---|---|
| Thresholding & Otsu's Method | Ch. 3 |
| Erosion, Dilation, Opening & Closing | Ch. 3 |
| Flood Fill & Connected Components | Ch. 4 |
| Image Moments & Orientation | Ch. 5–6 |
| Distance Transforms | Ch. 7 |
| Geometric Transforms | Ch. 8 |
| Bilinear Interpolation & Inverse Mapping | Ch. 9 |
| Convolution vs Correlation | Ch. 10 |
| Gaussian Smoothing as a Height Map | Ch. 11 |
| Edge Detection: Sobel & Canny | Ch. 12 |
| Median, Min/Max & Bilateral Filters | Ch. 14 |
| Fourier Transform & Frequency Filtering | Ch. 15 |
| Harris & Shi-Tomasi Corners | Ch. 20 |

More are on the roadmap (see the home page).

**Photograph lab** (`/photo`): the same algorithms on a real photo (samples or your own, processed in
your browser only), with an inspector that shows every number behind one pixel.

## Credit

VisuCV is based on
[*Introduction to Computer Vision: Lecture notes with working Python code*](https://sbirchfield.github.io/cvintro/)
by Stan Birchfield (NVIDIA / University of Washington, 2026), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

- **Taken from the book:** the page order follows its chapters, each page's reference line uses
  the chapter title unchanged, and the formulas, equation numbers, sample-image ideas and
  exercises follow the book.
- **Changed:** the visualizations, step-through pseudocode and TypeScript implementations are
  VisuCV's own work, not the book's Python code.
- This is an unofficial project, not affiliated with or endorsed by the author.

Sample photographs come from scikit-image: astronaut Eileen Collins (NASA, public domain), Chelsea the
cat (Stéfan van der Walt, CC0) and "camera" (Lav Varshney, CC0). See `public/photos/CREDITS.md`.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests
npm run test:e2e   # build + browser smoke tests
```

Built with Next.js (static export), React, TypeScript, Tailwind, and Three.js for 3-D views.
