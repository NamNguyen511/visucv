import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "Page not found" };

// A 5×5 "image" with one missing pixel: the page you asked for.
const CELLS = Array.from({ length: 25 }, (_, k) => (k === 12 ? "missing" : [6, 7, 8, 11, 13, 16, 17, 18].includes(k) ? "on" : "off"));

export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
      <div className="grid grid-cols-5 gap-1" aria-hidden>
        {CELLS.map((c, k) => (
          <span key={k} className={`size-7 rounded-sm ${c === "on" ? "bg-foreground" : c === "missing" ? "border-2 border-dashed border-cursor" : "bg-pending"}`} />
        ))}
      </div>
      <p className="mt-8 font-mono text-xs uppercase tracking-widest text-accent">404 · pixel not found</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">This page isn&apos;t in the image.</h1>
      <p className="mt-3 text-muted-foreground">The address may be mistyped, or the page may have moved.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-medium text-background transition hover:opacity-90 active:translate-y-px">
          Back to the start <ArrowRight className="size-4" />
        </Link>
        <Link href="/#algorithms" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 font-medium transition hover:border-accent">
          All algorithms
        </Link>
      </div>
    </section>
  );
}
