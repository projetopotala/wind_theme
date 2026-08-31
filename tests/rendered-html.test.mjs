import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("preserva a rota raiz com o tunel estelar", async () => {
  const response = await render("/");
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /PRESSIONE E SEGURE EM QUALQUER LUGAR/);
  assert.doesNotMatch(html, /potala-experience/);
});

test("renderiza a nova experiencia somente em potala-preview", async () => {
  const response = await render("/potala-preview");
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Potala Experience/);
  assert.match(html, /Ecossistema Digital Potala/);
  assert.equal((html.match(/<video\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /autoplay|controls|loop/);
  for (const title of ["Quem somos", "Atendimentos", "Cursos", "Atividades", "Profissionais", "Programação", "Arte e cultura", "Inspiração"]) {
    assert.match(html, new RegExp(title));
  }
  for (const href of ["/quem-somos?from=journey", "/atendimentos?from=journey", "/cursos?from=journey", "/atividades?from=journey", "/profissionais?from=journey", "/programacao?from=journey", "/cultura?from=journey", "/inspiracao?from=journey"]) {
    assert.ok(html.includes(`href="${href}"`), href);
  }
  assert.match(html, />01</);
  assert.match(html, /Conhecer/);
  assert.doesNotMatch(html, /outputs\//);
  assert.doesNotMatch(html, /_legacy/);
  assert.match(html, /Ideias para continuar pensando/);
  assert.match(html, /Instituto Cultural Potala/);
  assert.match(html, /Rua 24 de Maio, 748/);
});
