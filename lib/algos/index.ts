import { gaussian } from "./gaussian";
import { morphology } from "./morphology";
import { otsu } from "./otsu";
import type { Algorithm } from "./types";

export const algorithms: Record<string, Algorithm> = {
  [morphology.meta.id]: morphology,
  [gaussian.meta.id]: gaussian,
  [otsu.meta.id]: otsu,
};

// Topic map. `id` set = page exists; no id = "coming soon".
export const topics: { name: string; items: { title: string; id?: string }[] }[] = [
  { name: "Binary images", items: [
    { title: "Thresholding & Otsu", id: "otsu" },
    { title: "Erosion, Dilation, Opening & Closing", id: "morphology" },
    { title: "Flood fill & Connected components" },
  ]},
  { name: "Shape", items: [
    { title: "Image moments & orientation" },
    { title: "Distance transforms" },
  ]},
  { name: "Geometry", items: [
    { title: "Geometric transforms" },
    { title: "Bilinear interpolation & inverse mapping" },
  ]},
  { name: "Filtering", items: [
    { title: "Convolution vs correlation" },
    { title: "Gaussian smoothing as a height map", id: "gaussian" },
    { title: "Edge detection (Sobel, Canny)" },
    { title: "Median, min/max & bilateral filters" },
    { title: "Fourier transform & frequency filtering" },
  ]},
  { name: "Features & motion", items: [
    { title: "Harris corners" },
    { title: "Optical flow (Lucas–Kanade)" },
    { title: "RANSAC" },
  ]},
  { name: "3-D vision", items: [
    { title: "Pinhole camera & image formation" },
    { title: "Epipolar geometry" },
    { title: "Structure from motion" },
  ]},
  { name: "Deep learning", items: [
    { title: "Convolution layers" },
    { title: "Pooling & receptive fields" },
  ]},
];
