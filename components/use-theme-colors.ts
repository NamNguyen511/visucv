"use client";
import { useEffect, useState } from "react";

const KEYS = ["pending", "kernel", "cursor", "accent"] as const;
export type ThemeColors = Record<(typeof KEYS)[number], string>;

const read = (): ThemeColors => {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(KEYS.map(k => [k, cs.getPropertyValue(`--${k}`).trim()])) as ThemeColors;
};

/** CSS colour tokens for canvas/WebGL drawing; re-read when the system theme flips. */
export function useThemeColors(): ThemeColors | null {
  const [colors, setColors] = useState<ThemeColors | null>(null);
  useEffect(() => {
    setColors(read());
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setColors(read());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return colors;
}
