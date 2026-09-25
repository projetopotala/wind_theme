import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { BLOCOS } from "../../ilhas/cenas-blocos/blocos.js";
import { ICONES } from "../../ilhas/cenas-blocos/icones.js";
import { CATEGORIAS } from "../../outputs/js/blog/blog-data.js";

const raiz = new URL("../../", import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), "utf8");
const html = ler("outputs/atendimentos-conceito.html");
const cenas = [...html.matchAll(/<section class="home-scene[^"]*" id="([^"]+)"/g)].map((achado) => achado[1]);

test("cada cena tem quatro blocos do que há na seção, sem rótulo repetido", () => {
  assert.equal(cenas.length, 13);
  assert.deepEqual(Object.keys(BLOCOS), cenas, "um conjunto por cena, na ordem da página");
  const rotulos = Object.values(BLOCOS).flat().map((bloco) => bloco.rotulo);
  assert.equal(new Set(rotulos).size, rotulos.length, "repetição é ruim");
  for (const [cena, blocos] of Object.entries(BLOCOS)) {
    assert.equal(blocos.length, 4, cena);
    for (const { rotulo, dica } of blocos) {
      assert.ok(rotulo.length <= 22, `rótulo pequeno: ${rotulo}`);
      assert.ok(dica.length <= 30, `dica curta: ${dica}`);
    }
  }
});

test("todo bloco leva a um trecho que existe na página da seção", () => {
  const categorias = new Set(CATEGORIAS.map(({ id }) => id));
  for (const { rotulo, href } of Object.values(BLOCOS).flat()) {
    const [, arquivo, busca, ancora] = /^([a-z-]+\.html)(\?[^#]*)?(?:#(.+))?$/.exec(href) ?? [];
    assert.ok(arquivo && existsSync(new URL(`outputs/${arquivo}`, raiz)), `${rotulo}: ${href}`);
    if (ancora) assert.match(ler(`outputs/${arquivo}`), new RegExp(`id="${ancora}"`), `${rotulo}: âncora #${ancora}`);
    if (busca) assert.ok(categorias.has(new URLSearchParams(busca).get("categoria")), `${rotulo}: categoria do blog`);
  }
});

test("os ícones são do Lucide, baixados pelo script, e só têm formas de traço", () => {
  for (const { rotulo, icone } of Object.values(BLOCOS).flat()) assert.ok(ICONES[icone]?.length, `${rotulo}: ${icone}`);
  const formas = new Set(Object.values(ICONES).flat().map(([tag]) => tag));
  for (const forma of formas) assert.ok(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"].includes(forma));
  assert.match(ler("ilhas/cenas-blocos/icones.js"), /Lucide 1\.46\.0 \(lucide-static\) — ISC License/);
  assert.match(ler("package.json"), /"vendor:lucide-blocos": "node scripts\/vendor-lucide-blocos\.mjs"/);
});

test("o bloco é um SpotlightCard do React Bits, com a luz seguindo o mouse e o ícone redesenhado com GSAP", () => {
  const cartao = ler("ilhas/cenas-blocos/reactbits/SpotlightCard.jsx");
  const estilo = ler("ilhas/cenas-blocos/reactbits/SpotlightCard.css");
  const bloco = ler("ilhas/cenas-blocos/BlocosDaCena.jsx");
  assert.match(cartao, /SpotlightCard — React Bits \(https:\/\/reactbits\.dev\), por David Haz/);
  assert.ok(existsSync(new URL("ilhas/cenas-blocos/reactbits/LICENSE.md", raiz)));
  assert.match(cartao, /setProperty\("--mouse-x"/);
  assert.match(estilo, /radial-gradient\(circle at var\(--mouse-x\) var\(--mouse-y\), var\(--spotlight-color\), transparent 80%\)/);
  /* O ícone se redesenha (o traço corre de novo), como os títulos. */
  assert.match(bloco, /from "gsap"/);
  assert.match(bloco, /useGSAP/);
  assert.match(bloco, /strokeDashoffset/);
  assert.match(bloco, /contextSafe/);
  /* Sem animação para quem pede movimento reduzido, nem no toque. */
  assert.match(bloco, /prefers-reduced-motion: reduce/);
  assert.match(bloco, /pointerType === "touch"/);
});

test("os blocos chegam pré-renderizados no HTML, abaixo do texto e acima do convite", () => {
  for (const cena of cenas) {
    const inicio = html.indexOf(`id="${cena}"`);
    const trecho = html.slice(inicio, html.indexOf("</section>", inicio));
    const texto = trecho.search(/<p>[^<]/);
    const ilha = trecho.indexOf(`<div class="cena-blocos-ilha" data-blocos-cena="${cena}"><!--blocos:${cena}-->`);
    const convite = trecho.search(/<(a|nav) (href|class="home-scene__links")/);
    assert.ok(texto > 0 && ilha > texto && convite > ilha, `${cena}: texto, blocos, convite`);
    for (const { rotulo, href } of BLOCOS[cena]) {
      assert.ok(trecho.includes(rotulo.replace("&", "&amp;")), `${cena}: ${rotulo} já no HTML`);
      assert.ok(trecho.includes(`href="${href}"`), `${cena}: ${href}`);
    }
    assert.ok(trecho.includes(`<!--/blocos:${cena}--></div>`));
  }
  assert.match(html, /<link rel="stylesheet" href="js\/cenas-blocos\/blocos\.css">/);
  assert.match(html, /<script type="module" src="js\/cenas-blocos\/blocos\.js"><\/script>/);
  assert.ok(existsSync(new URL("outputs/js/cenas-blocos/blocos.js", raiz)), "rode npm run build:blocos");
  assert.match(ler("package.json"), /"build:blocos": "node scripts\/build-cenas-blocos\.mjs"/);
});

test("os blocos entram na conta do texto: a foto e a linha da jornada também se afastam deles", () => {
  const ensaio = ler("outputs/js/home/editorial-essay.js");
  assert.match(ensaio, /const TEXTOS_MENORES = '[^']*\.cena-blocos[^']*'/);
});

test("os blocos aparecem junto com o texto digitado, nunca parados antes", () => {
  const css = ler("outputs/css/home-editorial-essay.css");
  const traco = ler("outputs/js/home/titulo-traco.js");
  assert.match(css, /html\.cenas-escritas \.cena-blocos-ilha:not\(\[data-escrito\]\) li \{[^}]*opacity: 0;/);
  assert.match(traco, /blocosDe\(titulo\)\?\.setAttribute\("data-escrito", ""\)/);
});
