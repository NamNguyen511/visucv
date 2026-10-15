/** Whole steps to advance after `dtMs` at `speed` steps/s, plus the leftover fraction. */
export function stepsDue(carry: number, dtMs: number, speed: number) {
  // rAF timestamps are frame start times and can precede the clock read when play began.
  const total = carry + (Math.max(0, dtMs) / 1000) * speed;
  const n = Math.floor(total);
  return { n, carry: total - n };
}
