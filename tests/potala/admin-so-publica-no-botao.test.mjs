import assert from "node:assert/strict";
import test from "node:test";

import { createAdminController } from "../../outputs/js/admin/admin-controller.js";

/*
 * O QUE O PAINEL MUDA NAO VAI AO AR SOZINHO.
 *
 * Havia dois caminhos de gravacao com nomes parecidos e consequencias opostas:
 * "Salvar rascunho" guardava, e "Salvar bloco" — o botao de destaque, o que a
 * mao procura — chamava `replaceAll` e trocava na hora o que o visitante ve.
 * Reordenar e esconder um bloco faziam o mesmo.
 *
 * Quem editava nao tinha como saber: os dois botoes respondiam "salvo". O
 * estrago so aparecia na Home, publicado, sem ninguem ter clicado em publicar.
 *
 * A regra que estes testes seguram: SO "Publicar alteracoes" escreve em
 * `home_blocks`. Todo o resto vive em `home_block_drafts` ate la.
 */

function repositorioFalso() {
  const chamadas = [];
  let publicados = [
    { id: "a", slug: "a", title: "Primeiro", summary: "r", side: "left", position: 0, published: true, tags: [] },
    { id: "b", slug: "b", title: "Segundo", summary: "r", side: "right", position: 1, published: true, tags: [] },
  ];
  let rascunhos = [];
  return {
    chamadas,
    get publicados() { return publicados; },
    get rascunhos() { return rascunhos; },
    async list() { return publicados.map((bloco) => ({ ...bloco })); },
    async listDrafts() { return rascunhos.map((bloco) => ({ ...bloco })); },
    async saveDraft(bloco) {
      chamadas.push(["saveDraft", bloco.id]);
      rascunhos = [...rascunhos.filter((item) => item.id !== bloco.id), { ...bloco }];
      return bloco;
    },
    async discardDraft(id) {
      chamadas.push(["discardDraft", id]);
      rascunhos = rascunhos.filter((item) => item.id !== id);
    },
    async publishDrafts() {
      chamadas.push(["publishDrafts"]);
      const porId = new Map(publicados.map((bloco) => [bloco.id, bloco]));
      for (const rascunho of rascunhos) porId.set(rascunho.id, { ...rascunho });
      publicados = [...porId.values()].sort((x, y) => x.position - y.position);
      rascunhos = [];
      return publicados.map((bloco) => ({ ...bloco }));
    },
    async replaceAll(blocos) {
      chamadas.push(["replaceAll"]);
      publicados = blocos.map((bloco) => ({ ...bloco }));
      return publicados.map((bloco) => ({ ...bloco }));
    },
    async reset() { return publicados; },
  };
}

function campo(nome, valor = "", tipo = "text") {
  if (tipo === "checkbox") return { name: nome, type: tipo, value: "on", checked: valor === true };
  return { name: nome, type: tipo, value: valor, checked: false, setAttribute() {}, focus() {} };
}

function montar() {
  const ouvintes = new Map();
  const elementos = [campo("id", "a"), campo("title", "Primeiro"), campo("summary", "Um resumo"), campo("side", "left")];
  elementos.image = campo("image");
  elementos.title = elementos[1];
  elementos.summary = elementos[2];
  elementos.side = elementos[3];

  const alvo = (chave, extra = {}) => ({
    innerHTML: "", textContent: "", disabled: false, hidden: false,
    /* `setProperty` existe em qualquer `style` real, e faltava aqui. Um duble
       mais magro que o original quebra onde o navegador nao quebraria. */
    style: { setProperty() {} }, src: "", value: "", dataset: {},
    addEventListener(tipo, fn) { ouvintes.set(`${chave}:${tipo}`, fn); },
    removeEventListener(tipo) { ouvintes.delete(`${chave}:${tipo}`); },
    querySelector: () => null,
    querySelectorAll: () => [],
    setAttribute() {},
    focus() {},
    ...extra,
  });

  const nos = {
    "[data-admin-list]": alvo("lista"),
    "[data-admin-counts]": alvo("counts"),
    "[data-admin-form]": alvo("form", { elements: elementos, querySelector: () => null }),
    "[data-admin-status]": alvo("status"),
    "[data-admin-preview]": alvo("preview"),
    "[data-admin-preview-frame]": alvo("frame", { clientWidth: 460 }),
    "[data-admin-search]": alvo("search"),
    "[data-admin-tabs]": alvo("tabs"),
    "[data-admin-publish]": alvo("publish"),
    "[data-admin-saved-at]": alvo("saved"),
    "[data-admin-save-draft]": alvo("savedraft"),
    "[data-admin-media-grid]": alvo("grid"),
    "[data-admin-image-pick]": alvo("pick"),
    "[data-admin-form-tabs]": alvo("formtabs"),
    "[data-admin-summary-counter]": alvo("counter"),
    "[data-admin-checklist]": alvo("checklist"),
    "[data-admin-form-title]": alvo("formtitle"),
    "[data-admin-breadcrumb-title]": alvo("crumb"),
    "[data-admin-confirm]": alvo("confirm", { hidden: true }),
    "[data-admin-confirm-title]": alvo("confirmtitle"),
    "[data-admin-confirm-detail]": alvo("confirmdetail"),
  };

  function preencherFormulario(valores) {
    for (const [nome, valor] of Object.entries(valores)) {
      const controle = elementos.find((item) => item.name === nome);
      if (controle) controle.value = valor;
    }
  }

  /* Um clique na lista, do jeito que o painel o recebe: pelo botao mais
     proximo que carrega `data-action`. */
  function cliqueNaLista(action, id) {
    const botao = { dataset: { action, id }, disabled: false, focus() {} };
    return ouvintes.get("lista:click")({ target: { closest: () => botao } });
  }

  return {
    ouvintes, nos, preencherFormulario, cliqueNaLista,
    publicarHabilitado: () => !nos["[data-admin-publish]"].disabled,
    rotuloPublicar: () => nos["[data-admin-publish]"].textContent,
    root: { querySelector: (seletor) => nos[seletor] ?? null },
  };
}

