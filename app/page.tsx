import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Collection } from "@/components/collection";
import { HeroDemo } from "@/components/hero-demo";
import { topics } from "@/lib/algos";
import { cardData } from "@/lib/algos/card";

export default function Home() {
  const cards = topics.flatMap(t => t.items).filter(i => i.id).map(i => cardData(i.id!));
  const soon = topics.flatMap(t => t.items.filter(i => !i.id).map(i => ({ topic: t.name, title: i.title })));
  const liveTopics = topics.filter(t => t.items.some(i => i.id)).map(t => t.name);

  return (
    <>
      <section className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 py-4 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-accent">An interactive computer vision notebook</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Learn computer vision by <span className="text-accent">watching it run</span>.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Follow the pixels. See the math. Connect every line of an algorithm to what happens in the image.
          </p>
          <Link
            href="/algo/morphology"
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-medium text-background transition hover:opacity-90"
          >
            Start with erosion & dilation <ArrowRight className="size-4" />
          </Link>
          <p className="mt-5 font-mono text-xs text-muted-foreground">
            Follows Birchfield&apos;s <i>Introduction to Computer Vision</i>, chapter by chapter. Runs in your browser.
          </p>
        </div>
        <HeroDemo />
      </section>

      <Collection cards={cards} soon={soon} topics={liveTopics} />
    </>
  );
}
