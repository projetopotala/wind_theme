import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCourseInterest,
  createCourseInterestSender,
  courseInterestFeedback,
  getCohortProgress,
  mountLearningStudio,
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

test("o envio de interesse bloqueia repetição pendente e duplicata após sucesso", async () => {
  const calls = [];
  let release;
  const send = createCourseInterestSender((payload) => {
    calls.push(payload);
    return new Promise((resolve) => { release = resolve; });
  });
  const interest = buildCourseInterest({ topic: "Yoga", modality: "online", availability: ["noite"] });
  const first = send(interest);
  assert.equal(await send(interest), "pending");
  assert.equal(calls.length, 1);
  release();
  assert.equal(await first, "sent");
  assert.equal(await send(interest), "duplicate");
  assert.equal(calls.length, 1);
  const changed = send({ ...interest, topic: "Meditação" });
  assert.equal(calls.length, 2);
  release();
  assert.equal(await changed, "sent");
});

test("falha no envio não impede nova tentativa", async () => {
  let calls = 0;
  const send = createCourseInterestSender(async () => {
    calls++;
    if (calls === 1) throw new Error("rede indisponível");
  });
  const interest = buildCourseInterest({ topic: "Yoga", modality: "online", availability: ["noite"] });
  await assert.rejects(send(interest), /rede indisponível/);
  assert.equal(await send(interest), "sent");
  assert.equal(calls, 2);
});

test("resultado pendente ou inesperado nunca confirma envio de interesse", () => {
  const pending = courseInterestFeedback("pending");
  assert.match(pending.message, /Enviando/);
  assert.notEqual(pending.state, "success");
  assert.doesNotMatch(pending.message, /enviado|já pode ver/i);
  assert.match(courseInterestFeedback("duplicate").message, /já foi enviado/i);
  assert.match(courseInterestFeedback("sent").message, /Interesse enviado/i);
  assert.throws(() => courseInterestFeedback("unexpected"), /desconhecido/i);
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

test("o mesmo formulário libera nova tentativa depois de falha de rede", async () => {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const status = { textContent: "", dataset: {} };
  const button = {
    disabled: false,
    setAttribute(name) { if (name === "disabled") this.disabled = true; },
    removeAttribute(name) { if (name === "disabled") this.disabled = false; },
  };
  const review = { hidden: true, focus() {} };
  let onSubmit;
  let rejectFirst;
  let attempts = 0;
  const form = {
    querySelector() { return button; },
    addEventListener(name, listener) { if (name === "submit") onSubmit = listener; },
    removeEventListener() {},
  };
  const elements = {
    "[data-course-interest-form]": form,
    "[data-interest-status]": status,
    "[data-interest-review]": review,
    "[data-interest-topic]": { textContent: "" },
    "[data-interest-format]": { textContent: "" },
    "[data-interest-goal]": { textContent: "" },
  };
  const studio = {
    querySelector(selector) { return elements[selector] ?? null; },
    querySelectorAll() { return []; },
  };
  const root = { querySelector() { return studio; } };

  globalThis.FormData = class {
    constructor(target) { assert.equal(target, form); }
    get(name) { return { topic: "Yoga", modality: "online", goal: "", contact: "" }[name] ?? null; }
    getAll(name) { return name === "availability" ? ["noite"] : []; }
  };
  globalThis.fetch = (url, options) => {
    assert.match(String(url), /\/rest\/v1\/site_interests$/);
    assert.equal(options.method, "POST");
    attempts++;
    if (attempts === 1) return new Promise((_, reject) => { rejectFirst = reject; });
    return Promise.resolve(new Response(null, { status: 204 }));
  };

  try {
    const mounted = mountLearningStudio(root);
    const event = { preventDefault() {} };
    const first = onSubmit(event);
    assert.equal(button.disabled, true);
    await onSubmit(event);
    assert.equal(attempts, 1, "um segundo evento não envia enquanto o primeiro está pendente");
    rejectFirst(new Error("rede indisponível"));
    await first;
    assert.equal(button.disabled, false);
    assert.equal(status.dataset.state, "error");
    assert.equal(review.hidden, true);

    await onSubmit(event);
    assert.equal(attempts, 2);
    assert.equal(button.disabled, false);
    assert.equal(status.dataset.state, "success");
    assert.equal(review.hidden, false);
    mounted.destroy();
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
  }
});
