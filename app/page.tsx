import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AlgoCard } from "@/components/algo-card";
import { HeroDemo } from "@/components/hero-demo";
import { topics } from "@/lib/algos";

export default function Home() {
  const items = topics.flatMap(t => t.items);
  const live = items.filter(i => i.id).map(i => i.id!);
  const pct = Math.round((live.length / items.length) * 100);
  const soon = topics.map(t => ({ name: t.name, items: t.items.filter(i => !i.id) })).filter(t => t.items.length);

  return (
    <>
      <section className="grid grid-cols-[minmax(0,1fr)] items-center gap-8 py-4 sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Learn computer vision by <span className="text-accent">watching it run</span>.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Every page steps through one algorithm on a small image, pixel by pixel, with the pseudocode line for
            each step lit up beside it.
          </p>
          <Link
            href="/algo/morphology"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-medium text-background transition hover:opacity-90"
          >
            Start with erosion & dilation <ArrowRight className="size-4" />
          </Link>
        </div>
        <HeroDemo />
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-2xl font-bold tracking-tight">Live now</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {live.map(id => <AlgoCard key={id} id={id} />)}
        </div>
      </section>

      <section className="mt-14">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-bold tracking-tight">On the roadmap</h2>
          <span className="font-mono text-sm text-muted-foreground">{live.length} of {items.length} live</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-pending" role="progressbar"
             aria-valuenow={live.length} aria-valuemin={0} aria-valuemax={items.length} aria-label="Topics live">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-6 space-y-4">
          {soon.map(t => (
            <div key={t.name} className="flex flex-col gap-2 sm:flex-row sm:items-baseline">
              <h3 className="w-40 shrink-0 font-mono text-xs uppercase tracking-widest text-muted-foreground">{t.name}</h3>
              <ul className="flex flex-wrap gap-2">
                {t.items.map(i => (
                  <li key={i.title} className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">
                    {i.title}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
