import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const html = read("outputs/ux02-travessia.html");
const css = read("outputs/css/ux02-travessia.css");
const js = read("outputs/js/ux02-travessia.js");

test("protótipo UX-02 é uma rota isolada e não substitui a Chegada ou a Travessia", () => {
  assert.match(html, /Protótipo da Travessia Guiada/);
  assert.match(html, /data-start="guided"/);
  assert.match(html, /data-start="free"/);
  assert.match(html, /src="js\/ux02-travessia\.js"/);
  assert.match(html, /src="\/js\/assistente\/assistente-boot\.js"/);
  assert.doesNotMatch(read("outputs/transcender.html"), /ux02-travessia/);
  assert.doesNotMatch(read("outputs/travessia.html"), /ux02-travessia/);
});

test("três regiões usam necessidades cotidianas, contexto e destinos públicos", () => {
  for (const termo of ["Quero cuidar de mim", "Quero aprender", "Quero participar", "Atendimentos e profissionais", "Cursos e conhecimento", "Atividades e encontros"]) assert.match(html + js, new RegExp(termo));
  for (const destino of ["atendimentos.html", "profissionais.html", "cursos.html", "atividades.html", "recepcao.html", "quem-somos.html", "travessia.html"]) assert.match(html + js, new RegExp(destino.replace(".", "\\.")));
  assert.match(js, /prefers-reduced-motion/);
  assert.match(css, /prefers-reduced-motion/);
});

test("protótipo prioriza foco visível, toque e leitura sem depender de hover", () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height: 100svh/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /role="group"/);
});
