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
    await expect(demo.locator("p[aria-live]")).toHaveAttribute("aria-live", "off"); // no announcements 8× a second
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
    const soon = topics.flatMap(t => t.items).find(i => !i.id)!.title;
    await expect(page.getByText(soon, { exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar")).toBeVisible();
  });

  // The redesign's small monospace labels are easy to make too faint: hold every text to WCAG AA.
  for (const colorScheme of ["light", "dark"] as const) for (const path of ["/", "/algo/morphology", "/photo"])
    test(`text contrast is at least 4.5:1 (${colorScheme}, ${path})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      if (path.startsWith("/algo")) await page.getByLabel("Next step").click(); // show the readouts and kernel box
      if (path === "/photo") await expect(page.getByRole("img", { name: / of the photo$/ })).toBeVisible();
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
    for (const id of ["morphology", "convolution", "nonlinear", "harris", "flow"]) {
      await page.goto(`/algo/${id}`);
      await page.getByLabel("Next step").click();
      await page.getByLabel("Next step").click();
      await expect(page.getByRole("heading", { name: "Inside the kernel" }), id).toBeVisible();
    }
  });

  // The home page runs only the hero's four modules; card thumbnails are precomputed. Importing a
  // helper from lib/algos/card once pulled the whole registry (every page's code) into the home bundle.
  test("home page ships only the hero's algorithm modules", async ({ page, request }) => {
    await page.goto("/");
    const srcs = await page.locator("script[src]").evaluateAll(els => els.map(e => (e as HTMLScriptElement).src));
    const js = (await Promise.all(srcs.map(async s => (await request.get(s)).text()))).join("\n");
    expect(js.includes("def erode(A, B):")).toBe(true);
    for (const line of ["def otsu(I):", "def frequency_filter(I, mask):", "def corners(I, k=0.04):", "def moments(I):"]) expect(js.includes(line), line).toBe(false);
  });

  // Per-frame work: a new (empty) overlay array per panel per render redrew every panel on every step,
  // which made the edges page's play test the slowest 2-D one (~15 s) and time out under load.
  test("stepping redraws only the panels that change", async ({ page }) => {
    await page.goto("/algo/edges");
    await page.getByLabel("Next step").click();
    await page.getByLabel("Next step").click(); // gradient arrows are on from here
    await page.waitForTimeout(300); // let the last overlay glide (≤ 120 ms) settle before counting
    await page.evaluate(() => {
      const w = window as unknown as { draws: Record<string, number> };
      w.draws = {};
      const orig = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
        const k = this.canvas.getAttribute("aria-label") ?? "?";
        w.draws[k] = (w.draws[k] ?? 0) + 1;
        return (orig as (...x: unknown[]) => void).apply(this, a);
      } as typeof orig;
    });
    for (let k = 0; k < 4; k++) await page.getByLabel("Next step").click();
    const draws = await page.evaluate(() => (window as unknown as { draws: Record<string, number> }).draws);
    expect(draws["I grid"] ?? 0).toBe(0);
    expect(draws["blurred (σ = 1) grid"] ?? 0).toBe(0);
    expect(draws["thinned (non-max) grid"]).toBeGreaterThan(0); // the panel being written does redraw
  });

  // Regression: the arrow keys were ignored whenever a button had focus, i.e. right after any click on the player.
  test("arrow keys still step after clicking a player button", async ({ page }) => {
    await page.goto("/algo/morphology");
    const step = page.getByRole("slider", { name: "Step" });
    await page.getByLabel("Next step").click();
    await expect(step).toHaveValue("1");
    await page.keyboard.press("ArrowRight");
    await expect(step).toHaveValue("2");
    await page.keyboard.press("ArrowLeft");
    await expect(step).toHaveValue("1");
  });

  // Readout labels are math symbols: an uppercase style turned σ into Σ (a sum), μ into M and t into T.
  test("readout labels keep their case", async ({ page }) => {
    await page.goto("/algo/otsu");
    await page.getByLabel("Next step").click();
    const label = (t: string) => page.locator("dt").filter({ hasText: t }).first();
    for (const t of ["σ²_B(t)", "μ₀ / μ₁", "ω₀ / ω₁"]) expect(await label(t).innerText()).toBe(t);
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

  // Prefetching the home page used to preload its Photograph-lab photo on every other page
  // (a wasted download and a console warning): React hints eager <img>s in server components.
  test("other pages don't download the home page's photo", async ({ page }) => {
    const photos: string[] = [];
    page.on("request", r => { if (r.url().includes("/photos/")) photos.push(r.url()); });
    await page.goto("/algo/morphology", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    expect(photos).toEqual([]);
  });

  // Stale or hand-edited progress (a removed page, "__proto__") crashed the home page or showed "0 visited".
  test("odd stored progress is ignored", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("visucv:progress", '{"visited":["old-page"],"last":"__proto__"}'));
    await page.reload();
    await expect(page.getByRole("heading", { name: /Explore algorithms/ })).toBeVisible();
    await page.waitForLoadState("networkidle"); // progress is read after hydration
    await expect(page.getByText(/\d+ visited/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Continue/ })).toHaveCount(0);
    expect(errors).toEqual([]);
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

  test("photograph lab: dragging the wipe repaints nothing, focus survives remove / move-to-end / clear, captions match the data", async ({ page }) => {
    await page.goto("/photo");
    await expect(page.getByRole("img", { name: / of the photo$/ })).toBeVisible();
    // Only the clip path moves: every render used to repaint both big canvases and the gray thumbnail.
    await page.getByRole("button", { name: "Wipe", exact: true }).click();
    await page.evaluate(() => {
      const w = window as unknown as { puts: number }, put = CanvasRenderingContext2D.prototype.putImageData;
      w.puts = 0;
      CanvasRenderingContext2D.prototype.putImageData = function (this: CanvasRenderingContext2D, ...a: unknown[]) { w.puts++; return (put as (...x: unknown[]) => void).apply(this, a); } as typeof put;
    });
    for (const v of ["30", "60", "80"]) await page.getByLabel("Split position").fill(v);
    expect(await page.evaluate(() => (window as unknown as { puts: number }).puts)).toBe(0);
    await page.getByRole("button", { name: "Side by side", exact: true }).click();

    const focused = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent);
    await page.getByRole("button", { name: "Remove Components" }).click();
    expect(await focused()).toMatch(/^Stage 3: Morphology/); // the newly selected card, not <body>
    await page.getByRole("button", { name: "Move Gaussian blur later" }).click();
    await page.getByRole("button", { name: "Move Gaussian blur later" }).click(); // now last: its "later" button is disabled
    expect(await focused()).toBe("Move Gaussian blur earlier");
    await page.getByRole("button", { name: "Move Gaussian blur earlier" }).click();
    await page.getByRole("button", { name: "Move Gaussian blur earlier" }).click(); // now first
    expect(await focused()).toBe("Move Gaussian blur later");
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    expect(await focused()).toMatch(/^Gray photo/);

    // Distance hands on plain d / max, not its banded picture: the next stage's input caption says so.
    await page.getByRole("button", { name: "How deep inside", exact: true }).click();
    await page.getByRole("group", { name: "Add a stage" }).getByRole("button", { name: /^Gaussian blur/ }).click();
    await expect(page.locator("figcaption").first()).toHaveText(/^Distance transform values/);
  });

  test("photograph lab: build a pipeline, blocked stages say why and fix in one click, edits flow downstream, your own photo loads", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("/photo");
    const shown = page.getByRole("img", { name: / of the photo$/ });
    await expect(shown).toBeVisible();
    const snap = () => shown.evaluate(c => (c as HTMLCanvasElement).toDataURL());
    const seen = new Set<string>();
    // Waits for the worker's run first: while busy the canvas still holds the last pixels, which must not count as fresh.
    const fresh = async (what: string) => {
      await expect(page.locator("[aria-busy=false]"), what).toHaveCount(1);
      await expect.poll(async () => { const d = await snap(); return seen.has(d) ? "same" : (seen.add(d), "new"); }, { message: what }).toBe("new");
    };
    const cards = page.getByRole("list", { name: "Pipeline" }).getByRole("button", { name: /^Stage / });
    const add = (name: string) => page.getByRole("group", { name: "Add a stage" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
    const blocked = page.getByRole("status").filter({ hasText: /Needs a/ });

    // Every starter runs to the end with a fresh result.
    for (const name of await page.getByRole("group", { name: "Starter pipelines" }).getByRole("button").allInnerTexts()) {
      if (name === "Clear") continue;
      await page.getByRole("button", { name, exact: true }).click();
      await expect(cards.filter({ hasText: "blocked" }), name).toHaveCount(0);
      await fresh(name);
    }
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(cards).toHaveCount(0);
    await expect(page.getByText(/pipeline is empty/)).toBeVisible();

    // Blur, then a binary stage: blocked (no silent threshold) until Otsu goes in before it.
    await add("Gaussian blur");
    await fresh("blur");
    await page.locator("label", { hasText: "σ" }).locator("select").selectOption("3");
    await fresh("σ = 3");
    await add("Morphology");
    await expect(blocked).toContainText("black-and-white");
    await page.getByRole("button", { name: "Add Otsu threshold before it" }).click();
    await expect(cards).toHaveText([/Gaussian blur/, /Otsu threshold/, /Morphology/]);
    const fixed = page.getByRole("button", { name: /^Stage 3: Morphology/ });
    await expect(fixed).toBeFocused(); // not <body>: the fix button is gone
    await expect(fixed).toHaveAttribute("aria-pressed", "true"); // still on the stage that was fixed
    await fresh("blur → Otsu → morphology");

    // An upstream knob changes the downstream result.
    await cards.nth(0).click();
    await page.locator("label", { hasText: "σ" }).locator("select").selectOption("0.5");
    await cards.nth(2).click();
    await fresh("σ = 0.5 upstream");

    // Keyboard: move morphology before Otsu (blocked), focus stays on it, then move it back.
    await page.getByRole("button", { name: "Move Morphology earlier" }).focus();
    await page.keyboard.press("Enter");
    await expect(cards).toHaveText([/Gaussian blur/, /Morphology.*blocked/, /Otsu threshold/]);
    await expect(page.getByRole("button", { name: "Move Morphology earlier" })).toBeFocused();
    await expect(blocked).toBeVisible();
    await page.getByRole("button", { name: "Move Morphology later" }).press("Enter");
    await expect(cards.filter({ hasText: "blocked" })).toHaveCount(0);

    // Labels end the chain; removing a stage re-checks what follows.
    await add("Components");
    await add("Gaussian blur");
    await expect(blocked).toContainText("label image");
    await page.getByRole("button", { name: "Remove Gaussian blur" }).last().click();
    await page.getByRole("button", { name: "Remove Otsu threshold" }).click();
    await expect(cards.filter({ hasText: "blocked" })).toHaveCount(2); // morphology and components
    await page.getByRole("button", { name: "Clear", exact: true }).click();

    await add("Median & friends");
    await page.locator("label", { hasText: "Filter" }).locator("select").selectOption("bilateral");
    await fresh("bilateral");
    const sigmaR = page.locator("label", { hasText: "σ_r" }).locator("select");
    await sigmaR.selectOption("∞");
    await expect(sigmaR).toHaveValue("∞"); // a string option on a numeric knob must not turn into NaN
    await fresh("σ_r = ∞");
    await page.getByLabel(/Use your own photo/).setInputFiles("public/photos/camera.jpg");
    await fresh("your photo");
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(scroll).toBeLessThanOrEqual(inner);
    expect(errors).toEqual([]);
  });

  test("photograph lab: a slow stage runs off the main thread (no long tasks), and its result still arrives", async ({ page }) => {
    await page.goto("/photo");
    const shown = page.getByRole("img", { name: / of the photo$/ });
    await expect(shown).toBeVisible();
    await page.locator("label", { hasText: "Pixels" }).locator("select").selectOption("384");
    await expect(page.getByText(/^384 × /)).toBeVisible();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    const knob = (label: string, v: string) => page.locator("label", { hasText: label }).locator("select").selectOption(v);
    for (const n of [0, 1]) { // two bilateral 5×5 stages: ~0.5 s per recompute on the main thread
      await page.getByRole("group", { name: "Add a stage" }).getByRole("button", { name: /^Median/ }).click();
      await knob("Window", "5×5");
      await knob("Filter", "bilateral");
      await expect(page.getByRole("button", { name: new RegExp(`^Stage ${n + 1}`) })).toBeVisible();
    }
    await page.getByRole("button", { name: /^Stage 1/ }).click();
    await expect(page.locator("[aria-busy=false]")).toHaveCount(1);
    await page.evaluate(() => {
      (window as unknown as { long: number[] }).long = [];
      new PerformanceObserver(l => { for (const e of l.getEntries()) (window as unknown as { long: number[] }).long.push(e.duration); }).observe({ type: "longtask" });
    });
    const before = await shown.evaluate(c => (c as HTMLCanvasElement).toDataURL());
    await knob("σ_r", "100"); // recomputes both stages
    await expect(page.locator("[aria-busy=false]")).toHaveCount(1);
    await expect.poll(() => shown.evaluate(c => (c as HTMLCanvasElement).toDataURL())).not.toBe(before);
    expect(await page.evaluate(() => (window as unknown as { long: number[] }).long.filter(d => d >= 200))).toEqual([]);

    // Removing a stage while a run is pending: the card that moves up (Morphology, 4th → 3rd) must never show the
    // removed stage's result, not even for one render (a MutationObserver sees every one, however fast the worker is).
    await page.getByRole("group", { name: "Add a stage" }).getByRole("button", { name: /^Otsu/ }).click();
    await page.getByRole("group", { name: "Add a stage" }).getByRole("button", { name: /^Morphology/ }).click();
    await expect(page.locator("[aria-busy=false]")).toHaveCount(1);
    await page.evaluate(() => {
      const seen: string[] = ((window as unknown as { morph: string[] }).morph = []), ol = document.querySelector("ol[aria-label=Pipeline]")!;
      new MutationObserver(() => { for (const b of ol.querySelectorAll("button[aria-pressed]")) if (b.textContent!.startsWith("3. Morphology")) seen.push(b.textContent!); })
        .observe(ol, { subtree: true, childList: true, characterData: true });
    });
    await page.getByRole("button", { name: /^Stage 1/ }).click();
    await knob("σ_r", "50"); // recomputes both bilateral stages
    await page.getByRole("button", { name: "Remove Otsu threshold" }).click();
    await expect(page.getByRole("button", { name: /^Stage 3/ })).toHaveAccessibleName("Stage 3: Morphology (blocked)");
    expect((await page.evaluate(() => (window as unknown as { morph: string[] }).morph)).filter(t => t.includes("black-and-white"))).toEqual([]); // Otsu's
  });

  test("photograph lab: both views fit, wipe splits, focus rings show, resolution changes, bad files say so and your photo still reloads", async ({ page }) => {
    await page.goto("/photo");
    await page.getByRole("button", { name: "Camera" }).click(); // square photo: the tallest sample
    const result = page.getByRole("img", { name: / of the photo$/ });
    await result.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await result.boundingBox())!.height).toBeLessThanOrEqual(0.7 * page.viewportSize()!.height);
    await page.getByRole("button", { name: "Wipe", exact: true }).click();
    const view = page.getByLabel(/input on the left of the split/);
    const overflow = () => view.evaluate(a => Math.max(a.scrollHeight - a.clientHeight, a.scrollWidth - a.clientWidth));
    await expect.poll(overflow).toBeLessThanOrEqual(1); // "Fit" shows the whole photo
    await page.getByLabel("Split position").fill("20");
    await expect(result).toHaveAttribute("style", /inset\(0px 0px 0px 20%\)|inset\(0 0 0 20%\)/);
    await page.getByRole("button", { name: "4×", exact: true }).click();
    await expect.poll(overflow).toBeGreaterThan(1);
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
    const pixels = page.locator("label", { hasText: "Pixels" }).locator("select");
    await pixels.selectOption("384");
    await expect(page.getByText(/^384 × 384 /)).toBeVisible();
    await page.getByRole("group", { name: "Add a stage" }).getByRole("button", { name: /^Harris corners/ }).click();
    await expect(page.getByRole("link", { name: /^Harris corners, step by step/ })).toBeVisible();
    // Your own photo, then a bad file: the lab falls back to your photo and can still re-read it.
    await page.getByLabel(/Use your own photo/).setInputFiles("public/photos/chelsea.jpg");
    await expect(page.getByText(/^384 × 255 /)).toBeVisible();
    await page.getByLabel(/Use your own photo/).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
    await expect(page.getByRole("alert").filter({ hasText: "as an image" })).toContainText("notes.txt");
    await pixels.selectOption("96");
    await expect(page.getByText(/^96 × 64 /)).toBeVisible();
  });

  // Launch checks: a styled 404, and every kind of page has the icon and an absolute share image.
  test("404 page, icon and share previews", async ({ page }) => {
    const res = await page.goto("/no-such-page");
    expect(res!.status()).toBe(404);
    await expect(page.getByRole("heading", { name: /isn.t in the image/ })).toBeVisible();
    await expect(page).toHaveTitle("Page not found · VisuCV");
    await expect(page.getByRole("link", { name: /Back to the start/ })).toHaveAttribute("href", "/");
    for (const path of ["/", "/algo/edges", "/photo"]) {
      await page.goto(path);
      await expect(page.locator('link[rel="icon"]'), path).toHaveAttribute("href", /icon\.svg/);
      await expect(page.locator('meta[property="og:image"]'), path).toHaveAttribute("content", /^https:\/\/.+\/opengraph-image\.png/);
      await expect(page.locator('meta[property="og:title"]'), path).toHaveAttribute("content", /VisuCV/);
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
    // The finished result gets a caption about the whole output (it used to read "none of the undefined
    // cells"), and switching chips must not start the animation.
    const say = demo.locator("p[aria-live]");
    await expect(say).toContainText(/survive/);
    for (const chip of ["Components", "Dilation"]) {
      await page.getByRole("button", { name: chip, exact: true }).click();
      await expect(demo).toHaveAttribute("data-step", "done");
    }
    await expect(say).toContainText(/lit/);
    await expect(say).not.toContainText(/undefined|no white cell/);
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
      // The step slider, not a markup-based locator: `span.font-mono` `.last()` had become the "Next" link label.
      await expect(page.getByRole("slider", { name: "Step" })).not.toHaveValue("0");
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
