import { expect, test } from "@playwright/test";

const routes = [
  ["/quem-somos", "Quem somos"], ["/atendimentos", "Atendimentos"], ["/cursos", "Cursos"], ["/atividades", "Atividades"],
  ["/profissionais", "Profissionais"], ["/programacao", "Programação"], ["/cultura", "Arte e cultura"], ["/inspiracao", "Inspiração"],
];

for (const [pathname, title] of routes) test(`rota canônica ${pathname}`, async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const response = await page.goto(`http://localhost:3000${pathname}?from=journey`, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  expect(page.url()).toContain(`${pathname}?from=journey`);
  expect(page.url()).not.toContain("_legacy");
  expect(page.url()).not.toContain(".html");
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("master V2 aceita ranges e seeks pausados", async ({ page, request }) => {
  for (const range of ["bytes=0-1023", "bytes=1000000-1001023", "bytes=-1024"]) {
    const response = await request.get("http://localhost:3000/media/potala-journey-v2.mp4", { headers: { Range: range } });
    expect(response.status()).toBe(206);
    expect(response.headers()["accept-ranges"]).toBe("bytes");
  }
  const invalid = await request.get("http://localhost:3000/media/potala-journey-v2.mp4", { headers: { Range: "bytes=999999999999-" } });
  expect(invalid.status()).toBe(416);
  await page.goto("http://localhost:3000/potala-preview", { waitUntil: "networkidle" });
  await expect(page.locator("video")).toHaveAttribute("src", /potala-journey-v2\.mp4$/);
  const duration = await page.locator("video").evaluate((video) => video.duration);
  expect(duration).toBeCloseTo(89.167, 2);
  for (const target of [25, 50, 80]) {
    const actual = await page.locator("video").evaluate(async (video, time) => { video.currentTime = time; await new Promise(resolve => video.addEventListener("seeked", resolve, { once: true })); return { time: video.currentTime, paused: video.paused, seekable: video.seekable.length }; }, target);
    expect(actual.time).toBeCloseTo(target, 0);
    expect(actual.paused).toBe(true);
    expect(actual.seekable).toBeGreaterThan(0);
  }
});
