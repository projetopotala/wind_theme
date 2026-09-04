import assert from "node:assert/strict";
import test from "node:test";

import { createAdminController } from "../../outputs/js/admin/admin-controller.js";

/*
 * O PAINEL PRECISA RESPONDER A QUEM SALVA.
 *
 * A unica resposta a uma gravacao era uma linha de status discreta, do mesmo
 * tamanho e cor de qualquer outro aviso, longe de onde o olho estava. Quem
 * salvava ficava sem saber se tinha funcionado — e a duvida leva a salvar de
 * novo, ou pior, a fechar o painel achando que salvou.
 *
 * A notificacao cobre sucesso E falha de proposito. Uma que so aparece quando
 * da certo ensina o olho a ler a ausencia dela como "nao fiz nada" — e a
 * ausencia tambem seria o retrato exato de uma falha silenciosa.
 */

/*
 * `falharRascunho: "uma vez"` falha so na primeira gravacao.
 *
 * E o que permite provar que o tom de erro nao gruda: sem isso, a segunda
 * tentativa falharia igual e o teste passaria por acidente, medindo apenas que
 * um erro continua vermelho.
 */
function repositorioFalso({ falharRascunho = false, falharSalvar = false } = {}) {
  let rascunhosFalhados = 0;
  let publicados = [
    { id: "a", slug: "a", title: "Original", summary: "r", side: "left", position: 0, published: true, tags: [] },
  ];
  let rascunhos = [];
  return {
    async list() { return publicados.map((bloco) => ({ ...bloco })); },
    async listDrafts() { return rascunhos.map((bloco) => ({ ...bloco })); },
    async saveDraft(bloco) {
      if (falharRascunho === "uma vez" ? rascunhosFalhados++ === 0 : falharRascunho) {
        throw new Error("rede caiu");
      }
      rascunhos = [...rascunhos.filter((item) => item.id !== bloco.id), { ...bloco }];
      return bloco;
    },
    async discardDraft(id) { rascunhos = rascunhos.filter((item) => item.id !== id); },
    async publishDrafts() { publicados = [...rascunhos]; rascunhos = []; return publicados.map((b) => ({ ...b })); },
    async replaceAll(blocos) {
      if (falharSalvar) throw new Error("rede caiu");
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
  const elementos = [campo("id", "a"), campo("title", "Editado"), campo("summary", "Um resumo"), campo("side", "left")];
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
    /* A notificacao nasce escondida: so um resultado a revela. */
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

  return {
    ouvintes, nos, preencherFormulario,
    caixa: nos["[data-admin-confirm]"],
    titulo: nos["[data-admin-confirm-title]"],
    detalhe: nos["[data-admin-confirm-detail]"],
    root: { querySelector: (seletor) => nos[seletor] ?? null },
  };
}

const RASCUNHO = { id: "a", title: "Editado", summary: "Um resumo", side: "left" };

test("guardar rascunho notifica, e a notificacao diz QUAL bloco", async () => {
  const { root, ouvintes, preencherFormulario, caixa, titulo, detalhe } = montar();
  const painel = createAdminController({ root, repository: repositorioFalso() });
  await painel.pronto;
  preencherFormulario(RASCUNHO);

  await ouvintes.get("savedraft:click")();

  assert.equal(caixa.hidden, false, "nada apareceu depois de salvar");
  /*
   * O nome do bloco entra porque o painel edita nove: "salvo" sozinho nao
   * distingue o bloco certo do bloco que a pessoa abriu por engano.
   */
  assert.match(titulo.textContent, /Editado/);
  /* E precisa dizer que a Home NAO mudou, senao salvar passa por publicar. */
  assert.match(detalhe.textContent, /Home/i);
});

test("guardar rascunho que falha notifica com tom de erro", async () => {
  const { root, ouvintes, preencherFormulario, caixa, titulo } = montar();
  const painel = createAdminController({ root, repository: repositorioFalso({ falharRascunho: true }) });
  await painel.pronto;
  preencherFormulario(RASCUNHO);

  await ouvintes.get("savedraft:click")();

  assert.equal(caixa.hidden, false, "a falha passou em silencio");
  assert.equal(caixa.dataset.tom, "erro", "a falha se parecia com um sucesso");
  assert.match(titulo.textContent, /n[aã]o foi/i);
});

test("salvar o bloco publicado notifica", async () => {
  const { root, ouvintes, preencherFormulario, caixa, titulo } = montar();
  const painel = createAdminController({ root, repository: repositorioFalso() });
  await painel.pronto;
  preencherFormulario(RASCUNHO);

  await ouvintes.get("form:submit")({ preventDefault() {} });

  assert.equal(caixa.hidden, false);
  assert.match(titulo.textContent, /Editado/);
});

test("a notificacao some sozinha, sem exigir um clique", async (t) => {
  const { root, ouvintes, preencherFormulario, caixa } = montar();
  const painel = createAdminController({ root, repository: repositorioFalso() });
  await painel.pronto;
  preencherFormulario(RASCUNHO);

  /*
   * O relogio falso entra ANTES do clique, e nao depois.
   *
   * O `setTimeout` que apaga a notificacao e agendado durante o clique. Ligado
   * depois, o relogio falso nao adota um agendamento que ja existe: `tick`
   * passa por cima dele sem disparar nada, e o teste acusaria um defeito que
   * nao existe.
   */
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await ouvintes.get("savedraft:click")();
  assert.equal(caixa.hidden, false);

  /*
   * Uma notificacao que precisa ser fechada cobra mais um clique por um
   * trabalho que ja terminou, e acaba ficando na tela cobrindo a lista.
   */
  t.mock.timers.tick(9000);
  assert.equal(caixa.hidden, true, "a notificacao ficou na tela para sempre");
});

test("um sucesso depois de um erro nao herda o tom vermelho", async () => {
  /*
   * O `dataset` sobrevive entre avisos. Sem limpar o tom, a confirmacao de que
   * deu certo aparecia pintada de falha — que e a leitura oposta da verdade.
   */
  const { root, ouvintes, preencherFormulario, caixa } = montar();
  const painel = createAdminController({ root, repository: repositorioFalso({ falharRascunho: "uma vez" }) });
  await painel.pronto;
  preencherFormulario(RASCUNHO);

  await ouvintes.get("savedraft:click")();
  assert.equal(caixa.dataset.tom, "erro");

  await ouvintes.get("form:submit")({ preventDefault() {} });
  assert.notEqual(caixa.dataset.tom, "erro", "o sucesso continuou vermelho");
});
