import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { MENU_ITEMS, itemAtual, menuHtml } from "../../outputs/js/shared/portal-menu.js";

const outputs = new URL("../../outputs/", import.meta.url);
const ler = (rel) => readFileSync(new URL(rel, outputs), "utf8");

test("a Home de exploração leva à Travessia e a matéria de Atendimentos tem item próprio", () => {
  const porChave = Object.fromEntries(MENU_ITEMS.map((i) => [i.key, i]));
  assert.equal(porChave.home.href, "travessia.html");
  assert.match(porChave.home.label, /Explorar o Potala/);
  assert.equal(porChave.materia.href, "transcendido.html");
  assert.equal(porChave.atendimentos.href, "atendimentos.html");
  assert.equal(porChave.travessia, undefined, "a Travessia não pode aparecer duas vezes no menu");
});

test("a Home do Instituto (Bem-vindo, com todas as áreas) tem item próprio, separado da Travessia e da matéria de Atendimentos", () => {
  const porChave = Object.fromEntries(MENU_ITEMS.map((i) => [i.key, i]));
  assert.equal(porChave.institucional.href, "atendimentos-conceito.html");
  assert.match(porChave.institucional.label, /Home do Instituto/);
  assert.notEqual(porChave.institucional.href, porChave.home.href);
  assert.notEqual(porChave.institucional.href, porChave.materia.href);
  assert.equal(porChave.home.href, "travessia.html", "a Travessia continua no mesmo item");
  const home = ler("atendimentos-conceito.html");
  const gaveta = /<nav class="drawer-grid drawer-portal"[\s\S]*?<\/nav>/.exec(home)?.[0] || "";
  for (const pagina of ["atendimentos.html", "cursos.html", "profissionais.html", "blog.html", "marketplace.html", "cultura.html", "travessia.html"]) {
    assert.ok(gaveta.includes(`href="${pagina}"`), `a Home do Instituto não leva a ${pagina}`);
  }
  assert.match(home, /eventos\.html/, "a Home do Instituto leva a Eventos");
  assert.match(home, /js\/shared\/portal-menu-boot\.js/, "a Home do Instituto tem o menu para sair dela");
});

test("o menu não repete destinos nem cria laço: cada destino aparece uma única vez", () => {
  const destinos = MENU_ITEMS.map((i) => i.href);
  assert.equal(new Set(destinos).size, destinos.length);
  for (const item of MENU_ITEMS) assert.ok(MENU_ITEMS.some((i) => i.key === item.key));
  assert.equal(itemAtual("/travessia.html"), "home");
  assert.equal(itemAtual("/transcendido.html"), "materia");
  assert.equal(itemAtual("/transcender.html"), "chegada");
  assert.equal(itemAtual("/atendimentos.html"), "atendimentos");
});

test("o item da página aberta é o único marcado no menu, em qualquer das duas páginas", () => {
  for (const pagina of ["travessia", "transcendido"]) {
    const html = menuHtml(itemAtual(`/${pagina}.html`));
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1, pagina);
  }
});

test("a matéria de Atendimentos continua existindo, com o mesmo corpo e o menu para sair dela", () => {
  assert.ok(existsSync(new URL("transcendido.html", outputs)));
  const html = ler("transcendido.html");
  assert.match(html, /<body data-page="transcendido">/);
  assert.match(html, /js\/shared\/portal-menu-boot\.js/);
  assert.match(html, /href="travessia\.html"/, "a matéria precisa de um caminho para a Travessia");
});

test("nenhum link 'Voltar à travessia' ou marca leva à matéria de Atendimentos", () => {
  const paginas = readdirSync(outputs).filter((f) => f.endsWith(".html") && f !== "transcendido.html" && f !== "admin.html");
  for (const arquivo of paginas) {
    const html = ler(arquivo);
    for (const m of html.matchAll(/<a\b[^>]*href="\/?transcendido\.html(?:#[^"]*)?"[^>]*>([^<]*)/g)) {
      assert.doesNotMatch(m[1], /travessia|início|portal/i, `${arquivo}: "${m[1].trim()}" não pode apontar para transcendido.html`);
    }
    assert.doesNotMatch(html, /<a\b[^>]*aria-label="[^"]*travessia[^"]*"[^>]*href="\/?transcendido\.html/i, arquivo);
    assert.doesNotMatch(html, /<a\b[^>]*href="\/?transcendido\.html"[^>]*aria-label="[^"]*(travessia|início)/i, arquivo);
  }
});

