import { type Page, expect, test } from "@playwright/test";
import { algorithms, topics } from "../../lib/algos";

const topicsOrder = () => topics.flatMap(t => t.items).filter(i => i.id).map(i => i.id!);

// Every algorithm page, on desktop and phone. Each check here caught a real bug once:
// playing from step 0 crashed (negative rAF delta); phones scrolled sideways (auto-sized grid column).

async function open(page: Page, id: string) {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`/algo/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(algorithms[id].meta.title);
  return errors;
}

test.describe("home", () => {
  test("hero demo runs, one card per live page, no errors or sideways scroll", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("/");
    const demo = page.locator("[data-step]");
    const first = await demo.getAttribute("data-step");
    await expect(demo).not.toHaveAttribute("data-step", first!);
    for (const id of Object.keys(algorithms))
      await expect(page.locator(`a[href="/algo/${id}"]`).filter({ hasText: algorithms[id].meta.title })).toHaveCount(1);
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(scroll).toBeLessThanOrEqual(inner);
    expect(errors).toEqual([]);
  });

  test("topic tabs, search and the Coming soon tab filter the collection", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator("#algorithms a[href^='/algo/']");
    await expect(cards).toHaveCount(Object.keys(algorithms).length);
    await page.getByRole("button", { name: "Filtering", exact: true }).click();
    const filtering = Object.values(algorithms).filter(a => a.meta.topic === "Filtering").length;
    await expect(cards).toHaveCount(filtering);
    await page.getByRole("button", { name: "All algorithms" }).click();
    for (const [q, id] of [["corner", "harris"], ["ch 12", "edges"], ["histogram", "otsu"]]) {
      await page.getByLabel("Find an algorithm").fill(q);
      await expect(cards, q).toHaveCount(1);
      await expect(cards.first()).toHaveAttribute("href", `/algo/${id}`);
    }
    await page.getByLabel("Find an algorithm").fill("");
    await page.getByRole("button", { name: /^Coming soon/ }).click();
    await expect(cards).toHaveCount(0);
    await expect(page.getByText("Optical flow (Lucas–Kanade)")).toBeVisible();
    await expect(page.getByRole("progressbar")).toBeVisible();
  });

  // The redesign's small monospace labels are easy to make too faint: hold every text to WCAG AA.
  for (const colorScheme of ["light", "dark"] as const) for (const path of ["/", "/algo/morphology"])
    test(`text contrast is at least 4.5:1 (${colorScheme}, ${path})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      if (path !== "/") await page.getByLabel("Next step").click(); // show the readouts and kernel box
      const low = await page.evaluate(() => {
        // Let the browser convert any CSS colour (oklab, color-mix, …) to RGBA bytes.
        const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
        const rgb = (c: string) => {
          ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
          return [r, g, b, a / 255];
        };
        const lum = ([r, g, b]: number[]) => {
          const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const bg = (el: Element | null): number[] => {
          for (; el; el = el.parentElement) {
            const c = rgb(getComputedStyle(el).backgroundColor);
            if (c[3] > 0.5) return c;
          }
          return rgb(getComputedStyle(document.body).backgroundColor);
        };
        const out: string[] = [];
        for (const el of document.querySelectorAll("body *")) {
          const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim());
          if (!own || !(el as HTMLElement).offsetParent) continue;
          const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(bg(el))];
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (ratio < 4.5) out.push(`${ratio.toFixed(2)} "${el.textContent!.trim().slice(0, 30)}"`);
        }
        return out;
      });
      expect(low).toEqual([]);
    });

  test("window-based pages show the values inside the kernel", async ({ page }) => {
    for (const id of ["morphology", "convolution", "nonlinear", "harris"]) {
      await page.goto(`/algo/${id}`);
      await page.getByLabel("Next step").click();
      await page.getByLabel("Next step").click();
      await expect(page.getByRole("heading", { name: "Inside the kernel" }), id).toBeVisible();
    }
  });

  test("reduced motion shows a still, finished demo", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const demo = page.locator("[data-step]");
    await expect(demo).not.toHaveAttribute("data-step", "0");
    const still = await demo.getAttribute("data-step");
    await page.waitForTimeout(400);
    await expect(demo).toHaveAttribute("data-step", still!);
  });
});

for (const id of Object.keys(algorithms)) {
  test.describe(id, () => {
    test("play from the first step advances without errors", async ({ page }) => {
      // 3-D pages render with software WebGL (swiftshader) here, so each click is slow; this test
      // sat at ~29 s of the 30 s limit and failed whenever the machine was busy.
      if (algorithms[id].view3d) test.slow();
      const errors = await open(page, id);
      for (let k = 0; k < 8; k++) {
        await page.getByLabel("First step").click();
        await page.getByRole("button", { name: "Play" }).click();
        await page.waitForTimeout(200);
        await page.getByRole("button", { name: "Pause" }).click();
      }
      await expect(page.locator("span.font-mono").last()).not.toHaveText(/^1 \//);
      expect(errors).toEqual([]);
    });

    // Regression: picking a different shape on a paintable page used to keep the old image.
    test("every image param changes the input panel", async ({ page }) => {
      await open(page, id);
      const input = page.locator("section[aria-label=Demo] canvas.pixels").first();
      const snap = () => input.evaluate(c => (c as HTMLCanvasElement).toDataURL());
      const params = algorithms[id].params;
      for (const [i, p] of params.entries()) {
        if (!p.input) continue;
        const before = await snap();
        const other = p.options.find(o => o !== p.default)!;
        await page.locator("section[aria-label=Demo] select").nth(i).selectOption(String(other));
        await expect.poll(snap, { message: `${p.key} → ${other}` }).not.toBe(before);
      }
    });

    test("explanation: lead, key ideas, try this, and typeset formulas", async ({ page }) => {
      await open(page, id);
      const { meta, explain } = algorithms[id];
      await expect(page.getByText(meta.lead)).toBeVisible();
      await expect(page.getByRole("heading", { name: "Key ideas" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Try this" })).toBeVisible();
      await expect(page.locator(".katex-display")).toHaveCount(explain.formulas?.length ?? 0);
      // No formula may need sideways scrolling: split multi-part formulas into stacked lines instead.
      const clipped = await page.locator("#the-math ~ dl dd:has(.katex-display)").evaluateAll(els =>
        els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.parentElement!.querySelector("dt")!.textContent));
      expect(clipped).toEqual([]);
    });

    // Regression: the pseudocode box scrolled sideways on phones, hiding the ends of lines.
    test("pseudocode lines are never cut off; previous / next links lead on", async ({ page }) => {
      await open(page, id);
      const pre = page.locator("section[aria-label=Pseudocode] pre");
      expect(await pre.evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
      const order = topicsOrder(), k = order.indexOf(id);
      if (k > 0) await expect(page.locator(`a[rel=prev][href="/algo/${order[k - 1]}"]`)).toBeVisible();
      if (k < order.length - 1) await expect(page.locator(`a[rel=next][href="/algo/${order[k + 1]}"]`)).toBeVisible();
    });

    test("no horizontal scroll", async ({ page }) => {
      await open(page, id);
      await page.waitForTimeout(300); // let canvases size themselves
      const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      expect(scroll).toBeLessThanOrEqual(inner);
    });
  });
}
