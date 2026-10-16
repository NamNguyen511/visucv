import { components } from "./components";
import { convolution } from "./convolution";
import { distance } from "./distance";
import { edges } from "./edges";
import { fourier } from "./fourier";
import { gaussian } from "./gaussian";
import { momentsAlgo } from "./moments";
import { morphology } from "./morphology";
import { nonlinear } from "./nonlinear";
import { otsu } from "./otsu";
import { transforms } from "./transforms";
import { warping } from "./warping";
import type { Algorithm } from "./types";

export const algorithms: Record<string, Algorithm> = {
  [morphology.meta.id]: morphology,
  [gaussian.meta.id]: gaussian,
  [otsu.meta.id]: otsu,
  [components.meta.id]: components,
  [momentsAlgo.meta.id]: momentsAlgo,
  [distance.meta.id]: distance,
  [transforms.meta.id]: transforms,
  [warping.meta.id]: warping,
  [convolution.meta.id]: convolution,
  [edges.meta.id]: edges,
  [nonlinear.meta.id]: nonlinear,
  [fourier.meta.id]: fourier,
};

// Topic map. `id` set = page exists; no id = "coming soon".
export const topics: { name: string; items: { title: string; id?: string }[] }[] = [
  { name: "Binary images", items: [
    { title: "Thresholding & Otsu", id: "otsu" },
    { title: "Erosion, Dilation, Opening & Closing", id: "morphology" },
    { title: "Flood fill & Connected components", id: "components" },
  ]},
  { name: "Shape", items: [
    { title: "Image moments & orientation", id: "moments" },
    { title: "Distance transforms", id: "distance" },
  ]},
  { name: "Geometry", items: [
    { title: "Geometric transforms", id: "transforms" },
    { title: "Bilinear interpolation & inverse mapping", id: "warping" },
  ]},
  { name: "Filtering", items: [
    { title: "Convolution vs correlation", id: "convolution" },
    { title: "Gaussian smoothing as a height map", id: "gaussian" },
    { title: "Edge detection (Sobel, Canny)", id: "edges" },
    { title: "Median, min/max & bilateral filters", id: "nonlinear" },
    { title: "Fourier transform & frequency filtering", id: "fourier" },
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
