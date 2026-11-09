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
  /* A matéria não disputa mais a primeira tela da Home: o atalho mora no painel de descoberta. */
  assert.doesNotMatch(cena, /journey-home-link/);
  assert.match(ler("js/home/portal-discovery.js"), /<a href="transcendido\.html">Ler a matéria de Atendimentos/);
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

test("o Admin segue apontando para o site, sem alteração nesta mudança", () => {
  const admin = ler("admin.html");
  assert.match(admin, /src="\/transcendido\.html\?admin-preview=1"/);
});

test("a primeira tela da Home não leva à matéria e o prefixo do atalho mora no painel de descoberta", async () => {
  const { renderPortalDiscovery } = await import("../../outputs/js/home/portal-discovery.js");
  const painel = renderPortalDiscovery();
  assert.match(painel, /class="discovery-matter"[^>]*>Prefere ler com calma sobre o cuidado\? <a href="transcendido\.html">Ler a matéria de Atendimentos/);
  assert.ok(ler("css/portal-discovery.css").includes(".discovery-matter a:focus-visible"), "o atalho precisa de foco visível");
});

test("cada área com imagem mostra a fotografia no cartão fechado, sem segunda fonte", async () => {
  const { renderRegion } = await import("../../outputs/js/home/home-scenes.js");
  const bloco = (extra) => ({
    id: "cursos", slug: "cursos", category: "O conhecimento", title: "Cursos",
    summary: "Cuidar também é aprender.", body: "Texto longo do bloco.", tags: [], href: "cursos.html",
    side: "left", editorialVariant: "standard", ...extra,
  });
  const comImagem = renderRegion(bloco({ image: "media/atendimentos-vidraca-1.webp" }), 3, null, new Map());
  assert.match(comImagem, /<span class="region-thumb" aria-hidden="true"><img src="media\/atendimentos-vidraca-1\.webp" alt=""/);
  assert.match(comImagem, /region-title" id="cursos-title">Cursos</);
  assert.match(comImagem, /region-description">Cuidar também é aprender\./);
  const semImagem = renderRegion(bloco({ image: "" }), 3, null, new Map());
  /* Sem fotografia o cartão mantém a faixa como moldura, sem <img>: os doze cartões têm a mesma composição. */
  assert.match(semImagem, /<span class="region-thumb region-thumb--vazia" aria-hidden="true"><\/span>/);
  assert.doesNotMatch(semImagem, /region-thumb"[^>]*><img/);
  const fonteInsegura = renderRegion(bloco({ image: "javascript:alert(1)" }), 3, null, new Map());
  assert.doesNotMatch(fonteInsegura, /javascript:|<img/);
  assert.match(fonteInsegura, /region-thumb--vazia/);
});

test("a faixa de imagem some no bloco aberto e no telefone baixo, onde o cartão já é justo", () => {
  const css = ler("css/home-journey.css");
  assert.match(css, /\.journey-region\.is-expanded \.region-thumb \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 720px\) and \(max-height: 600px\) \{\s*\.region-thumb \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 720px\) and \(max-height: 720px\) \{/);
  assert.match(css, /\.region-thumb--vazia/);
});
