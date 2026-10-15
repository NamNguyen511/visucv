/** Canvas colour for a pixel value: literal intensity, 0 = black, 1 = white, in every theme.
 *  NaN ("not computed yet") returns null so the caller can draw a placeholder. */
export function pixelColor(v: number): string | null {
  if (Number.isNaN(v)) return null;
  const c = Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${c}, ${c}, ${c})`;
}

// Distinct, bright on black, and none of them the amber/orange used for read/write overlays.
export const LABEL_COLORS = ["#2dd4bf", "#f472b6", "#38bdf8", "#a3e635", "#a78bfa", "#facc15", "#f87171", "#e5e7eb"];

/** Colour for a label-image value: 0 black, -1 white (unlabeled foreground), k ≥ 1 cycles the palette. */
export function labelColor(v: number): string | null {
  if (Number.isNaN(v)) return null;
  if (v === 0) return "rgb(0, 0, 0)";
  if (v < 0) return "rgb(255, 255, 255)";
  return LABEL_COLORS[(v - 1) % LABEL_COLORS.length];
}
