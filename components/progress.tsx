"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { type Progress, markVisited, readProgress } from "@/lib/progress";

/** Records a visit to an algorithm page. Renders nothing. */
export function TrackVisit({ id }: { id: string }) {
  useEffect(() => markVisited(id), [id]);
  return null;
}

/** Read after mount (never during render), so server and client HTML match. */
export function useProgress() {
  const [p, setP] = useState<Progress>({ visited: [] });
  useEffect(() => setP(readProgress()), []);
  return p;
}

/** "Continue where you left off", shown only to returning visitors. */
export function ContinueLink({ titles }: { titles: Record<string, string> }) {
  const { last } = useProgress();
  if (!last || !titles[last]) return null;
  return (
    <Link href={`/algo/${last}`} title={titles[last]} className="inline-flex max-w-full items-center gap-2 rounded-xl border border-border px-4 py-2.5 font-medium transition hover:border-accent active:translate-y-px">
      <span className="text-muted-foreground">Continue</span> <span className="max-w-[16rem] truncate">{titles[last]}</span> <ArrowRight className="size-4 shrink-0" />
    </Link>
  );
}
