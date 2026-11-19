import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../../outputs/${file}`, import.meta.url), "utf8");
const canonical = read("travessia.html");
const demo = read("ux02-chapters.html");

test("a rota pública Travessia usa a composição UX-02 sem redirecionamento", () => {
  assert.match(canonical, /<title>Instituto Potala — A Travessia<\/title>/);
  assert.match(canonical, /data-story-page="true"/);
  assert.match(canonical, /js\/ux02-chapters\.js/);
  assert.match(canonical, /id="chapters-list"/);
  assert.doesNotMatch(canonical, /http-equiv="refresh"|location\.href|ux02-chapters\.html/);
});

test("a rota demonstrativa declara a Travessia canônica", () => {
  assert.match(demo, /rel="canonical" href="\/travessia\.html"/);
});

test("Chegada, caminhos rápidos e capítulos preservam destinos públicos reais", () => {
  assert.match(read("transcender.html"), /travessia\.html/);
  for (const destination of ["recepcao.html", "atendimentos.html", "cursos.html", "atividades.html", "profissionais.html", "programacao.html", "cultura.html", "marketplace.html"]) {
    assert.ok(existsSync(new URL(`../../outputs/${destination}`, import.meta.url)), destination);
  }
  for (const destination of ["recepcao.html", "atendimentos.html", "cursos.html", "atividades.html", "profissionais.html", "programacao.html", "cultura.html"]) {
    assert.match(canonical, new RegExp(`href="${destination.replace(".", "\\.")}"`), destination);
  }
});

test("Explore o Instituto agrupa caminhos públicos e preserva microdescrições", () => {
  for (const destination of ["quem-somos.html", "recepcao.html", "atendimentos.html", "cursos.html", "atividades.html", "profissionais.html", "programacao.html", "cultura.html", "inspiracao.html", "blog.html", "revista.html", "marketplace.html"]) {
    assert.ok(existsSync(new URL(`../../outputs/${destination}`, import.meta.url)), destination);
    assert.match(canonical, new RegExp(`href="${destination.replace(".", "\\.")}"`), destination);
  }
  for (const group of ["Conheça o Potala", "Cuidado e aprendizagem", "Experiências e cultura", "Conteúdos e publicações"]) {
    assert.match(canonical, new RegExp(`<h3[^>]*>${group}</h3>`));
  }
});
