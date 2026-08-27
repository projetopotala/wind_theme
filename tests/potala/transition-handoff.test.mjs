import assert from "node:assert/strict";
import test from "node:test";

// Monta ambiente simulado com dublês para as funções de traversia
function montarAmbiente({ reducedMotion = false } = {}) {
  const eventos = [];
  const classes = { html: [], body: [] };
  let destino = null;

  globalThis.document = {
    documentElement: { dataset: {}, classList: { add: (c) => classes.html.push(c) } },
    body: { classList: { add: (c) => classes.body.push(c) } },
    dispatchEvent: (evento) => eventos.push(evento.type),
  };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.matchMedia = () => ({ matches: reducedMotion });
  globalThis.location = { assign: (url) => { destino = url; } };
  // Dispara na hora: o teste não deve depender de tempo real.
  globalThis.window = { setTimeout: (fn) => { fn(); return 1; } };
  globalThis.sessionStorage = {
    dados: {},
    getItem(k) { return this.dados[k] ?? null; },
    setItem(k, v) { this.dados[k] = v; },
  };

  return { eventos, classes, destino: () => destino };
}

// Limpa globais entre testes para evitar contaminação
function limparAmbiente() {
  delete globalThis.document;
  delete globalThis.CustomEvent;
  delete globalThis.matchMedia;
  delete globalThis.location;
  delete globalThis.window;
  delete globalThis.sessionStorage;
}

// Testes de existência e comportamento puro (do brief original)
test("crossTo existe e enterHome continua sendo o caminho da Chegada", async () => {
  const handoff = await import("../../outputs/js/chegada/transition-handoff.js");
  assert.equal(typeof handoff.crossTo, "function");
  assert.equal(typeof handoff.enterHome, "function");
});

test("o atraso da passagem encurta em movimento reduzido", async () => {
  const handoff = await import("../../outputs/js/chegada/transition-handoff.js");
  assert.equal(handoff.handoffDelayForMotion({ reducedMotion: false }), 850);
  assert.equal(handoff.handoffDelayForMotion({ reducedMotion: true }), 80);
});

// Testes que exercitam o comportamento real de crossTo e enterHome
test("enterHome navega para transcendido.html sem destination explícita", async () => {
  const ambiente = montarAmbiente();
  const handoff = await import("../../outputs/js/chegada/transition-handoff.js");

  const resultado = handoff.enterHome({ entry: "scroll", soundEnabled: true });

  assert.equal(resultado, true, "enterHome deve retornar true");
  assert.equal(ambiente.destino(), "transcendido.html", "destino deve ser transcendido.html");
  limparAmbiente();
});

test("enterHome respeita destination explícita passada nos options", async () => {
  const ambiente = montarAmbiente();
  const handoff = await import("../../outputs/js/chegada/transition-handoff.js");

  // Este teste expõe a inversão do spread operator: se for crossTo({ ...options, destination }),
  // um destination explícito em options seria sobrescrito
  const resultado = handoff.enterHome({ entry: "scroll", destination: "palacio.html" });

  assert.equal(resultado, true, "enterHome deve retornar true");
  assert.equal(ambiente.destino(), "palacio.html", "deve respeitar destination explícita em options");
  limparAmbiente();
});

test("crossTo navega para destino explícito e retorna true", async () => {
  const ambiente = montarAmbiente();
  const handoff = await import("../../outputs/js/chegada/transition-handoff.js");

  const resultado = handoff.crossTo({ entry: "scroll", destination: "palacio.html" });

  assert.equal(resultado, true, "crossTo deve retornar true");
  assert.equal(ambiente.destino(), "palacio.html", "deve navegar para o destino especificado");
  limparAmbiente();
});

test("data-transitioning previne segunda passagem (guarda dupla)", async () => {
  const ambiente = montarAmbiente();
  const handoff = await import("../../outputs/js/chegada/transition-handoff.js");

  const primeira = handoff.crossTo({ entry: "scroll", destination: "palacio.html" });
  const destino1 = ambiente.destino();

  const segunda = handoff.crossTo({ entry: "outro", destination: "templo.html" });
  const destino2 = ambiente.destino();

  assert.equal(primeira, true, "primeira passagem deve retornar true");
  assert.equal(segunda, false, "segunda passagem deve retornar false (bloqueada)");
  assert.equal(destino1, "palacio.html", "deve navegar para primeira destination");
  assert.equal(destino2, "palacio.html", "deve manter primeira destination (segunda bloqueada)");
  limparAmbiente();
});

test("passagem adiciona classes de véu e dispara evento", async () => {
  const ambiente = montarAmbiente();
  const handoff = await import("../../outputs/js/chegada/transition-handoff.js");

  handoff.crossTo({ entry: "scroll", soundEnabled: false });

  assert.ok(
    ambiente.classes.html.includes("is-crossing"),
    "deve adicionar is-crossing em documentElement"
  );
  assert.ok(
    ambiente.classes.body.includes("is-arrival-transitioning"),
    "deve adicionar is-arrival-transitioning em body"
  );
  assert.ok(
    ambiente.eventos.includes("potala:prepare-handoff"),
    "deve disparar potala:prepare-handoff"
  );
  limparAmbiente();
});
