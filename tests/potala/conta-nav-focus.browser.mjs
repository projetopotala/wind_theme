/* Regressão real: node tests/potala/conta-nav-focus.browser.mjs
 * Usa Playwright já instalado (ou POTALA_PLAYWRIGHT_MODULE) e Chrome opcional
 * em POTALA_CHROME_PATH. Não instala dependências nem permite rede externa.
 * POTALA_FOCUS_EVIDENCE_DIR, opcional, recebe capturas e medições fora do Git.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createPreviewServer } from "../../scripts/serve-outputs.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.POTALA_PLAYWRIGHT_MODULE || "playwright");
const server = createPreviewServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const evidence = process.env.POTALA_FOCUS_EVIDENCE_DIR;
if (evidence) await mkdir(evidence, { recursive: true });
const results = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.POTALA_CHROME_PATH ? { executablePath: process.env.POTALA_CHROME_PATH } : {}) });
  for (const [width, height] of [[320, 568], [375, 812], [390, 844], [768, 1024], [1366, 768], [1920, 1080]]) {
    // hasTouch: o mesmo contexto aceita clique de mouse e toque real (MP-FIX-03.9).
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const external = [], errors = [], samples = [];
    try {
      await context.route("**/*", (route) => {
        const request = route.request();
        if (new URL(request.url()).origin !== base || !["GET", "HEAD"].includes(request.method())) {
          external.push(request.url().split("?")[0]);
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(`${base}/meu-potala/salvos?demo=visita`);
      await page.waitForSelector(".mp-nav");
      async function measure(selector) {
        const control = page.locator(selector).first();
        await control.focus();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        // A rolagem suave da faixa precisa terminar antes da medição geométrica.
        await page.waitForTimeout(450);
        const sample = await control.evaluate((element) => {
          const style = getComputedStyle(element), rect = element.getBoundingClientRect();
          const extent = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
          const clipping = [];
          for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
            const css = getComputedStyle(ancestor), bounds = ancestor.getBoundingClientRect();
            if (css.contain.includes("paint") || ["auto", "scroll", "hidden"].includes(css.overflowX)) {
              if (rect.left - extent < bounds.left - 0.75 || rect.right + extent > bounds.right + 0.75
                || rect.top - extent < bounds.top - 0.75 || rect.bottom + extent > bounds.bottom + 0.75) clipping.push(ancestor.tagName);
            }
          }
          return { route: location.pathname, label: element.id || element.textContent.trim(), active: document.activeElement === element,
            innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
            outline: style.outline, clipping, left: rect.left, right: rect.right };
        });
        samples.push(sample);
        assert.equal(sample.innerWidth, width);
        assert.equal(sample.innerHeight, height);
        assert.equal(sample.scrollWidth, sample.clientWidth);
        assert.equal(sample.active, true);
        assert.equal(sample.outline, "rgb(129, 95, 52) solid 2px");
        assert.deepEqual(sample.clipping, [], `${width}: ${sample.label}`);
        assert.ok(sample.left >= 0 && sample.right <= width);
      }
      /*
       * MP-FIX-03.9 — MOUSE E TOQUE EM ABAS DA FAIXA.
       *
       * O defeito: o foco dado pelo próprio clique/toque fazia a faixa rolar no
       * meio da interação, e o clique terminava fora do link. O teste prepara a
       * faixa de forma determinística, clica ou toca na parte visível e confere
       * a ROTA FINAL — não só que um evento disparou.
       */
      const pointer = [];
      async function prepare(href, mode) {
        await page.goto(`${base}/meu-potala/salvos`);
        await page.waitForSelector(".mp-nav ul a");
        return page.evaluate(({ href, mode }) => {
          const strip = document.querySelector(".mp-nav ul");
          const link = strip.querySelector(`a[href="${href}"]`);
          strip.scrollLeft = 0;
          const max = strip.scrollWidth - strip.clientWidth;
          const offset = () => link.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
          if (mode === "partial") {
            /*
             * O caso do defeito: faixa no início, e só uma fatia do link à vista
             * na borda direita. Se nessa largura o link não estiver cortado no
             * início, a faixa é posta de modo que só 30% dele apareça.
             */
            if (max <= 0) return null;
            const cutAtStart = offset() < strip.clientWidth && offset() + link.offsetWidth > strip.clientWidth;
            if (!cutAtStart) strip.scrollLeft = Math.min(max, Math.max(0, offset() + link.offsetWidth * 0.3 - strip.clientWidth));
          } else {
            strip.scrollLeft = Math.min(max, Math.max(0, offset() - 8));
          }
          const s = strip.getBoundingClientRect(), r = link.getBoundingClientRect();
          const left = Math.max(r.left, s.left), right = Math.min(r.right, s.right);
          const partial = r.left < s.left - 0.5 || r.right > s.right + 0.5;
          if (right - left < 4 || (mode === "partial") !== partial) return null;
          return { x: (left + right) / 2, y: r.top + r.height / 2, partial, scrollLeft: strip.scrollLeft };
        }, { href, mode });
      }
      const targets = [
        ["/meu-potala/atendimentos", "partial"],
        ["/meu-potala/acompanhando", "partial"],
        ["/meu-potala", "full"],
        ["/meu-potala/historico", "full"],
      ];
      for (const [href, mode] of targets) {
        for (const input of ["mouse", "touch"]) {
          const point = await prepare(href, mode);
          if (!point) {
            pointer.push({ href, mode, input, result: "N/A (faixa sem rolagem ou link inteiro à vista nesta largura)" });
            continue;
          }
          if (input === "mouse") await page.mouse.click(point.x, point.y);
          else await page.touchscreen.tap(point.x, point.y);
          await page.waitForTimeout(500);
          const route = new URL(page.url()).pathname;
          pointer.push({ href, mode, input, route, result: route === href ? "PASS" : "FAIL" });
          assert.equal(route, href, `${width}x${height} ${input} em ${href} (${mode}): ficou em ${route}`);
        }
      }
      if (width === 320) {
        const blocking = pointer.filter((item) => item.href === "/meu-potala/atendimentos");
        assert.deepEqual(blocking.map((item) => item.result), ["PASS", "PASS"], "cenário bloqueante de 320px precisa ser exercitado");
      }
      // Depois de mouse/toque, o teclado continua revelando (não fica preso em "ponteiro").
      await page.goto(`${base}/meu-potala/salvos`);
      await page.waitForSelector(".mp-nav ul a");

      const links = await page.locator(".mp-nav ul a").count();
      for (let index = 0; index < links; index++) {
        await measure(`.mp-nav ul li:nth-child(${index + 1}) a`);
        if (evidence && (index === 0 || index === links - 1)) await page.screenshot({ path: join(evidence, `after-${width}-${index === 0 ? "first" : "last"}.png`) });
      }
      for (const name of ["salvos", "historico", "acompanhando", "perfil", "notificacoes"]) {
        await measure(`.mp-nav a[href="/meu-potala/${name}"]`);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(450);
        assert.equal(new URL(page.url()).pathname, `/meu-potala/${name}`);
        const active = await page.locator('.mp-nav [aria-current="page"]').evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { visible: r.left >= 0 && r.right <= innerWidth, width: innerWidth, height: innerHeight };
        });
        assert.deepEqual(active, { visible: true, width, height });
        if (name === "salvos") await measure("#mp-filtro-conteudos");
        if (name === "perfil") await measure("#mp-perfil-nome");
        if (name === "notificacoes") await measure("#mp-pref-novo_conteudo");
      }
      assert.deepEqual(external, []);
      assert.deepEqual(errors, []);
      results.push({ width, height, samples, pointer, external, errors });
      const applied = pointer.filter((item) => item.result === "PASS").length;
      console.log(`PASS ${width}x${height}: ${samples.length} controles, navegação e ausência de recortes; mouse/toque ${applied} PASS, ${pointer.length - applied} N/A`);
    } finally {
      await context.close();
    }
  }
} finally {
  if (evidence) await writeFile(join(evidence, "browser-results.json"), JSON.stringify(results, null, 2));
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
