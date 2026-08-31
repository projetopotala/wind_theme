import { expect, test } from "@playwright/test";

const preview = "http://localhost:3000/potala-preview";

test("V3 muda a atmosfera sem alterar o frame do video", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(preview, { waitUntil: "networkidle" });
  const environment = page.locator("[data-webgl='ready']");
  await expect(environment).toHaveAttribute("data-quality", /high|medium|low/);
  await expect(environment.locator("canvas")).toHaveCount(1);
  const before = await page.locator("video").evaluate((video) => video.currentTime);
  await page.screenshot({ path: "test-results/v3-01-start-before.png", fullPage: false });
  await page.waitForTimeout(10000);
  const after = await page.locator("video").evaluate((video) => video.currentTime);
  await page.screenshot({ path: "test-results/v3-02-start-after-10s.png", fullPage: false });
  expect(Math.abs(after - before)).toBeLessThanOrEqual(0.01);
});

test("V3 mantem uma unica camada WebGL nas regioes e libera o Palacio", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(preview, { waitUntil: "networkidle" });
  for (const [id, file] of [["quem-somos", "03-quem-somos"], ["cursos", "04-cursos"], ["profissionais", "05-profissionais"], ["arte-cultura", "06-arte-cultura"], ["inspiracao", "07-inspiracao"]]) {
    await page.locator(`#conteudo-${id}`).evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(450);
    await expect(page.locator("canvas")).toHaveCount(1);
    await page.screenshot({ path: `test-results/v3-${file}.png`, fullPage: false });
  }
  await page.evaluate(() => { const section = document.querySelector("section[aria-label]"); window.scrollTo({ top: section.offsetTop + section.offsetHeight - window.innerHeight, behavior: "instant" }); });
  await page.waitForTimeout(300);
  await expect(page.locator("[aria-live] article")).toHaveCount(0);
  await page.screenshot({ path: "test-results/v3-08-palacio.png", fullPage: false });
});

test("V3 reduz o perfil no mobile sem desligar a atmosfera", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(preview, { waitUntil: "networkidle" });
  const environment = page.locator("[data-webgl='ready']");
  await expect(environment).toHaveAttribute("data-quality", "low");
  await expect(environment).toHaveAttribute("data-particles", "45");
  await page.screenshot({ path: "test-results/v3-09-mobile.png", fullPage: false });
});
