import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://localhost:4173" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } } },
    // Chromium-based phone so WebGL works headless.
    { name: "phone", use: { ...devices["Pixel 7"], launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } } },
    // Narrow desktop window at 1× pixel density: canvases start large here, which exposed the
    // auto-sized grid column overflow that high-density phones hide.
    { name: "narrow", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } },
  ],
  webServer: {
    // Tests the static export (what ships); `npm run test:e2e` builds it first.
    command: "npx serve out -l 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
