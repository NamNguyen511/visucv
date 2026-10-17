import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Scan } from "lucide-react";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const sans = Space_Grotesk({ variable: "--font-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "VisuCV — computer vision, step by step", template: "%s · VisuCV" },
  description: "Interactive, step-through visualizations of computer vision algorithms with highlighted pseudocode.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-dvh font-sans">
        <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
          <div className="mx-auto flex max-w-[90rem] items-center gap-3 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <Scan aria-hidden className="size-5 text-accent" />
              <span>Visu<span className="text-accent">CV</span></span>
            </Link>
            <span className="hidden border-l border-border pl-3 text-sm text-muted-foreground sm:inline">computer vision, step by step</span>
            <Link href="/#algorithms" className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              Explore algorithms <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        <footer className="mt-16 border-t border-border">
          <div className="mx-auto flex max-w-[90rem] flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-baseline sm:justify-between sm:px-6">
            <p>
              Based on Stan Birchfield&apos;s{" "}
              <a className="underline decoration-border underline-offset-2 hover:text-foreground" href="https://sbirchfield.github.io/cvintro/">
                <i>Introduction to Computer Vision</i>
              </a>{" "}
              (<a className="underline decoration-border underline-offset-2 hover:text-foreground" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>).
              Unofficial; not endorsed by the author.
            </p>
            <p className="font-mono text-xs">A little less black box. A little more understanding.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
