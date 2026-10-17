import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Collection } from "@/components/collection";
import { HeroDemo } from "@/components/hero-demo";
import { ContinueLink } from "@/components/progress";
import { Outcomes } from "@/components/outcomes";
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
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl xl:text-6xl">
            Learn computer vision by <span className="text-accent">watching it run</span>.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground xl:text-xl">
            Follow the pixels. See the math. Connect every line of an algorithm to what happens in the image.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/algo/morphology"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-medium text-background transition hover:opacity-90 active:translate-y-px"
            >
              Start with erosion & dilation <ArrowRight className="size-4" />
            </Link>
            <ContinueLink titles={Object.fromEntries(cards.map(c => [c.id, c.title]))} />
          </div>
          <p className="mt-5 font-mono text-xs text-muted-foreground">
            Follows Birchfield&apos;s <i>Introduction to Computer Vision</i>, chapter by chapter. Runs in your browser.
          </p>
        </div>
        <HeroDemo />
      </section>

      <Outcomes pairs={[
        { title: "Separate the objects", card: cards.find(c => c.id === "components")! },
        { title: "Clean up the noise", card: cards.find(c => c.id === "nonlinear")! },
        { title: "Find the edges", card: cards.find(c => c.id === "edges")! },
      ]} />

      <Collection cards={cards} soon={soon} topics={liveTopics} />
    </>
  );
}
