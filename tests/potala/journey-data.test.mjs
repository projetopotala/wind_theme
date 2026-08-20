import assert from "node:assert/strict";
import test from "node:test";
import {
  JOURNEY_DISCOVERIES,
  JOURNEY_REGIONS,
  findRelatedContent,
} from "../../outputs/js/home/journey-data.js";

const expected = [
  "quem-somos",
  "atendimentos",
  "cursos",
  "atividades",
  "profissionais",
  "programacao",
  "arte-cultura",
  "inspiracao",
];

test("define exatamente as oito regiões na ordem narrativa", () => {
  assert.deepEqual(JOURNEY_REGIONS.map((region) => region.id), expected);
  assert.ok(JOURNEY_REGIONS.every((region) => region.href && region.href !== "#"));
});

test("drag lateral existe somente em duas regiões", () => {
  assert.deepEqual(
    JOURNEY_REGIONS.filter((region) => region.lateral).map((region) => region.id),
    ["atendimentos", "profissionais"],
  );
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