test("o atalho da Travessia nomeia o destino real e as páginas de seção voltam à Travessia", () => {
  const cena = ler("js/home/home-scenes.js");
  assert.match(cena, /href="transcendido\.html"[^>]*>Ler a matéria de Atendimentos/);
  assert.doesNotMatch(cena, /Ir direto para a Home/);
  const header = ler("js/shared/portal-header.js");
  assert.match(header, /travessiaHref = "travessia\.html"/);
  assert.match(header, /class="portal-header__brand" href="travessia\.html"/);
  assert.match(ler("js/secoes.js"), /site-nav-marca" href="travessia\.html"/);
});

test("a Chegada e o fluxo da raiz não mudam", () => {
  const raiz = ler("index.html");
  assert.match(raiz, /destinoDaRaiz/);
  assert.match(raiz, /transcender\.html/);
  assert.match(readFileSync(new URL("js/conta/link-recuperacao.js", outputs), "utf8"), /"\/redefinir-senha" : "\/transcender\.html"/);
  assert.match(readFileSync(new URL("js/chegada/transition-handoff.js", outputs), "utf8"), /destination = "travessia\.html"/);
});

test("o Admin leva a Home de verdade: links e previa apontam para a Travessia", () => {
  const admin = ler("admin.html");
  assert.match(admin, /<a href="\/travessia\.html">Ver a Home<\/a>/);
  assert.match(admin, /href="\/travessia\.html" target="_blank" rel="noopener">Visualizar site/);
  assert.match(admin, /data-admin-leave href="\/travessia\.html">Voltar ao site/);
  assert.match(admin, /<iframe data-admin-preview src="\/travessia\.html\?admin-preview=1"/);
  /* A materia de Atendimentos nao e a Home e nao recebe a previa. */
  assert.doesNotMatch(admin, /(?:href|src)="\/transcendido\.html/);
});

test("a pagina da previa e a que sabe receber a previa", () => {
  const travessia = ler("travessia.html");
  assert.match(travessia, /<body data-story-page="true">/);
  assert.match(travessia, /id="journey-root"/);
  assert.match(travessia, /src="js\/secoes\.js"/);
  const controlador = readFileSync(new URL("js/home/home-controller.js", outputs), "utf8");
  assert.match(controlador, /get\("admin-preview"\) === "1"/);
  assert.match(controlador, /createHomeAdminPreview/);
  const materia = ler("transcendido.html");
  assert.doesNotMatch(materia, /journey-root/);
  assert.doesNotMatch(materia, /secoes\.js/);
});

test("o canal da previa so aceita o mesmo dominio e a janela que a abriu, e nao grava nada", () => {
  const previa = readFileSync(new URL("js/home/admin-preview.js", outputs), "utf8");
  assert.match(previa, /event\.source !== source \|\| event\.origin !== origin/);
  assert.doesNotMatch(previa, /supabase|\.insert\(|\.update\(|\.upsert\(|\.rpc\(|fetch\(/i);
  const controlador = readFileSync(new URL("js/admin/admin-controller.js", outputs), "utf8");
  assert.match(controlador, /event\.source !== previewFrame\?\.contentWindow/);
  assert.match(controlador, /previewOrigin === "null" \? "\*" : previewOrigin/);
});

test("nenhum cabecalho do site impede o iframe da previa", () => {
  const config = JSON.parse(readFileSync(new URL("vercel.json", outputs), "utf8"));
  assert.equal(config.headers, undefined);
  for (const pagina of ["travessia.html", "admin.html"]) {
    assert.doesNotMatch(ler(pagina), /Content-Security-Policy|frame-ancestors|X-Frame-Options/i);
  }
});
