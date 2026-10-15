import type { Metadata } from "next";
import Link from "next/link";
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
          <div className="mx-auto flex max-w-6xl items-baseline gap-3 px-4 py-3 sm:px-6">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Visu<span className="text-accent">CV</span>
            </Link>
            <span className="text-sm text-muted-foreground">computer vision, step by step</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </body>
    </html>
  );
}
