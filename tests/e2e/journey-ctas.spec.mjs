import { expect, test } from "@playwright/test";

const portals = [
  ["quem-somos", "/quem-somos?from=journey", "Quem somos"], ["atendimentos", "/atendimentos?from=journey", "Atendimentos"],
  ["cursos", "/cursos?from=journey", "Cursos"], ["atividades", "/atividades?from=journey", "Atividades"],
  ["profissionais", "/profissionais?from=journey", "Profissionais"], ["programacao", "/programacao?from=journey", "Programação"],
  ["arte-cultura", "/cultura?from=journey", "Arte e cultura"], ["inspiracao", "/inspiracao?from=journey", "Inspiração"],
];

test("os oito CTAs da jornada abrem rotas canônicas", async ({ page }) => {
  for (const [id, href, title] of portals) {
    await page.goto("http://localhost:3000/potala-preview", { waitUntil: "networkidle" });
    await page.locator(`#conteudo-${id}`).evaluate((element) => element.scrollIntoView({ block: "center" }));
    const cta = page.locator(`[aria-live] article[data-content-id='${id}'] a[href='${href}']`);
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", href);
    await cta.click();
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe(href.split("?")[0]);
    expect(new URL(page.url()).searchParams.get("from")).toBe("journey");
    expect(page.url()).not.toMatch(/_legacy|outputs|\.html/);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
});
