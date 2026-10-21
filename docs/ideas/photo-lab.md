# Photograph Lab: "what does my photo become?"

## Problem Statement
How might we let someone apply VisuCV's algorithms to a real photo and judge the result against the original at a glance?

## Recommended Direction
A before | after bench. Each photo-sized algorithm is a live thumbnail of the current photo, and those thumbnails are the picker. The chosen algorithm's result sits next to the colour original, at full size and always visible. A wipe mode puts a split over the gray original for subtle filters, with Fit or 4× zoom. Each algorithm brings its step-through page's knobs, and a link goes back to that page.

The per-pixel inspector ("Inside one pixel") was cut. Explaining one pixel is the step-through pages' job, on grids small enough to read. On the photo page it took half the screen away from the comparison.

## Ideas considered (judged against the criterion)
- **Before | after bench**, 8/10: hits the criterion head-on. It shows one algorithm at a time.
- **Recipe pipeline**, 4/10 for now: blurs which step did what. It's also the Lovable Playground, which stays parked until asked.
- **Contact sheet**, 5/10 as the lab and 9/10 as the picker: thumbnails are too small to compare with, so they became the bench's menu.

## Key Assumptions to Validate
- [ ] Side by side at about 650 px per pane is big enough. Check on a laptop screen with the cat at 384 px.
- [ ] The binary algorithms are still meaningful on Otsu's split of a photo. If not, add a threshold knob.
- [ ] The main thread stays responsive at 384 px. The bilateral 5×5 is the slowest; time it.

## MVP Scope (shipped)
Grayscale, Otsu, morphology, connected components, distance transform, Gaussian blur, convolution kernels, Canny, median/min/max/bilateral and Harris. Knobs come from each algorithm's page (Convolution starts on sharpen, which suits a photo better than the page's Sobel x).

## Not Doing (and Why)
- Optical flow, RANSAC, pinhole, epipolar: they need two frames, a point set or a 3-D scene, not one photo.
- Moments: the result is one ellipse, not a picture.
- Fourier: `dft2` is square-only and O(n³), so it needs padding and a speed check first.
- Geometric transforms: a rotated photo is a weak "what does it become".
- The per-pixel inspector: the step-through pages already do it better.

## Pipeline (2026-10-21)
The bench became a pipeline: a gray input, then stages in order, each with its own knobs and a thumbnail. The
selected stage shows its input next to its output. Stages declare what they read (`needs`: gray or binary) and
what they give (`gives`); a binary stage on a gray image is blocked with an "Add Otsu threshold before it" button
instead of the old silent Otsu. Labels, corner lists and signed kernels end the chain. Distance passes on plain
d / max, not its banded picture. Upstream results are reused, so a knob only recomputes downstream.
Not doing yet: drag-and-drop (arrow buttons instead), running a page's step-through on a stage's real input,
"builds on / used by" links, saving or sharing pipelines.
