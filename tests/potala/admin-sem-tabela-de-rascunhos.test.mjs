import assert from "node:assert/strict";
import test from "node:test";

import { createAdminController } from "../../outputs/js/admin/admin-controller.js";
import { rascunhosIndisponiveis } from "../../outputs/js/admin/admin-draft.js";

/*
 * QUANDO A TABELA DE RASCUNHOS NAO EXISTE NO BANCO.
 *
 * O painel passou a mandar TODA gravacao por `home_block_drafts` — que e o que
 * faz "Publicar alteracoes" ser o unico caminho para o ar. Num banco onde a
 * migracao dessa tabela nunca foi aplicada, isso deixou de salvar qualquer
 * coisa: cada tentativa batia num PGRST205 e voltava com um aviso.
 *
 * Nao poder trabalhar e pior do que publicar direto. Sem a tabela, a escolha
 * nao e entre rascunho e publicacao — e entre publicar direto e nao editar.
 *
 * Entao o painel cai para a gravacao direta, e DIZ que caiu. Silencioso seria
 * a pior das tres opcoes: devolveria exatamente o defeito que a mudanca veio
 * corrigir, agora escondido.
 */

const SEM_TABELA = Object.assign(new Error("Could not find the table 'public.home_block_drafts' in the schema cache"), { code: "PGRST205" });

function repositorioFalso() {
  const chamadas = [];
  let publicados = [
    { id: "a", slug: "a", title: "Primeiro", summary: "r", side: "left", position: 0, published: true, tags: [] },
    { id: "b", slug: "b", title: "Segundo", summary: "r", side: "right", position: 1, published: true, tags: [] },
  ];
  return {
    chamadas,
    get publicados() { return publicados; },
    async list() { return publicados.map((bloco) => ({ ...bloco })); },
    async listDrafts() { chamadas.push(["listDrafts"]); throw SEM_TABELA; },
    async saveDraft() { chamadas.push(["saveDraft"]); throw SEM_TABELA; },
    async discardDraft() { throw SEM_TABELA; },
    async publishDrafts() { throw SEM_TABELA; },
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
    "[data-admin-form]": alvo("form", { elements: elementos }),
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

  function cliqueNaLista(action, id) {
    const botao = { dataset: { action, id }, disabled: false, focus() {} };
    return ouvintes.get("lista:click")({ target: { closest: () => botao } });
  }

  return {
    ouvintes, nos, preencherFormulario, cliqueNaLista,
    caixa: nos["[data-admin-confirm]"],
    titulo: nos["[data-admin-confirm-title]"],
    detalhe: nos["[data-admin-confirm-detail]"],
    status: nos["[data-admin-status]"],
    root: { querySelector: (seletor) => nos[seletor] ?? null },
  };
}

test("reconhece a tabela que nao existe, pelo codigo e pelo texto", () => {
  assert.equal(rascunhosIndisponiveis({ code: "PGRST205" }), true);
  assert.equal(rascunhosIndisponiveis({ code: "42P01" }), true);
  assert.equal(rascunhosIndisponiveis(SEM_TABELA), true);
  /* Falta de permissao NAO e tabela ausente: cair para gravacao direta ali
     seria tentar publicar com uma conta que tambem nao pode publicar. */
  assert.equal(rascunhosIndisponiveis({ code: "42501" }), false);
  assert.equal(rascunhosIndisponiveis(null), false);
});

test("sem a tabela, salvar grava direto em vez de nao salvar", async () => {
  const repo = repositorioFalso();
  const { root, ouvintes, preencherFormulario } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;
  preencherFormulario({ id: "a", title: "Titulo novo", summary: "Um resumo", side: "left" });

  await ouvintes.get("form:submit")({ preventDefault() {} });

  assert.ok(repo.chamadas.some(([nome]) => nome === "replaceAll"), "nao salvou de jeito nenhum");
  assert.equal(repo.publicados.find((bloco) => bloco.id === "a").title, "Titulo novo");
});

test("e diz que foi direto ao ar, em vez de deixar supor que ficou guardado", async () => {
  const repo = repositorioFalso();
  const { root, ouvintes, preencherFormulario, titulo, detalhe } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;
  preencherFormulario({ id: "a", title: "Titulo novo", summary: "Um resumo", side: "left" });

  await ouvintes.get("form:submit")({ preventDefault() {} });

  /*
   * O silencio seria a pior das tres opcoes: devolveria o defeito que a
   * mudanca veio corrigir — salvar publicando sem avisar — agora escondido
   * atras de uma notificacao que diz "guardado".
   */
  const inteiro = `${titulo.textContent} ${detalhe.textContent}`;
  assert.match(inteiro, /(a|n)o ar|publicad/i, "nao disse que foi ao ar");
  assert.match(inteiro, /migra|rascunho/i, "nao disse por que");
});

test("reordenar tambem funciona sem a tabela", async () => {
  const repo = repositorioFalso();
  const { root, cliqueNaLista } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;

  await cliqueNaLista("down", "a");

  assert.ok(repo.chamadas.some(([nome]) => nome === "replaceAll"));
  assert.deepEqual(repo.publicados.map((bloco) => bloco.id), ["b", "a"]);
});

test("com a tabela presente, nada disso acontece", async () => {
  /*
   * A rede de seguranca nao pode virar o caminho normal. Num banco completo, o
   * rascunho continua sendo o unico destino de uma edicao.
   */
  const repo = repositorioFalso();
  repo.listDrafts = async () => [];
  repo.saveDraft = async (bloco) => { repo.chamadas.push(["saveDraft"]); return bloco; };

  const { root, ouvintes, preencherFormulario } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;
  preencherFormulario({ id: "a", title: "Titulo novo", summary: "Um resumo", side: "left" });

  await ouvintes.get("form:submit")({ preventDefault() {} });

  assert.ok(!repo.chamadas.some(([nome]) => nome === "replaceAll"), "publicou direto com a tabela disponivel");
});
