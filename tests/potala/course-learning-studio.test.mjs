import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCourseInterest,
  getCohortProgress,
  resolveLearningAdvice,
} from "../../outputs/js/courses/learning-studio.js";

test("a orientação distingue escolha pontual de percurso formativo", () => {
  assert.deepEqual(resolveLearningAdvice("choose"), {
    eyebrow: "Uma conversa antes da escolha",
    title: "Compare possibilidades com alguém experiente.",
    description: "Um encontro breve ajuda a esclarecer diferenças entre cursos, formatos e níveis de aprofundamento.",
    nextStep: "Solicitar conversa de orientação",
  });

  assert.deepEqual(resolveLearningAdvice("path"), {
    eyebrow: "Um percurso feito com você",
    title: "Organize experiências que conversem entre si.",
    description: "A mentoria aproxima objetivos pessoais ou profissionais de cursos, práticas e encontros que façam sentido em sequência.",
    nextStep: "Conhecer as mentorias",
  });
});

test("a proposta de curso normaliza uma preferência válida", () => {
  assert.deepEqual(buildCourseInterest({
    topic: "  Filosofia e meditação  ",
    modality: "online",
    availability: ["noite", "sábado"],
    goal: "  criar uma prática contínua ",
  }), {
    topic: "Filosofia e meditação",
    modality: "Online",
    availability: ["Noite", "Sábado"],
    goal: "criar uma prática contínua",
  });
});

test("a proposta incompleta não produz uma confirmação enganosa", () => {
  assert.throws(
    () => buildCourseInterest({ topic: "Yoga", modality: "", availability: [] }),
    /modalidade e ao menos um período/i,
  );
});

test("o acompanhamento situa a turma sem ultrapassar os limites", () => {
  assert.deepEqual(getCohortProgress(2, 5), {
    currentStage: 2,
    completedStages: 2,
    percentage: 50,
  });
  assert.equal(getCohortProgress(20, 5).percentage, 100);
  assert.equal(getCohortProgress(-3, 5).percentage, 0);
});
