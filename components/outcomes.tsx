"use client";
// "What you'll be able to see": three real before/after pairs, from the precomputed card data.
import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CardData } from "@/lib/algos/card";
import { toGrid } from "@/lib/algos/types";
import { GridCanvas } from "./grid-canvas";

function Pair({ title, card }: { title: string; card: CardData }) {
  const [input, output] = useMemo(() => [toGrid(card.input), toGrid(card.output)], [card]);
  return (
    <Link href={`/algo/${card.id}`} className="group rounded-2xl border border-border bg-card p-4 transition hover:border-accent">
      <p className="font-semibold">{title}</p>
      <div className="pointer-events-none mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <GridCanvas title="before" grid={input} />
        <ArrowRight aria-hidden className="mt-4 size-4 text-muted-foreground" />
        <GridCanvas title="after" grid={output} shapes={card.shapes} />
      </div>
      <p className="mt-2 font-mono text-xs text-muted-foreground">{card.title} · {card.chapter}</p>
    </Link>
  );
}

export function Outcomes({ pairs }: { pairs: { title: string; card: CardData }[] }) {
  return (
    <section className="mt-16" aria-labelledby="outcomes">
      <h2 id="outcomes" className="font-mono text-xs uppercase tracking-widest text-accent">What you&apos;ll be able to see</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {pairs.map(p => <Pair key={p.card.id} {...p} />)}
      </div>
    </section>
  );
}
