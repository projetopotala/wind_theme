import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const arq = (rel) => new URL(`../../outputs/${rel}`, import.meta.url);
const ler = (rel) => readFileSync(arq(rel), "utf8");

/*
 * Microanimacoes (vela e folhas) apenas na cena de terapia da Home. A foto continua sendo a mesma;
 * o efeito e um canvas sobreposto, criado so com a cena visivel e sem prefers-reduced-motion.
 */
test("o módulo da cena viva é carregado só pela Home e só atua em #ensaio-atendimentos", () => {
  const js = ler("js/home/cena-viva.js");
  assert.match(js, /const CENA = "ensaio-atendimentos"/);
  assert.match(js, /getElementById\(CENA\)/);
  assert.equal((js.match(/getElementById\(/g) || []).length, 1, "nenhuma outra cena é tocada");
  assert.ok(ler("atendimentos-conceito.html").includes('src="js/home/cena-viva.js"'));
  for (const pagina of ["travessia.html", "transcender.html", "transcendido.html", "index.html"]) {
    if (existsSync(arq(pagina))) assert.doesNotMatch(ler(pagina), /cena-viva\.js/, pagina);
  }
});

test("respeita movimento reduzido, visibilidade da cena e aba oculta; sem WebGL2 a foto estática segue", () => {
  const js = ler("js/home/cena-viva.js");
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /IntersectionObserver/);
  assert.match(js, /document\.hidden/);
  assert.match(js, /getContext\("webgl2"/);
  assert.match(js, /INTERVALO_MS = 1000 \/ 30/);
  assert.match(js, /catch \{/);
});

test("a foto original não foi alterada e a máscara é um recurso pequeno específico da cena", () => {
  const html = ler("atendimentos-conceito.html");
  assert.match(html, /id="ensaio-atendimentos"[\s\S]*?src="media\/atendimentos-conceito\/ambiente\.webp"/);
  assert.equal(statSync(arq("media/atendimentos-conceito/ambiente.webp")).size, 133364);
  const mascara = statSync(arq("media/atendimentos-conceito/ambiente-viva-mascara.webp")).size;
  assert.ok(mascara > 500 && mascara < 20000, `máscara com ${mascara} bytes`);
});

test("o canvas não usa a classe da imagem principal (edição e recorte da jornada seguem na <img>)", () => {
  const js = ler("js/home/cena-viva.js");
  assert.match(js, /className = "home-scene__live"/);
  assert.doesNotMatch(js, /className = "home-scene__main-image"/);
});