test("salvar o bloco guarda rascunho e nao toca no que esta no ar", async () => {
  const repo = repositorioFalso();
  const { root, ouvintes, preencherFormulario } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;
  preencherFormulario({ id: "a", title: "Titulo novo", summary: "Um resumo", side: "left" });

  await ouvintes.get("form:submit")({ preventDefault() {} });

  assert.ok(!repo.chamadas.some(([nome]) => nome === "replaceAll"), "o botao de salvar publicou direto");
  assert.deepEqual(repo.chamadas, [["saveDraft", "a"]]);
  assert.equal(repo.publicados[0].title, "Primeiro", "o que esta no ar mudou sem ninguem publicar");
  assert.equal(repo.rascunhos[0].title, "Titulo novo");
});

test("salvar o bloco acende o botao de publicar", async () => {
  const repo = repositorioFalso();
  const { root, ouvintes, preencherFormulario, publicarHabilitado, rotuloPublicar } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;
  assert.equal(publicarHabilitado(), false, "havia o que publicar antes de qualquer edicao");

  preencherFormulario({ id: "a", title: "Titulo novo", summary: "Um resumo", side: "left" });
  await ouvintes.get("form:submit")({ preventDefault() {} });

  /*
   * O botao e o unico lugar onde a pendencia aparece somada. Sem acender, a
   * alteracao ficaria guardada e invisivel — e ninguem publicaria o que nao
   * sabe que existe.
   */
  assert.equal(publicarHabilitado(), true);
  assert.match(rotuloPublicar(), /\(1\)/);
});

test("esconder um bloco fica em rascunho ate publicar", async () => {
  const repo = repositorioFalso();
  const { root, cliqueNaLista } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;

  await cliqueNaLista("toggle", "a");

  assert.ok(!repo.chamadas.some(([nome]) => nome === "replaceAll"), "esconder tirou o bloco do ar na hora");
  assert.equal(repo.publicados[0].published, true, "o visitante deixou de ver o bloco sem ninguem publicar");
  assert.equal(repo.rascunhos[0].published, false);
});

test("reordenar fica em rascunho, e o ar mantem a ordem antiga", async () => {
  const repo = repositorioFalso();
  const { root, cliqueNaLista } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;

  await cliqueNaLista("down", "a");

  assert.ok(!repo.chamadas.some(([nome]) => nome === "replaceAll"), "reordenar mudou a Home na hora");
  assert.deepEqual(repo.publicados.map((bloco) => bloco.id), ["a", "b"], "a ordem no ar mudou sozinha");
  /*
   * Os DOIS blocos viram rascunho: uma troca de lugar move dois, e gravar so o
   * que foi clicado deixaria os dois na mesma posicao depois de publicar.
   */
  const porId = new Map(repo.rascunhos.map((bloco) => [bloco.id, bloco.position]));
  assert.deepEqual([...porId.entries()].sort(), [["a", 1], ["b", 0]]);
});

test("publicar leva o que estava guardado, de uma vez", async () => {
  const repo = repositorioFalso();
  const { root, ouvintes, preencherFormulario, cliqueNaLista, publicarHabilitado } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;

  preencherFormulario({ id: "a", title: "Titulo novo", summary: "Um resumo", side: "left" });
  await ouvintes.get("form:submit")({ preventDefault() {} });
  await cliqueNaLista("toggle", "b");
  await ouvintes.get("publish:click")();

  assert.equal(repo.publicados.find((bloco) => bloco.id === "a").title, "Titulo novo");
  assert.equal(repo.publicados.find((bloco) => bloco.id === "b").published, false);
  assert.equal(repo.rascunhos.length, 0, "o rascunho sobreviveu a publicacao");
  assert.equal(publicarHabilitado(), false, "o botao continuou aceso sem nada para publicar");
});
