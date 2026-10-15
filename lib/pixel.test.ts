import { expect, it } from "vitest";
import { LABEL_COLORS, labelColor, pixelColor } from "./pixel";

// Regression: pixels used to blend toward the theme's text colour, so in light mode a bright pixel
// drew dark (white specks showed black, Gaussian hills looked like pits).
it("draws literal intensity: 0 black, 1 white, gray in between; NaN is a placeholder", () => {
  expect(pixelColor(0)).toBe("rgb(0, 0, 0)");
  expect(pixelColor(1)).toBe("rgb(255, 255, 255)");
  expect(pixelColor(170 / 255)).toBe("rgb(170, 170, 170)");
  expect(pixelColor(NaN)).toBeNull();
  expect(pixelColor(1.2)).toBe("rgb(255, 255, 255)");
});

it("label colours: background black, unlabeled foreground white, labels distinct and cycling", () => {
  expect(labelColor(0)).toBe("rgb(0, 0, 0)");
  expect(labelColor(-1)).toBe("rgb(255, 255, 255)");
  expect(new Set(LABEL_COLORS.map((_, i) => labelColor(i + 1))).size).toBe(LABEL_COLORS.length);
  expect(labelColor(LABEL_COLORS.length + 1)).toBe(labelColor(1));
  expect(labelColor(NaN)).toBeNull();
});
