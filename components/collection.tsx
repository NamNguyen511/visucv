"use client";
// Home-page catalog: topic tabs, a "Coming soon" tab for the roadmap, and search. It only filters
// card data precomputed at build time; no algorithm runs here.
import { useState } from "react";
import { Check, Search } from "lucide-react";
import type { CardData } from "@/lib/algos/card";
import { AlgoCard } from "./algo-card";
import { useProgress } from "./progress";

export type Soon = { topic: string; title: string };
const ALL = "All algorithms", SOON = "Coming soon";
// "Ch. 12 — Edge…" and "ch 12" should match: compare lowercase words only.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function Collection({ cards, soon, topics }: { cards: CardData[]; soon: Soon[]; topics: string[] }) {
  const [tab, setTab] = useState(ALL);
  const [q, setQ] = useState("");
  const { visited } = useProgress();
  const query = norm(q);
  const hit = (...fields: string[]) => !query || norm(fields.join(" ")).includes(query);
  const shown = tab === SOON ? [] : cards.filter(c => (tab === ALL || c.topic === tab) && hit(c.title, c.hook, c.topic, c.ref));
  const upcoming = soon.filter(s => hit(s.title, s.topic));
  const total = cards.length + soon.length;

  return (
    <section id="algorithms" className="mt-16 scroll-mt-20 border-t border-border pt-10">
      <p className="font-mono text-xs uppercase tracking-widest text-accent">The learning path</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Explore algorithms <span className="font-mono text-sm font-normal text-muted-foreground">/ {cards.length}</span>
          {visited.length > 0 && <span className="ml-3 font-mono text-sm font-normal text-accent">{visited.filter(v => cards.some(c => c.id === v)).length} visited</span>}
        </h2>
        <p className="text-muted-foreground">From individual pixels to bigger ideas.</p>
      </div>

      <div className="mt-6 flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="Filter by topic">
          {[ALL, ...topics, SOON].map(t => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition ${tab === t ? "bg-highlight font-medium text-accent" : "text-muted-foreground hover:text-foreground"}`}>
              {t}{t === SOON && <span className="ml-1.5 font-mono text-xs">{soon.length}</span>}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus-within:border-accent md:w-64">
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find an algorithm or chapter"
                 aria-label="Find an algorithm" className="w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground" />
        </label>
      </div>

      {tab === SOON ? (
        <div className="mt-6">
          <div className="flex items-baseline justify-between font-mono text-sm text-muted-foreground">
            <span>On the roadmap</span>
            <span>{cards.length} of {total} live</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-pending" role="progressbar"
               aria-valuenow={cards.length} aria-valuemin={0} aria-valuemax={total} aria-label="Pages live">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((cards.length / total) * 100)}%` }} />
          </div>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map(s => (
              <li key={s.title} className="rounded-2xl border border-dashed border-border p-4">
                <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{s.topic}</p>
                <p className="mt-1 font-semibold">{s.title}</p>
              </li>
            ))}
          </ul>
          {!upcoming.length && <Empty q={q} />}
        </div>
      ) : (
        // Numbered stops in roadmap order: two columns read left, right, left…, the right column
        // nudged down for a zig-zag, with each stop's number on the centre line between them.
        <ol className="relative mt-8 grid gap-y-6 before:absolute before:inset-y-0 before:left-5 before:w-px before:bg-border lg:grid-cols-2 lg:gap-x-28 lg:pb-24 lg:before:left-1/2">
          {shown.map((c, i) => {
            const n = cards.indexOf(c), seen = visited.includes(c.id), right = i % 2 === 1;
            return (
              <li key={c.id} className={`relative pl-14 lg:pl-0 ${right ? "lg:translate-y-24" : ""}`}>
                <span aria-label={seen ? `Stop ${n + 1}, visited` : `Stop ${n + 1}`}
                      className={`absolute left-0 top-1/2 z-[1] flex size-10 -translate-y-1/2 items-center justify-center rounded-full border font-mono text-sm lg:size-12 ${
                        right ? "lg:-left-20" : "lg:left-auto lg:-right-20"} ${
                        seen ? "border-accent bg-accent text-background" : "border-border bg-card text-muted-foreground"}`}>
                  {seen ? <Check aria-hidden className="size-5" /> : String(n + 1).padStart(2, "0")}
                </span>
                <AlgoCard card={c} />
              </li>
            );
          })}
          {!shown.length && <li className="col-span-full"><Empty q={q} /></li>}
        </ol>
      )}
    </section>
  );
}

const Empty = ({ q }: { q: string }) => (
  <p className="col-span-full py-10 text-center text-muted-foreground">Nothing matches “{q}” here yet.</p>
);
