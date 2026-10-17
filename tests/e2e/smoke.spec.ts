import { type Page, expect, test } from "@playwright/test";
import { algorithms } from "../../lib/algos";

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

    test("no horizontal scroll", async ({ page }) => {
      await open(page, id);
      await page.waitForTimeout(300); // let canvases size themselves
      const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      expect(scroll).toBeLessThanOrEqual(inner);
    });
  });
}
