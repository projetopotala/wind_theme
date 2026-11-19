import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buscarInstituto, documentosInstitucionais } from "../../outputs/js/ux02-institutional-search.js";

const indice = JSON.parse(await readFile(new URL("../../outputs/js/home/busca-indice.json", import.meta.url), "utf8"));

test("a busca institucional cobre áreas reais e exclui Marketplace", () => {
  const documentos = documentosInstitucionais();
  assert.ok(documentos.some((item) => item.id === "quem-somos"));
  assert.ok(documentos.some((item) => item.id === "recepcao"));
  assert.ok(!documentos.some((item) => item.id === "marketplace"));
  assert.ok(documentos.every((item) => item.href && item.summary));
});

test("a busca tolera acentos e encontra conteúdo indexado das páginas", () => {
  assert.equal(buscarInstituto("ORIENTAÇÃO", indice)[0]?.id, "recepcao");
  assert.equal(buscarInstituto("quero fazer yoga", indice)[0]?.id, "atividades");
  assert.ok(buscarInstituto("curso de desenho", indice).some((item) => item.id === "atividades"));
});

test("intenções práticas apontam para áreas verificáveis", () => {
  assert.equal(buscarInstituto("atendimento online", indice)[0]?.id, "atendimentos");
  assert.equal(buscarInstituto("onde encontro um profissional", indice)[0]?.id, "profissionais");
  assert.equal(buscarInstituto("onde vejo a programação", indice)[0]?.id, "programacao");
  assert.equal(buscarInstituto("não sei por onde começar", indice)[0]?.id, "recepcao");
});

test("uma consulta sem correspondência não inventa resultado", () => {
  assert.deepEqual(buscarInstituto("xilofone quântico", indice), []);
});
