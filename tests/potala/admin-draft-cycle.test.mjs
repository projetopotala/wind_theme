import assert from "node:assert/strict";
import test from "node:test";

import { createAdminController } from "../../outputs/js/admin/admin-controller.js";

/*
 * Um repositório falso que conta o que foi chamado e pode falhar sob comando.
 * É o que permite provar a volta atrás sem uma rede de verdade.
 */
function repositorioFalso({ falharSalvar = false, falharPublicar = false, falharRascunhos = false } = {}) {
  const chamadas = [];
  let publicados = [
    { id: "a", slug: "a", title: "Original", summary: "r", side: "left", position: 0, published: true, tags: [] },
  ];
  let rascunhos = [];
  return {
    chamadas,
    get publicados() { return publicados; },
    async list() { return publicados.map((bloco) => ({ ...bloco })); },
    async listDrafts() {
      if (falharRascunhos) throw new Error("relation public.home_block_drafts does not exist");
      return rascunhos.map((bloco) => ({ ...bloco }));
    },
    async saveDraft(bloco) {
      chamadas.push(["saveDraft", bloco.id]);
      if (falharSalvar) throw new Error("rede caiu");
      rascunhos = [...rascunhos.filter((item) => item.id !== bloco.id), { ...bloco }];
      return bloco;
    },
    async discardDraft(id) {
      chamadas.push(["discardDraft", id]);
      rascunhos = rascunhos.filter((item) => item.id !== id);
    },
    async publishDrafts() {
      chamadas.push(["publishDrafts"]);
      if (falharPublicar) throw new Error("portal_admin_required");
      publicados = [...rascunhos];
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
  const elementos = [
    campo("id", "a"),
    campo("title", "Editado"),
    campo("summary", "Um resumo"),
    campo("side", "left"),
  ];
  elementos.image = campo("image");
  elementos.title = elementos[1];
  elementos.summary = elementos[2];
  elementos.side = elementos[3];

  const alvo = (chave, extra = {}) => ({
    innerHTML: "",
    textContent: "",
    disabled: false,
    hidden: false,
    /* `setProperty` existe em qualquer `style` real, e a previa de celular o
       usa para dizer a caixa o tamanho ja escalado do aparelho. Um duble mais
       magro que o original quebra onde o navegador nao quebraria. */
    style: { setProperty() {} },
    src: "",
    value: "",
    dataset: {},
    addEventListener(tipo, fn) { ouvintes.set(`${chave}:${tipo}`, fn); },
    removeEventListener(tipo) { ouvintes.delete(`${chave}:${tipo}`); },
    querySelector: () => null,
    querySelectorAll: () => [],
    setAttribute() {},
    ...extra,
  });

  const form = alvo("form", { elements: elementos });
  const nos = {
    "[data-admin-list]": alvo("lista"),
    "[data-admin-counts]": alvo("counts"),
    "[data-admin-form]": form,
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
  };

  /*
   * Preencher DEPOIS de `pronto`, e não antes.
   *
   * Ao carregar, o painel limpa o formulário para um bloco novo — que é o
   * comportamento certo. Um teste que preenchesse antes veria os próprios
   * valores apagados e culparia a validação por isso.
   */
  function preencherFormulario(valores) {
    for (const [nome, valor] of Object.entries(valores)) {
      const controle = elementos.find((item) => item.name === nome);
      if (controle) controle.value = valor;
    }
  }

  return {
    ouvintes,
    nos,
    preencherFormulario,
    root: { querySelector: (seletor) => nos[seletor] ?? null },
  };
}

const RASCUNHO = { id: "a", title: "Editado", summary: "Um resumo", side: "left" };

test("salvar rascunho grava no rascunho e nunca na lista publicada", async () => {
  const repo = repositorioFalso();
  const { root, ouvintes, preencherFormulario } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;
  preencherFormulario(RASCUNHO);

  await ouvintes.get("savedraft:click")();

  assert.deepEqual(repo.chamadas, [["saveDraft", "a"]]);
  assert.equal(repo.publicados[0].title, "Original", "a Home não pode mudar ao salvar rascunho");
});

/*
 * A asserção que justifica o otimismo.
 *
 * A lista muda antes da resposta do servidor. Se a gravação falhar e o estado
 * novo ficar, o painel passa a mostrar um rascunho que não existe — e ninguém
 * descobre até recarregar a página.
 */
test("gravação que falha desfaz a mudança e diz o motivo", async () => {
  const repo = repositorioFalso({ falharSalvar: true });
  const { root, ouvintes, nos, preencherFormulario } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;
  preencherFormulario(RASCUNHO);

  await ouvintes.get("savedraft:click")();

  assert.match(nos["[data-admin-status]"].textContent, /Não foi possível guardar/);
  assert.match(nos["[data-admin-status]"].textContent, /Nada foi alterado/);
  /*
   * A mensagem sozinha não prova nada: ela pode estar dizendo "nada foi
   * alterado" com o rascunho fantasma ainda na lista. O botão de publicar é a
   * prova observável — sem rascunho, ele volta a ficar desabilitado.
   */
  assert.equal(
    nos["[data-admin-publish]"].disabled,
    true,
    "o rascunho que não foi gravado não pode continuar contando como pendência",
  );
});

test("publicar chama a RPC e limpa os rascunhos", async () => {
  const repo = repositorioFalso();
  const { root, ouvintes, nos, preencherFormulario } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;
  preencherFormulario(RASCUNHO);

  await ouvintes.get("savedraft:click")();
  await ouvintes.get("publish:click")();

  assert.ok(repo.chamadas.some(([nome]) => nome === "publishDrafts"));
  /*
   * O anuncio diz QUANTOS blocos foram, porque publicar e em lote: quem tinha
   * tres rascunhos precisa saber se foram os tres. "Publicadas.", sozinho, nao
   * distinguia um lote inteiro de um bloco so.
   */
  assert.match(nos["[data-admin-status]"].textContent, /1 bloco publicado/);
  assert.match(nos["[data-admin-status]"].textContent, /Home foi atualizada/);
});

test("publicar que falha não deixa o painel achar que publicou", async () => {
  const repo = repositorioFalso({ falharPublicar: true });
  const { root, ouvintes, nos, preencherFormulario } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;
  preencherFormulario(RASCUNHO);

  await ouvintes.get("savedraft:click")();
  await ouvintes.get("publish:click")();

  assert.match(nos["[data-admin-status]"].textContent, /Não foi possível publicar/);
  assert.equal(repo.publicados[0].title, "Original");
});

/* Um botão que aceita o clique e não faz nada ensina o editor a desconfiar do
   painel. Sem pendência, ele fica desabilitado. */
test("publicar fica desabilitado quando não há pendência", async () => {
  const repo = repositorioFalso();
  const { root, ouvintes, nos, preencherFormulario } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;

  assert.equal(nos["[data-admin-publish]"].disabled, true);

  preencherFormulario(RASCUNHO);
  await ouvintes.get("savedraft:click")();

  assert.equal(nos["[data-admin-publish]"].disabled, false);
  assert.match(nos["[data-admin-publish]"].textContent, /\(1\)/);
});

/*
 * O caso comum de falha, e o mais cruel: basta a migração da tabela de
 * rascunhos ainda não ter sido aplicada ao banco. Sem tolerância, a promessa
 * rejeitava, o desenho nunca acontecia e o painel abria VAZIO — sem sinal de
 * erro e sem os blocos publicados, que estavam lá o tempo todo.
 */
test("rascunhos indisponíveis não apagam os blocos publicados", async () => {
  const repo = repositorioFalso({ falharRascunhos: true });
  const { root, nos } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;

  assert.match(nos["[data-admin-counts]"].textContent, /1 blocos/);
  assert.match(nos["[data-admin-list]"].innerHTML, /Original/);
  /*
   * O aviso diz a CONSEQUENCIA e a CAUSA, e nao so o fato.
   *
   * "Os rascunhos nao estao disponiveis" era verdade e nao servia para nada:
   * quem lia continuava editando e so descobria o problema ao salvar, uma
   * edicao inteira depois. Desde que toda gravacao passa por rascunho,
   * rascunho indisponivel quer dizer que NADA pode ser salvo.
   */
  /*
   * O aviso diz QUAL botao para de funcionar, e por que.
   *
   * "Os rascunhos nao estao disponiveis" era verdade e nao servia para nada:
   * quem lia continuava editando e so descobria o problema ao clicar em
   * "Salvar rascunho", uma edicao inteira depois. E "Salvar bloco" continua
   * funcionando — dizer que nada pode ser salvo assustaria sem motivo e
   * esconderia o caminho que esta aberto.
   */
  const aviso = nos["[data-admin-status]"].textContent;
  assert.match(aviso, /"Salvar rascunho" não vai funcionar/i);
  assert.match(aviso, /migração home_block_drafts/i);
  assert.match(aviso, /"Salvar bloco" continua/i);
});

/* As abas do editor precisam estar MONTADAS, não só desenhadas. Sem o módulo
   ligado, Aparência e SEO ficam visíveis e mortas ao clique. */
test("o editor é montado junto com o painel", async () => {
  const repo = repositorioFalso();
  const { root, ouvintes } = montar();
  await createAdminController({ root, repository: repo }).pronto;

  assert.ok(ouvintes.has("formtabs:click"), "as abas do editor não foram ligadas");
});

/*
 * A leitura do publicado também depende de rede, e falhar mudo é o pior
 * resultado possível: sem lista, sem contadores e sem explicação, a tela fica
 * indistinguível de um portal que não tem bloco nenhum.
 */
test("falha ao ler os blocos publicados vira aviso, não tela muda", async () => {
  const repo = repositorioFalso();
  repo.list = async () => { throw new Error("column home_blocks.title_scale does not exist"); };
  const { root, nos } = montar();
  const painel = createAdminController({ root, repository: repo });
  await painel.pronto;

  assert.match(nos["[data-admin-status]"].textContent, /Não foi possível carregar os blocos/i);
});
