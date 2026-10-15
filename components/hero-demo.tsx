"use client";
// Home-page hero: the real morphology engine on a loop, not a recording.
import { useEffect, useMemo, useRef, useState } from "react";
import { algorithms } from "@/lib/algos";
import { defaultParams } from "@/lib/algos/types";
import { stepsDue } from "@/lib/playback";
import { GridCanvas } from "./grid-canvas";

const SPEED = 120; // steps/s

export function HeroDemo() {
  const algo = algorithms.morphology;
  const { frames, titles } = useMemo(() => {
    const p = defaultParams(algo);
    return { frames: [...algo.steps(algo.sampleInput(p), p)], titles: algo.panelTitles(p) };
  }, [algo]);
  const [idx, setIdx] = useState(0);
  const pos = useRef(0);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIdx(frames.length - 1); // show the finished result, no motion
      return;
    }
    // rAF already stops while the tab is hidden; the jump on return just skips ahead in the loop.
    let raf = 0, prev = performance.now(), carry = 0;
    const tick = (now: number) => {
      const due = stepsDue(carry, now - prev, SPEED);
      carry = due.carry;
      prev = now;
      if (due.n) {
        pos.current = (pos.current + due.n) % frames.length;
        setIdx(pos.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frames]);

  const f = frames[idx];
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm" data-step={idx} aria-label="Live demo: opening a binary image">
      <div className="grid grid-cols-3 gap-2">
        {f.grids.map((g, k) => (
          <GridCanvas key={k} title={titles[k]} grid={g}
                      read={k === f.src ? f.read : undefined} write={k === f.dst ? f.write : undefined} />
        ))}
      </div>
      <div className="mt-3 overflow-hidden rounded-lg bg-highlight px-3 py-2 font-mono text-[12px] leading-5">
        <div className="truncate">{algo.pseudocode[f.line].trim()}</div>
        <div className="truncate text-muted-foreground">
          {Object.entries(f.vars).map(([k, v]) => `${k} = ${v}`).join("   ")}
        </div>
      </div>
    </div>
  );
}
