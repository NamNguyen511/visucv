# Home page redesign

Source: the user's Lovable design (dark, "Learn computer vision by watching it run"), reviewed
2026-10-17 against the current home page and the six Lovable algorithm pages.

## Problem statement
How might we make the home page hook first-time visitors and learners within 10 seconds, then get them
to the right algorithm fast, while keeping the book credit and roadmap honest?

## Recommended direction
Adopt the Lovable design's look and structure, filled with VisuCV's real content.

- **Hero:** Lovable's headline and copy (balanced line breaks). A morphology-only demo panel with a
  "MORPHOLOGY · CH. 3" strip, input → output grids, three lines of Python-style pseudocode with live
  values, pause/step/restart, and a pixel counter. It autoplays; with reduced motion it shows a still frame.
- **Collection:** Lovable-style cards: input → output thumbnail, topic, title, a short hook
  (≤ 8 words), and "Ch. N · S steps". Filter tabs come from the real topic groups, plus a
  **Coming soon** tab holding the roadmap (progress bar and upcoming pages). A search box matches
  title, hook, topic and chapter ("ch 12"). Tabs scroll sideways on phones instead of wrapping.
- **Footer (every page):** "A little less black box. A little more understanding." plus the
  Birchfield / CC BY 4.0 credit.
- **Theme:** follows the system setting. Dark mode uses the Lovable palette; light mode keeps the warm
  paper background. Every text colour reaches 4.5:1 contrast.

## Key assumptions to validate
- [ ] Light mode looks as intentional as dark: compare screenshots of both.
- [ ] Every tab fits in about two phone screens; search finds the expected page for sample queries.
- [ ] Text contrast is ≥ 4.5:1 in both themes, checked by an e2e test.
- [ ] The home page stays light: card data stays precomputed at build time.

## Scope
**Now (home page):** hero, cards with hooks, tabs + search + Coming soon tab, footer credit, palettes, tests.

**Follow-up (algorithm pages), done 2026-10-17:**
- Python-style pseudocode on all pages (user decision 2026-10-17: easier to understand than book-style)
- "Inside the kernel" box for window-based pages (morphology, convolution, nonlinear; Harris and edges later)
- previous/next and "All algorithms" links
- readout cells for the step's values (replacing the table)
- fix the pseudocode clipping on phones

## Not doing (and why)
Superseded later: the hero now has algorithm chips, and "Continue where you left off" shipped with progress memory.

- **An algorithm picker in the hero:** the hero is a showcase only.
- **Dark-only:** we follow the system setting.
- **Lovable's placeholder algorithms and "20 × 20 pixels" footers:** they don't match the real site.
- **"Continue where you left off":** later, once there are more pages.
- **Lovable's one-template algorithm pages:** VisuCV keeps per-algorithm math, key ideas and try-this.
