/* Regressão visual local: node tests/potala/d3-responsive.browser.mjs */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createPreviewServer } from "../../scripts/serve-outputs.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.POTALA_PLAYWRIGHT_MODULE || "playwright");
const server = createPreviewServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.POTALA_CHROME_PATH ? { executablePath: process.env.POTALA_CHROME_PATH } : {}) });
  for (const [width, height] of [[320, 568], [375, 812], [390, 844], [768, 1024], [1366, 768], [1920, 1080]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    try {
      await context.route("**/*", (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      for (const path of ["/atendimentos.html", "/especialistas.html", "/meu-potala/atendimentos?demo=visita", "/admin/"]) {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(250);
        const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        assert.equal(size.scroll, size.client, `${path} transborda em ${width}px: ${JSON.stringify(size)}`);
        assert.deepEqual(errors, [], `${path} com erro em ${width}px`);
        await page.close();
      }
      console.log(`PASS ${width}x${height}: páginas D3 sem overflow horizontal`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
