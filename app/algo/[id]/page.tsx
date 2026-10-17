import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import "katex/dist/katex.min.css";
import { Explainer } from "@/components/explainer";
import { Player } from "@/components/player";
import { algorithms, topics } from "@/lib/algos";

// Live pages in roadmap order, for previous / next.
const order = topics.flatMap(t => t.items).filter(i => i.id).map(i => i.id!);

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(algorithms).map(id => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/algo/[id]">): Promise<Metadata> {
  const { meta } = algorithms[(await params).id];
  return { title: meta.title, description: meta.lead };
}

export default async function AlgoPage({ params }: PageProps<"/algo/[id]">) {
  const { id } = await params;
  const { meta, explain } = algorithms[id];
  const k = order.indexOf(id), prev = algorithms[order[k - 1]], next = algorithms[order[k + 1]];
  const nav = "group flex max-w-[48%] flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 hover:border-accent";
  return (
    <>
      <Link href="/#algorithms" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> All algorithms
      </Link>
      <p className="mt-4 font-mono text-xs uppercase tracking-widest text-accent">{meta.topic}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{meta.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{meta.ref}</p>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed">{meta.lead}</p>
      <Player id={id} />
      <Explainer explain={explain} />
      <nav aria-label="More algorithms" className="mt-10 flex justify-between gap-4 border-t border-border pt-6">
        {prev ? (
          <Link href={`/algo/${prev.meta.id}`} className={nav} rel="prev">
            <span className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-muted-foreground"><ArrowLeft aria-hidden className="size-3.5" /> Previous</span>
            <span className="font-semibold">{prev.meta.title}</span>
          </Link>
        ) : <span />}
        {next && (
          <Link href={`/algo/${next.meta.id}`} className={`${nav} items-end text-right`} rel="next">
            <span className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Next <ArrowRight aria-hidden className="size-3.5" /></span>
            <span className="font-semibold">{next.meta.title}</span>
          </Link>
        )}
      </nav>
    </>
  );
}
