import assert from "node:assert/strict";
import test from "node:test";

import { createBlockExpansion } from "../../outputs/js/home/block-expansion.js";

function createAttributeNode(initial = {}) {
  const attributes = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    attributes,
    focused: false,
    inert: false,
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    focus() {
      this.focused = true;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function createSection(id) {
  const summary = createAttributeNode({ "aria-expanded": "false" });
  const details = createAttributeNode({ "aria-hidden": "true" });
  const classes = new Set();
  return {
    dataset: { regionId: id },
    summary,
    details,
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); },
      contains(value) { return classes.has(value); },
    },
    querySelector(selector) {
      if (selector === ".region-summary") return summary;
      if (selector === ".region-details") return details;
      return null;
    },
    contains(node) {
      return node === summary || node === details;
    },
  };
}

function createRoot(ids) {
  const sections = ids.map(createSection);
  const listeners = new Map();
  return {
    sections,
    querySelectorAll(selector) {
      return selector === ".journey-region" ? sections : [];
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    emit(type, event) {
      listeners.get(type)?.(event);
    },
  };
}

test("abrir um bloco fecha o anterior", () => {
  const root = createRoot(["quem-somos", "atendimentos"]);
  const expansion = createBlockExpansion(root);

  expansion.open("quem-somos");
  expansion.open("atendimentos");

  assert.equal(expansion.activeId, "atendimentos");
  assert.equal(root.sections[0].summary.getAttribute("aria-expanded"), "false");
  assert.equal(root.sections[0].details.getAttribute("aria-hidden"), "true");
  assert.equal(root.sections[1].summary.getAttribute("aria-expanded"), "true");
  assert.equal(root.sections[1].details.getAttribute("aria-hidden"), "false");
});

test("Escape fecha o bloco ativo e devolve o foco ao resumo", () => {
  const root = createRoot(["quem-somos"]);
  const expansion = createBlockExpansion(root);
  let prevented = false;

  expansion.open("quem-somos");
  root.emit("keydown", {
    key: "Escape",
    preventDefault() { prevented = true; },
  });

  assert.equal(expansion.activeId, null);
  assert.equal(root.sections[0].summary.focused, true);
  assert.equal(prevented, true);
});

test("destroy remove os listeners e fecha a expansão", () => {
  const root = createRoot(["quem-somos"]);
  const expansion = createBlockExpansion(root);
  expansion.open("quem-somos");

  expansion.destroy();
  root.emit("keydown", { key: "Escape", preventDefault() {} });

  assert.equal(expansion.activeId, null);
  assert.equal(root.sections[0].summary.getAttribute("aria-expanded"), "false");
});


test("Escape fecha mesmo com o foco fora da jornada", () => {
  /*
   * Medido na prévia antes da correção: com o foco no botão de resumo o Escape
   * fechava; com o foco no body, não fechava nada. Basta clicar no fundo da
   * página, ou voltar de um link de dentro do bloco aberto, para cair nesse
   * segundo caso — e aí a única saída era procurar o botão de novo.
   */
  const root = createRoot(["quem-somos"]);
  const documento = {
    ouvintes: new Map(),
    addEventListener(type, listener) { this.ouvintes.set(type, listener); },
    removeEventListener(type, listener) {
      if (this.ouvintes.get(type) === listener) this.ouvintes.delete(type);
    },
  };

  const expansion = createBlockExpansion(root, { keyboardTarget: documento });
  expansion.open("quem-somos");

  // A raiz não pode mais ser o alvo do teclado: se for, o defeito voltou.
  root.emit("keydown", { key: "Escape", preventDefault() {} });
  assert.equal(expansion.activeId, "quem-somos", "a raiz não deve mais escutar o Escape");

  documento.ouvintes.get("keydown")({ key: "Escape", preventDefault() {} });
  assert.equal(expansion.activeId, null);

  // E o destroy tem de soltar do mesmo alvo em que se prendeu.
  expansion.destroy();
  assert.equal(documento.ouvintes.has("keydown"), false);
});

/**
 * Evento de clique com um alvo que responde a `closest`, como o DOM faz.
 *
 * O envelope importa: o handler lê `event.target.closest(...)`, então entregar
 * o alvo cru no lugar do evento faz todo clique cair no ramo de "fora do
 * bloco" — o teste passaria a medir outra coisa sem acusar nada.
 */
function cliqueEm({ summary = null, dentroDoBloco = false } = {}) {
  return {
    target: {
      closest(seletor) {
        if (seletor === ".region-summary") return summary;
        if (seletor === ".region-content") return summary || dentroDoBloco ? {} : null;
        return null;
      },
    },
  };
}

test("o segundo clique leva ao destino em vez de fechar", () => {
  const root = createRoot(["quem-somos"]);
  const secao = root.sections[0];
  secao.details.querySelector = (seletor) => (seletor === ".region-link"
    ? { getAttribute: () => "quem-somos.html" }
    : null);

  const destinos = [];
  const expansion = createBlockExpansion(root, { navigate: (href) => destinos.push(href) });

  /*
   * A regra aprovada era não redirecionar ao primeiro toque: quem só quer ler
   * o resumo não pode ser jogado para outra página. Ela continua de pé — o
   * primeiro clique abre e o texto completo aparece ali mesmo — e o segundo é
   * uma escolha já informada, feita com o conteúdo à vista.
   */
  root.emit("click", cliqueEm({ summary: secao.summary }));
  assert.equal(expansion.activeId, "quem-somos");
  assert.deepEqual(destinos, [], "o primeiro clique não pode navegar");

  root.emit("click", cliqueEm({ summary: secao.summary }));
  assert.deepEqual(destinos, ["quem-somos.html"]);
  assert.equal(expansion.activeId, "quem-somos", "navegar não fecha o bloco antes de sair");
});

test("o endereço sai do link visível, e não de uma segunda fonte", () => {
  const root = createRoot(["quem-somos"]);
  const secao = root.sections[0];
  // Sem link declarado não há para onde ir — e o clique não pode inventar um
  // destino nem quebrar.
  secao.details.querySelector = () => null;

  const destinos = [];
  const expansion = createBlockExpansion(root, { navigate: (href) => destinos.push(href) });
  root.emit("click", cliqueEm({ summary: secao.summary }));
  root.emit("click", cliqueEm({ summary: secao.summary }));

  assert.deepEqual(destinos, [undefined]);
  assert.equal(expansion.activeId, "quem-somos");
});

test("clique fora do bloco fecha, sem navegar", () => {
  /*
   * Isto virou necessário quando o segundo clique passou a navegar: sem ele,
   * quem abrisse um bloco sem querer no telefone não teria como fechá-lo —
   * tocar de novo levaria para outra página e Escape não existe no toque.
   */
  const root = createRoot(["quem-somos"]);
  const destinos = [];
  const expansion = createBlockExpansion(root, { navigate: (href) => destinos.push(href) });

  expansion.open("quem-somos");
  root.emit("click", cliqueEm({ summary: null }));

  assert.equal(expansion.activeId, null);
  assert.deepEqual(destinos, []);
});
