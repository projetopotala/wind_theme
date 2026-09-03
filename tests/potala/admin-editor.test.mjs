import assert from "node:assert/strict";
import test from "node:test";

import {
  LIMITE_RESUMO,
  checklistFor,
  createAdminEditor,
  summaryState,
} from "../../outputs/js/admin/admin-editor.js";

test("o contador mostra usados e limite", () => {
  assert.equal(summaryState("abc").rotulo, `3 / ${LIMITE_RESUMO}`);
  assert.equal(summaryState("").rotulo, `0 / ${LIMITE_RESUMO}`);
  assert.equal(summaryState().usados, 0);
});

/*
 * O aviso chega antes do limite. Quem só descobre o teto ao bater nele já
 * perdeu a frase que estava escrevendo.
 */
test("o aviso do resumo chega antes do limite", () => {
  assert.equal(summaryState("a".repeat(139)).perto, false);
  assert.equal(summaryState("a".repeat(140)).perto, true);
  assert.equal(summaryState("a".repeat(160)).perto, true);
});

test("o checklist tem os três itens do mockup", () => {
  assert.deepEqual(
    checklistFor({}).map((item) => item.id),
    ["titulo", "resumo", "imagem"],
  );
});

test("o checklist lê o rascunho", () => {
  const completo = checklistFor({ title: "Atendimentos", summary: "Um resumo", image: "media/a.webp" });
  assert.deepEqual(completo.map((item) => item.ok), [true, true, true]);

  const vazio = checklistFor({});
  assert.deepEqual(vazio.map((item) => item.ok), [false, false, false]);
});

/* Olhar só a presença deixaria passar um título de duas letras, que satisfaz
   qualquer validação e não diz nada a quem chega na Home. */
test("título curto demais não conta como legível", () => {
  assert.equal(checklistFor({ title: "Ab" })[0].ok, false);
  assert.equal(checklistFor({ title: "Abc" })[0].ok, true);
  assert.equal(checklistFor({ title: "   " })[0].ok, false);
});

function campo(nome, valor = "", tipo = "text") {
  /* Um checkbox de verdade tem value "on" e o estado em `checked`. Se o falso
     guardasse o booleano nos dois, ler o campo errado daria o mesmo resultado e
     o teste não perceberia a troca. */
  if (tipo === "checkbox") return { name: nome, type: tipo, value: "on", checked: valor === true };
  return { name: nome, type: tipo, value: valor, checked: false };
}

function montar(campos) {
  const ouvintes = new Map();
  const paineis = [
    { dataset: { panel: "conteudo" }, hidden: false },
    { dataset: { panel: "aparencia" }, hidden: true },
    { dataset: { panel: "seo" }, hidden: true },
  ];
  const form = {
    elements: campos,
    querySelectorAll: () => paineis,
    addEventListener(tipo, fn) { ouvintes.set(`form:${tipo}`, fn); },
    removeEventListener(tipo) { ouvintes.delete(`form:${tipo}`); },
  };
  const botoesAba = ["conteudo", "aparencia", "seo"].map((painel) => {
    const atributos = new Map([["aria-selected", painel === "conteudo" ? "true" : "false"]]);
    return {
      dataset: { panel: painel },
      setAttribute: (nome, valor) => atributos.set(nome, valor),
      getAttribute: (nome) => atributos.get(nome) ?? null,
    };
  });
  const abas = {
    querySelectorAll: () => botoesAba,
    addEventListener(tipo, fn) { ouvintes.set(`abas:${tipo}`, fn); },
    removeEventListener(tipo) { ouvintes.delete(`abas:${tipo}`); },
  };
  const contador = {
    textContent: "",
    atributos: new Map(),
    setAttribute(nome, valor) { this.atributos.set(nome, valor); },
  };
  const checklist = { innerHTML: "" };
  const titulo = { textContent: "" };
  const migalha = { textContent: "" };
  const rascunho = {
    addEventListener(tipo, fn) { ouvintes.set(`rascunho:${tipo}`, fn); },
    removeEventListener(tipo) { ouvintes.delete(`rascunho:${tipo}`); },
  };

  const root = {
    querySelector(seletor) {
      if (seletor === "[data-admin-form]") return form;
      if (seletor === "[data-admin-form-tabs]") return abas;
      if (seletor === "[data-admin-summary-counter]") return contador;
      if (seletor === "[data-admin-checklist]") return checklist;
      if (seletor === "[data-admin-form-title]") return titulo;
      if (seletor === "[data-admin-breadcrumb-title]") return migalha;
      if (seletor === "[data-admin-save-draft]") return rascunho;
      return null;
    },
  };

  return { root, paineis, botoesAba, contador, checklist, titulo, ouvintes, rascunho };
}

test("read devolve todos os campos, inclusive os novos", () => {
  const campos = [
    campo("title", "Atendimentos"),
    campo("titleScale", "compact"),
    campo("metaDescription", "Um texto"),
    campo("allowPanel", true, "checkbox"),
  ];
  const { root } = montar(campos);
  const draft = createAdminEditor({ root }).read();

  assert.equal(draft.title, "Atendimentos");
  assert.equal(draft.titleScale, "compact");
  assert.equal(draft.metaDescription, "Um texto");
  assert.equal(draft.allowPanel, true);
});

test("trocar de aba move a seleção e esconde os outros painéis", () => {
  const { root, paineis, botoesAba, ouvintes } = montar([campo("title", "A")]);
  createAdminEditor({ root });

  ouvintes.get("abas:click")({ target: { closest: () => ({ dataset: { panel: "seo" } }) } });

  assert.equal(botoesAba[2].getAttribute("aria-selected"), "true");
  assert.equal(botoesAba[0].getAttribute("aria-selected"), "false");
  assert.equal(paineis[2].hidden, false);
  assert.equal(paineis[0].hidden, true);
});

test("digitar atualiza contador, checklist e título", () => {
  const campos = [campo("title", "Atendimentos"), campo("summary", "a".repeat(145))];
  const { root, contador, checklist, titulo, ouvintes } = montar(campos);
  createAdminEditor({ root });

  ouvintes.get("form:input")();

  assert.equal(contador.textContent, `145 / ${LIMITE_RESUMO}`);
  assert.equal(contador.atributos.get("data-perto"), "true");
  assert.match(checklist.innerHTML, /data-ok="true"[\s\S]*Título legível/);
  assert.equal(titulo.textContent, "Atendimentos");
});

test("salvar rascunho entrega o que está no formulário", () => {
  const { root, ouvintes } = montar([campo("title", "Atendimentos")]);
  const recebidos = [];
  createAdminEditor({ root, onSaveDraft: (draft) => recebidos.push(draft) });

  ouvintes.get("rascunho:click")();

  assert.equal(recebidos.length, 1);
  assert.equal(recebidos[0].title, "Atendimentos");
});

/* Carregar um bloco tem de voltar para a primeira aba. Ficar na aba de SEO ao
   trocar de bloco esconde o título e o resumo de quem acabou de clicar. */
test("carregar um bloco volta para a aba Conteúdo", () => {
  const { root, paineis, ouvintes } = montar([campo("title", "A")]);
  const editor = createAdminEditor({ root });

  ouvintes.get("abas:click")({ target: { closest: () => ({ dataset: { panel: "seo" } }) } });
  editor.load({ title: "Outro" });

  assert.equal(paineis[0].hidden, false);
  assert.equal(paineis[2].hidden, true);
});

test("destroy solta os ouvintes", () => {
  const { root, ouvintes } = montar([campo("title", "A")]);
  createAdminEditor({ root }).destroy();
  assert.equal(ouvintes.size, 0);
});
