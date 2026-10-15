/** Canvas colour for a pixel value: literal intensity, 0 = black, 1 = white, in every theme.
 *  NaN ("not computed yet") returns null so the caller can draw a placeholder. */
export function pixelColor(v: number): string | null {
  if (Number.isNaN(v)) return null;
  const c = Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${c}, ${c}, ${c})`;
}
