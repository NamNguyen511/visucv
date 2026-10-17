import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PhotoLab } from "@/components/photo-lab";

export const metadata: Metadata = {
  title: "Photograph lab",
  description: "VisuCV's algorithms on a real photograph, from the whole picture down to one pixel.",
};

export default function PhotoPage() {
  return (
    <>
      <Link href="/#algorithms" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> All algorithms
      </Link>
      <p className="mt-4 font-mono text-xs uppercase tracking-widest text-accent">Photograph lab</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight xl:text-4xl">From the whole picture to a single pixel.</h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed">
        The same algorithms as the step-through pages, on a real photo. Pick a filter, then point at any pixel to see every number that made it.
      </p>
      <PhotoLab />
      <p className="mt-10 text-xs text-muted-foreground">
        Sample photos from scikit-image: astronaut Eileen Collins (NASA, public domain); Chelsea the cat (Stéfan van der Walt, CC0); camera (Lav Varshney, CC0).
      </p>
    </>
  );
}
