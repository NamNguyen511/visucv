"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { algorithms } from "@/lib/algos";
import { defaultParams } from "@/lib/algos/types";
import { GridCanvas } from "./grid-canvas";

/** A live page as a card: its own sample input → output, drawn by its own run(). */
export function AlgoCard({ id }: { id: string }) {
  const algo = algorithms[id];
  const { input, output, shapes, steps } = useMemo(() => {
    const p = defaultParams(algo);
    const input = algo.sampleInput(p);
    let steps = 0, last;
    for (const s of algo.steps(input, p)) { steps++; last = s; }
    return { input, output: algo.run(input, p), shapes: last?.shapes, steps };
  }, [algo]);

  return (
    <Link
      href={`/algo/${id}`}
      className="group flex flex-col rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
    >
      <div className="pointer-events-none grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <GridCanvas title="input" grid={input} />
        <ArrowRight className="mt-4 size-4 text-muted-foreground" />
        <GridCanvas title="output" grid={output} shapes={shapes} />
      </div>
      <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-accent">{algo.meta.topic}</p>
      <h3 className="mt-1 text-lg font-semibold leading-snug">{algo.meta.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{algo.meta.ref}</p>
      <p className="mt-auto flex items-center justify-between pt-3 font-mono text-xs text-muted-foreground">
        {steps} steps
        <span className="text-accent transition group-hover:translate-x-0.5">Open →</span>
      </p>
    </Link>
  );
}
