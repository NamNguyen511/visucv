import type { Metadata } from "next";

/** Open Graph for one page. A page's `openGraph` replaces the layout's entirely, so the shared
 *  image and site name are repeated here instead of inherited. */
export const og = (title: string, description: string): Metadata["openGraph"] => ({
  type: "website", siteName: "VisuCV", title, description,
  images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "VisuCV: learn computer vision by watching it run" }],
});
