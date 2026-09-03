import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  JOURNEY_DISCOVERIES,
  JOURNEY_REGIONS,
  findRelatedContent,
} from "../../outputs/js/home/journey-data.js";

/*
 * A ordem importa além da narrativa: o lado de cada bloco nasce da posição
 * (par à esquerda, ímpar à direita) e os pares se formam de dois em dois. A
 * Recepção vem logo depois de "Quem somos" para dividir a passagem com ela.
 */
const expected = [
  "quem-somos",
  "recepcao",
  "atendimentos",
  "cursos",
  "atividades",
  "profissionais",
  "programacao",
  "arte-cultura",
  "marketplace",
  "inspiracao",
];

test("define exatamente as dez regiões na ordem narrativa", () => {
  assert.deepEqual(JOURNEY_REGIONS.map((region) => region.id), expected);
  assert.ok(JOURNEY_REGIONS.every((region) => region.href && region.href !== "#"));
});

test("drag lateral existe somente em duas regiões", () => {
  assert.deepEqual(
    JOURNEY_REGIONS.filter((region) => region.lateral).map((region) => region.id),
    ["atendimentos", "profissionais"],
  );
});

test("profissionais usa uma composição central explícita", () => {
  const professionals = JOURNEY_REGIONS.find((region) => region.id === "profissionais");
  assert.equal(professionals?.contentPlacement, "center");
});

test("relações apontam para conteúdo existente", () => {
  const ids = new Set([
    ...JOURNEY_REGIONS.map((item) => item.id),
    ...JOURNEY_DISCOVERIES.map((item) => item.id),
  ]);
  for (const item of [...JOURNEY_REGIONS, ...JOURNEY_DISCOVERIES]) {
    assert.ok((item.relatedContent || []).every((id) => ids.has(id)));
  }
  assert.ok(findRelatedContent("sono-reflexao").length > 0);
});

test("cada região leva a uma página local própria", async () => {
  const expectedDestinations = [
    "quem-somos.html",
    // A Recepção ganhou página própria; antes emprestava a dos Atendimentos.
    "recepcao.html",
    "atendimentos.html",
    "cursos.html",
    "atividades.html",
    "profissionais.html",
    "programacao.html",
    "cultura.html",
    "marketplace.html",
    "inspiracao.html",
  ];
  assert.deepEqual(JOURNEY_REGIONS.map((region) => region.href), expectedDestinations);
  for (const destination of expectedDestinations) {
    const html = await readFile(new URL(`../../outputs/${destination}`, import.meta.url), "utf8").catch(() => null);
    assert.ok(html, destination);
  }
});


/*
 * Os blocos editáveis nascem com as relações da jornada.
 *
 * Elas vivem em JOURNEY_REGIONS, e DEFAULT_HOME_BLOCKS nascia sem elas: a lista
 * de caminhos do painel do bloco ficava vazia sem erro, sem espaço em branco e
 * sem nada que indicasse a falta.
 */
test("os blocos padrão carregam os caminhos relacionados", async () => {
  const { DEFAULT_HOME_BLOCKS, JOURNEY_DISCOVERIES } = await import("../../outputs/js/home/journey-data.js");
  const comRelacoes = DEFAULT_HOME_BLOCKS.filter((bloco) => bloco.relatedContent.length);
  assert.ok(comRelacoes.length >= 5, `só ${comRelacoes.length} blocos têm caminhos`);

  /*
   * E cada id apontado precisa existir — entre as descobertas OU entre os
   * próprios blocos. As relações usam os dois: "recepcao" leva a uma
   * descoberta, "atendimentos" a outro bloco. Um id órfão vira uma linha que
   * nunca aparece, e ninguém descobre por quê.
   */
  const conhecidos = new Set([
    ...JOURNEY_DISCOVERIES.map((item) => item.id),
    ...DEFAULT_HOME_BLOCKS.map((item) => item.id),
  ]);
  for (const bloco of DEFAULT_HOME_BLOCKS) {
    for (const id of bloco.relatedContent) {
      assert.ok(conhecidos.has(id), `${bloco.id} aponta para "${id}", que não existe`);
    }
  }
});
