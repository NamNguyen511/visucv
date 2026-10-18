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
    // The hero starts ~160 ms after load (under 2 s even at 12× CPU throttling), but under the
    // suite's parallel load an occasional page took over 5 s, before and after the canvas changes.
    await expect(demo).not.toHaveAttribute("data-step", first!, { timeout: 15_000 });
    for (const id of Object.keys(algorithms))
      await expect(page.locator(`#algorithms a[href="/algo/${id}"]`).filter({ hasText: algorithms[id].meta.title })).toHaveCount(1);
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
  for (const colorScheme of ["light", "dark"] as const) for (const path of ["/", "/algo/morphology", "/photo"])
    test(`text contrast is at least 4.5:1 (${colorScheme}, ${path})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      if (path.startsWith("/algo")) await page.getByLabel("Next step").click(); // show the readouts and kernel box
      if (path === "/photo") await expect(page.getByRole("heading", { name: "Inside one pixel" })).toBeVisible();
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

  test("hero: drawing changes the output, and every chip shows a different result", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("[data-step]");
    const [input, output] = [hero.locator("canvas").nth(0), hero.locator("canvas").nth(1)];
    const snap = () => output.evaluate(c => (c as HTMLCanvasElement).toDataURL());
    await page.getByRole("button", { name: "Dilation" }).click();
    await expect(hero).toHaveAttribute("data-step", /\d/);
    // Drawing jumps to the live result; paint a short stroke in an empty corner.
    const box = (await input.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.9);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.97, box.y + box.height * 0.9, { steps: 4 });
    await page.mouse.up();
    await expect(hero).toHaveAttribute("data-step", "done");
    const seen = new Set<string>();
    for (const chip of ["Erosion", "Dilation", "Components", "Distance", "Edges"]) {
      await page.getByRole("button", { name: chip, exact: true }).click();
      await page.getByRole("button", { name: /Reset drawing/ }).isVisible();
      if (chip === "Erosion" || chip === "Dilation") await page.getByRole("button", { name: /Pause demo|Play demo/ }).first().isVisible();
      await expect.poll(async () => { const d = await snap(); return seen.has(d) ? "same" : (seen.add(d), "new"); }, { message: chip }).toBe("new");
    }
  });

  test("progress memory: visited stops get a check and Continue appears", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /^Continue/ })).toHaveCount(0);
    await page.goto("/algo/distance");
    // The visit is recorded once the page is interactive; a real visitor stays longer than this.
    await expect.poll(() => page.evaluate(() => localStorage.getItem("visucv:progress"))).toContain("distance");
    await page.goto("/");
    await expect(page.getByLabel("Stop 5, visited")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Continue/ })).toHaveAttribute("href", "/algo/distance");
  });

  test("each try-it challenge can be solved through the controls", async ({ page }) => {
    const plans: Record<string, [string, string][]> = {
      morphology: [["Operation", "open"]],
      components: [["Run", "label all blobs"], ["Connectivity", "8"]],
      convolution: [["Kernel", "one-hot (asymmetric)"]],
      nonlinear: [["Image", "noisy step edge"], ["Filter", "bilateral"], ["Window", "5×5"]],
    };
    for (const [id, steps] of Object.entries(plans)) {
      await page.goto(`/algo/${id}`);
      await expect(page.getByText("Try it:"), id).toBeVisible();
      for (const [label, value] of steps)
        await page.locator("section[aria-label=Demo] label").filter({ hasText: label }).first().locator("select").selectOption(value);
      await expect(page.getByText("Solved!"), id).toBeVisible();
    }
  });

  test("photograph lab: every filter changes the image, hovering inspects, your own photo loads", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("/photo");
    const shown = page.getByRole("img", { name: / of the photo$/ });
    await expect(page.getByRole("heading", { name: "Inside one pixel" })).toBeVisible();
    const snap = () => shown.evaluate(c => (c as HTMLCanvasElement).toDataURL());
    const seen = new Set<string>();
    for (const f of ["Colour", "Grayscale", "Otsu threshold", "Gaussian blur", "Median 3×3", "Sharpen", "Edges", "Harris corners"]) {
      await page.getByRole("button", { name: f, exact: true }).click();
      await expect.poll(async () => { const d = await snap(); return seen.has(d) ? "same" : (seen.add(d), "new"); }, { message: f }).toBe("new");
    }
    const where = page.getByText(/^\(x, y\) = /), before = await where.textContent();
    const box = (await shown.boundingBox())!;
    await shown.hover({ position: { x: box.width * 0.2, y: box.height * 0.8 } }); // scrolls into view first
    await expect(where).not.toHaveText(before!);
    await page.getByLabel(/Use your own photo/).setInputFiles("public/photos/camera.jpg");
    await expect.poll(snap).not.toBe([...seen].at(-1));
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(scroll).toBeLessThanOrEqual(inner);
    expect(errors).toEqual([]);
  });

  test("photograph lab: Fit fits, focus rings show, pins survive a resolution change, bad files say so and your photo still reloads", async ({ page }) => {
    await page.goto("/photo");
    await expect(page.getByRole("heading", { name: "Inside one pixel" })).toBeVisible();
    await page.getByRole("button", { name: "Camera" }).click(); // square photo: the tallest sample
    const view = page.getByLabel(/arrow keys move the inspected pixel/);
    const overflow = () => page.getByRole("img", { name: / of the photo$/ }).evaluate(el => {
      let a = el.parentElement!;
      while (getComputedStyle(a).overflow === "visible") a = a.parentElement!; // the photo's scroll box
      return Math.max(a.scrollHeight - a.clientHeight, a.scrollWidth - a.clientWidth);
    });
    await expect.poll(overflow).toBeLessThanOrEqual(1); // "Fit" shows the whole photo
    // The keyboard focus ring must not be clipped by any scrolling ancestor.
    await view.focus();
    const clipped = await view.evaluate(el => {
      const r = el.getBoundingClientRect();
      for (let a = el.parentElement; a; a = a.parentElement) {
        if (getComputedStyle(a).overflow === "visible") continue;
        const b = a.getBoundingClientRect();
        if (r.left - 2 < b.left || r.top - 2 < b.top || r.right + 2 > b.right || r.bottom + 2 > b.bottom) return true;
      }
      return getComputedStyle(el).boxShadow === "none";
    });
    expect(clipped).toBe(false);
    // The hidden file input's label shows keyboard focus.
    await page.getByRole("button", { name: "Camera" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel(/Use your own photo/)).toBeFocused();
    expect(await page.locator("label", { hasText: "Your photo" }).evaluate(el => getComputedStyle(el).boxShadow)).not.toBe("none");
    // Pin a pixel, then double the resolution: the same spot stays pinned, at doubled coordinates.
    const where = page.getByText(/^\(x, y\) = /);
    const xy = async () => (await where.textContent())!.match(/\d+/g)!.map(Number);
    await page.locator("select").selectOption("192");
    await view.press("ArrowRight");
    const [x, y] = await xy();
    await page.locator("select").selectOption("384");
    await expect(page.getByText(/^384 × /)).toBeVisible();
    const [x2, y2] = await xy();
    expect(Math.abs(x2 - 2 * x)).toBeLessThanOrEqual(1);
    expect(Math.abs(y2 - 2 * y)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Harris corners", exact: true }).click();
    await expect(page.getByRole("link", { name: /^Harris corners, step by step/ })).toBeVisible();
    // Your own photo, then a bad file: the lab falls back to your photo and can still re-read it.
    await page.getByLabel(/Use your own photo/).setInputFiles("public/photos/chelsea.jpg");
    await expect(page.getByText(/^384 × 255 /)).toBeVisible();
    await page.getByLabel(/Use your own photo/).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
    await expect(page.getByRole("alert").filter({ hasText: "as an image" })).toContainText("notes.txt");
    await page.locator("select").selectOption("96");
    await expect(page.getByText(/^96 × 64 /)).toBeVisible();
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
