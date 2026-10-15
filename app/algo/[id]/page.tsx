import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import { Explainer } from "@/components/explainer";
import { Player } from "@/components/player";
import { algorithms } from "@/lib/algos";

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
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-widest text-accent">{meta.topic}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{meta.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{meta.ref}</p>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed">{meta.lead}</p>
      <Player id={id} />
      <Explainer explain={explain} />
    </>
  );
}
