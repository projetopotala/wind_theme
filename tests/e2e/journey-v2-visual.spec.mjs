import { expect, test } from "@playwright/test";

const preview = "http://localhost:3000/potala-preview";

const portalFrames = [
  ["quem-somos", "02-quem-somos"],
  ["atendimentos", "03-atendimentos"],
  ["cursos", "04-cursos"],
  ["atividades", "05-atividades"],
  ["profissionais", "06-profissionais"],
  ["programacao", "07-programacao"],
  ["arte-cultura", "08-arte-cultura"],
  ["inspiracao", "09-inspiracao"],
];

test("V2 compoe chegada, oito portais, Palacio e epilogo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(preview, { waitUntil: "networkidle" });
  await expect(page.locator("video")).toHaveAttribute("src", /potala-journey-v2\.mp4$/);
  await page.screenshot({ path: "test-results/v2-01-chegada.png", fullPage: false });

  for (const [id, filename] of portalFrames) {
    await page.locator(`#conteudo-${id}`).evaluate((element) => element.scrollIntoView({ block: "center" }));
    await expect(page.locator(`[aria-live] article[data-content-id='${id}']`)).toBeVisible();
    await page.waitForTimeout(450);
    await page.screenshot({ path: `test-results/v2-${filename}.png`, fullPage: false });
  }

  await page.evaluate(() => {
    const section = document.querySelector("section[aria-label]");
    const travel = section.offsetHeight - window.innerHeight;
    window.scrollTo({ top: section.offsetTop + travel * 0.87, behavior: "instant" });
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/v2-10-aproximacao-monumental.png", fullPage: false });
  await page.evaluate(() => {
    const section = document.querySelector("section[aria-label]");
    window.scrollTo({ top: section.offsetTop + section.offsetHeight - window.innerHeight, behavior: "instant" });
  });
  await page.waitForTimeout(250);
  await expect(page.locator("[aria-live] article")).toHaveCount(0);
  await page.screenshot({ path: "test-results/v2-11-palacio.png", fullPage: false });
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/v2-12-rodape-vivo.png", fullPage: false });
});

test("V2 preserva scrub monotono e reverso", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(preview, { waitUntil: "networkidle" });
  const samples = [];
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    await page.evaluate((value) => {
      const section = document.querySelector("section[aria-label]");
      const travel = Math.max(1, section.offsetHeight - window.innerHeight);
      window.scrollTo({ top: section.offsetTop + travel * value, behavior: "instant" });
    }, progress);
    await page.waitForTimeout(150);
    samples.push(await page.locator("video").evaluate((video) => ({ time: video.currentTime, paused: video.paused, seekable: video.seekable.length })));
  }
  expect(samples.every((sample) => sample.paused && sample.seekable > 0)).toBe(true);
  expect(samples[0].time).toBeLessThan(samples[1].time);
  expect(samples[1].time).toBeLessThan(samples[2].time);
  expect(samples[2].time).toBeLessThan(samples[3].time);
  expect(samples[3].time).toBeLessThan(samples[4].time);
  await page.evaluate(() => window.scrollTo({ top: document.querySelector("section[aria-label]").offsetTop + 0.25 * (document.querySelector("section[aria-label]").offsetHeight - window.innerHeight), behavior: "instant" }));
  await page.waitForTimeout(150);
  expect(await page.locator("video").evaluate((video) => video.currentTime)).toBeLessThan(samples[4].time);
});

test("V2 mantem a composicao legivel em mobile e landscape", async ({ page }) => {
  for (const [width, height, screenshot] of [[390, 844, "v2-13-mobile.png"], [360, 800, null], [844, 390, "v2-14-mobile-landscape.png"]]) {
    await page.setViewportSize({ width, height });
    await page.goto(preview, { waitUntil: "networkidle" });
    await page.locator("#conteudo-cursos").evaluate((element) => element.scrollIntoView({ block: "center" }));
    await expect(page.locator("[aria-live] article[data-content-id='cursos'] a")).toBeVisible();
    await page.waitForTimeout(450);
    await expect.poll(() => page.locator("video").evaluate((video) => video.currentTime)).toBeGreaterThan(25);
    if (screenshot) await page.screenshot({ path: `test-results/${screenshot}`, fullPage: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
