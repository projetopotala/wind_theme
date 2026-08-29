import assert from "node:assert/strict";
import test from "node:test";

import {
  ARRIVAL_CONCEPTS,
  EXPERIENCE_SETTINGS,
  JOURNEY_CONTENT,
  JOURNEY_PROLOGUE,
  JOURNEY_TRANSITIONS,
  PRIMARY_CONTENT_IDS,
  SECONDARY_CONTENT_IDS,
} from "../../features/potala-journey/data/journey-content";

test("preserva o prologo da Home narrativa", () => {
  assert.deepEqual(JOURNEY_PROLOGUE, {
    eyebrow: "Ecossistema Digital Potala",
    title: "Bem-vindo.",
    description: "O caminho continua.",
  });
});

test("preserva as oito regioes principais na ordem original", () => {
  assert.deepEqual(PRIMARY_CONTENT_IDS, [
    "quem-somos",
    "atendimentos",
    "cursos",
    "atividades",
    "profissionais",
    "programacao",
    "arte-cultura",
    "inspiracao",
  ]);
  assert.deepEqual(
    PRIMARY_CONTENT_IDS.map((id) => JOURNEY_CONTENT[id]?.title),
    ["Quem somos", "Atendimentos", "Cursos", "Atividades", "Profissionais", "Programação", "Arte e cultura", "Inspiração"],
  );
  assert.ok(PRIMARY_CONTENT_IDS.every((id) => JOURNEY_CONTENT[id]?.description));
});

test("preserva as frases de transicao sem reescrita", () => {
  assert.deepEqual(JOURNEY_TRANSITIONS.map((item) => item.description), [
    "Conhecer também é uma forma de chegar.",
    "Cuidar também é aprender.",
    "Conhecimento também precisa ser vivido.",
    "Você não precisa conhecer tudo hoje.",
  ]);
});

test("mantem os onze conteudos secundarios no manifesto", () => {
  assert.deepEqual(SECONDARY_CONTENT_IDS, [
    "recepcao", "atendimento-online", "saude-integrativa", "sono-reflexao", "blog", "revista",
    "eventos", "novos-profissionais", "loja", "empresas", "acao-social",
  ]);
  assert.ok(SECONDARY_CONTENT_IDS.every((id) => JOURNEY_CONTENT[id]));
});

test("destinos genericos permanecem pendentes e nao se tornam links publicos", () => {
  const pending = ["sono-reflexao", "blog", "revista", "loja", "empresas", "acao-social"];
  for (const id of pending) {
    assert.equal(JOURNEY_CONTENT[id]?.status, "pending-destination");
    assert.equal(JOURNEY_CONTENT[id]?.actions?.length ?? 0, 0);
  }
});

test("Trabalhe Conosco fica reservado sem conteudo inventado", () => {
  assert.deepEqual(JOURNEY_CONTENT["trabalhe-conosco"], {
    id: "trabalhe-conosco",
    category: "Trabalhe Conosco",
    kind: "secondary",
    importance: "secondary",
    status: "pending-content",
  });
});

test("preserva os oito significados e poemas da Chegada", () => {
  assert.deepEqual(
    ARRIVAL_CONCEPTS.map((item) => item.role),
    ["Tempo", "Presença", "Fluxo", "Pausa", "Horizonte", "Caminho", "Escuta", "Entrada"],
  );
  assert.ok(ARRIVAL_CONCEPTS.every((item) => item.poem?.length === 3));
});

test("preserva respiracao e audio como infraestrutura opt-in desativada", () => {
  assert.deepEqual(EXPERIENCE_SETTINGS.breathing, { patternSeconds: [3, 3, 3], cycles: 8, enabled: false });
  assert.equal(EXPERIENCE_SETTINGS.audio.autoplay, false);
  assert.equal(EXPERIENCE_SETTINGS.audio.optIn, true);
  assert.equal(EXPERIENCE_SETTINGS.audio.enabled, false);
});
