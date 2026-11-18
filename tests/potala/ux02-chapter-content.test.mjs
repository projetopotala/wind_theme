import assert from "node:assert/strict";
import test from "node:test";

import { JOURNEY_REGIONS } from "../../outputs/js/home/journey-data.js";
import { UX02_CHAPTER_CONTENT, chapterContentFor } from "../../outputs/js/ux02-chapter-content.js";

const chapters = JOURNEY_REGIONS.filter((item) => !String(item.id).startsWith("novidade-") && item.id !== "quem-somos");
const institutional = chapters.filter((item) => item.id !== "marketplace");

test("os dez capítulos institucionais possuem explicações profundas e estruturadas", () => {
  assert.equal(institutional.length, 10);
  for (const chapter of institutional) {
    const content = chapterContentFor(chapter.id);
    assert.ok(content, `conteúdo ausente: ${chapter.id}`);
    assert.ok(content.overview.length >= 150, `introdução curta: ${chapter.id}`);
    assert.ok(content.purpose.length >= 75, `finalidade curta: ${chapter.id}`);
    assert.ok(content.find.length >= 3, `poucos exemplos: ${chapter.id}`);
    assert.ok(content.audience.length >= 75, `público pouco explicado: ${chapter.id}`);
    assert.ok(content.difference.length >= 75, `diferença pouco explicada: ${chapter.id}`);
    assert.ok(content.start.length >= 75, `início pouco explicado: ${chapter.id}`);
    assert.ok(content.cta.length >= 10, `CTA ausente: ${chapter.id}`);
  }
});

test("Marketplace permanece fora do enriquecimento editorial", () => {
  assert.equal(chapterContentFor("marketplace"), null);
  assert.ok(!Object.hasOwn(UX02_CHAPTER_CONTENT, "marketplace"));
});

test("os textos não afirmam preço, vaga, data ou disponibilidade garantida", () => {
  const text = JSON.stringify(UX02_CHAPTER_CONTENT).toLowerCase();
  assert.doesNotMatch(text, /r\$|preço|temos vagas|vagas abertas|disponibilidade garantida|agendamento imediato/);
});
