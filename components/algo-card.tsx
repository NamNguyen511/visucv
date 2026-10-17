"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
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
      className="group flex flex-col overflow-hidden rounded-2xl sm:flex-row border border-border bg-card transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
    >
      <div className="pointer-events-none grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-border bg-background/60 p-4 sm:w-[46%] sm:shrink-0 sm:border-b-0 sm:border-r">
        <GridCanvas title="input" grid={input} />
        <ArrowRight className="mt-4 size-4 text-muted-foreground" />
        <div className="min-w-0 motion-safe:group-hover:animate-[develop_700ms_ease-out]">
          <GridCanvas title="output" grid={output} shapes={shapes} />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="font-mono text-[11px] uppercase tracking-widest text-accent">{card.topic}</p>
        <h3 className="mt-1 text-lg font-semibold leading-snug">{card.title}</h3>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">{card.hook}</p>
        <p className="mt-auto flex items-center justify-between border-t border-border pt-3 font-mono text-xs text-muted-foreground">
          <span title={card.ref}>{card.chapter} · {steps} steps</span>
          <span className="inline-flex items-center gap-1 text-accent">
            Explore <ArrowUpRight className="size-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
        </p>
      </div>
    </Link>
  );
}
