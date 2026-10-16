"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { type CardData, toGrid } from "@/lib/algos/card";
import { GridCanvas } from "./grid-canvas";

/** A live page as a card: its sample input → output and final overlays, precomputed at build time. */
export function AlgoCard({ card }: { card: CardData }) {
  const { id, steps, shapes } = card;
  const input = useMemo(() => toGrid(card.input), [card.input]);
  const output = useMemo(() => toGrid(card.output), [card.output]);

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
      <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-accent">{card.topic}</p>
      <h3 className="mt-1 text-lg font-semibold leading-snug">{card.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{card.ref}</p>
      <p className="mt-auto flex items-center justify-between pt-3 font-mono text-xs text-muted-foreground">
        {steps} steps
        <span className="text-accent transition group-hover:translate-x-0.5">Open →</span>
      </p>
    </Link>
  );
}
