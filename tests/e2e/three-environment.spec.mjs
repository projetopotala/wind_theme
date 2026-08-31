import { expect, test } from "@playwright/test";

const preview = "http://localhost:3000/potala-preview";

test("desktop mantém vídeo parado enquanto o canvas atmosférico permanece ativo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(preview, { waitUntil: "networkidle" });
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.locator("[data-webgl='ready'] canvas")).toHaveCount(1);
  const before = await page.locator("video").evaluate((video) => video.currentTime);
  const fps = await page.evaluate(async () => {
    let frames = 0;
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = () => performance.now() - start >= 1000 ? resolve() : (frames++, requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    });
    return frames;
  });
  await page.waitForTimeout(10000);
  const after = await page.locator("video").evaluate((video) => video.currentTime);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(0.01);
  expect(fps).toBeGreaterThan(20);
  await page.screenshot({ path: "test-results/three-desktop-start.png", fullPage: false });
});

test("mobile reduz a composição sem remover vídeo ou portais", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(preview, { waitUntil: "networkidle" });
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Destinos da jornada" })).toBeVisible();
  await page.screenshot({ path: "test-results/three-mobile.png", fullPage: false });
});

test("reduced motion não inicia canvas animado", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(preview, { waitUntil: "networkidle" });
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.locator("[data-webgl='ready'] canvas")).toHaveCount(0);
  await context.close();
});

test("falha de WebGL preserva vídeo e conteúdo", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === "webgl" || type === "webgl2") return null;
      return original.call(this, type, ...args);
    };
  });
  await page.goto(preview, { waitUntil: "networkidle" });
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Destinos da jornada" })).toBeVisible();
  await expect(page.locator("[data-webgl='ready'] canvas")).toHaveCount(0);
  await context.close();
});
