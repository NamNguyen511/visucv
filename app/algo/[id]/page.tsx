import type { Metadata } from "next";
import { Player } from "@/components/player";
import { algorithms } from "@/lib/algos";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(algorithms).map(id => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/algo/[id]">): Promise<Metadata> {
  const { meta } = algorithms[(await params).id];
  return { title: meta.title, description: meta.blurb };
}

export default async function AlgoPage({ params }: PageProps<"/algo/[id]">) {
  const { id } = await params;
  const { meta } = algorithms[id];
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-widest text-accent">{meta.topic}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{meta.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{meta.ref}</p>
      <p className="mt-3 max-w-3xl">{meta.blurb}</p>
      <Player id={id} />
    </>
  );
}
