/*
 * SALVAR E ACOMPANHAR, EM QUALQUER PÁGINA.
 *
 * Qualquer elemento com `data-salvar` ou `data-acompanhar` vira um botão que
 * liga e desliga, e os dados do item viajam nos próprios atributos
 * (`data-salvar-tipo`, `-ref`, `-titulo`, `-href`, `-imagem`; ou
 * `data-acompanhar-tipo`, `-ref`, `-rotulo`). Um artigo, um profissional ou um
 * evento ganham o mesmo comportamento sem importar nada da conta.
 *
 * A INTENÇÃO SOBREVIVE À CONFIRMAÇÃO DE E-MAIL. Quem cria conta para salvar um
 * texto sai da página para abrir o e-mail e volta por um link, noutra aba. A
 * ação fica guardada por meia hora e é concluída quando essa pessoa chega
 * autenticada — de outro modo, o motivo pelo qual ela criou a conta se perderia
 * justamente no primeiro uso.
 */

import { mensagemDoErro } from "./mensagens.js";
import { criarAcompanhado, criarSalvo } from "./modelos.js";

const CHAVE_PENDENTE = "potala.conta.acao-pendente";
export const VALIDADE_PENDENTE = 30 * 60 * 1000;

export const ALTERNADORES = Object.freeze({
  salvar: Object.freeze({
    seletor: "[data-salvar]",
    colecao: "salvos",
    ler: ({ dataset }) => ({
      tipo: dataset.salvarTipo,
      ref: dataset.salvarRef,
      titulo: dataset.salvarTitulo,
      href: dataset.salvarHref,
      imagem: dataset.salvarImagem || null,
    }),
    criar: (item, quando) => criarSalvo({ ...item, salvoEm: quando }),
    nome: (item) => item.titulo,
    rotulo: (ligado) => (ligado ? "Salvo" : "Salvar"),
    aria: (ligado, nome) => (ligado ? `Remover “${nome}” dos salvos` : `Salvar “${nome}”`),
    anuncio: (ligado, nome) => (ligado ? `“${nome}” está em Salvos.` : `“${nome}” saiu de Salvos.`),
    descricao: (nome) => `salvar “${nome}”`,
  }),
  acompanhar: Object.freeze({
    seletor: "[data-acompanhar]",
    colecao: "acompanhando",
    ler: ({ dataset }) => ({ tipo: dataset.acompanharTipo, ref: dataset.acompanharRef, rotulo: dataset.acompanharRotulo }),
    criar: (item, quando) => criarAcompanhado({ ...item, desde: quando }),
    nome: (item) => item.rotulo,
    rotulo: (ligado) => (ligado ? "Acompanhando" : "Acompanhar"),
    aria: (ligado, nome) => (ligado ? `Deixar de acompanhar ${nome}` : `Acompanhar ${nome}`),
    anuncio: (ligado, nome) => (ligado ? `Você passou a acompanhar ${nome}.` : `Você deixou de acompanhar ${nome}.`),
    descricao: (nome) => `acompanhar ${nome}`,
  }),
});

/* A ação guardada só vale se for de um tipo conhecido, recente e bem formada. */
export function pendenteValido(bruto, agora = Date.now()) {
  if (!bruto) return null;
  try {
    const registro = JSON.parse(bruto);
    if (!Object.hasOwn(ALTERNADORES, registro?.acao) || !registro.item || typeof registro.em !== "number") return null;
    if (agora - registro.em > VALIDADE_PENDENTE || registro.em > agora + 60_000) return null;
    return { acao: registro.acao, item: registro.item };
  } catch {
    return null;
  }
}

export function montarAlternadores({
  documento = document,
  sessao,
  acoes,
  anunciar = () => null,
  armazenamento = globalThis.localStorage,
  agora = () => Date.now(),
} = {}) {
  const chave = (item) => `${item.tipo}:${item.ref}`;
  const autenticado = () => sessao.obter().status === "autenticado";
  const estados = Object.fromEntries(Object.keys(ALTERNADORES).map((nome) => [
    nome,
    { mapa: new Map(), carregado: false, carregando: null, mutacoes: 0 },
  ]));

  function guardarPendente(acao, item) {
    try {
      armazenamento?.setItem(CHAVE_PENDENTE, JSON.stringify({ acao, item, em: agora() }));
    } catch {
      /* Sem armazenamento, a ação ainda acontece se o login for nesta aba. */
    }
  }

  function limparPendente() {
    try {
      armazenamento?.removeItem(CHAVE_PENDENTE);
    } catch {
      /* Nada guardado, nada a limpar. */
    }
  }

  function lerPendente() {
    try {
      return pendenteValido(armazenamento?.getItem(CHAVE_PENDENTE), agora());
    } catch {
      return null;
    }
  }

  function pintar() {
    for (const [nome, definicao] of Object.entries(ALTERNADORES)) {
      const { mapa } = estados[nome];
      for (const botao of documento.querySelectorAll(definicao.seletor)) {
        const item = definicao.ler(botao);
        const ligado = autenticado() && mapa.has(chave(item));
        botao.setAttribute("aria-pressed", String(ligado));
        botao.setAttribute("aria-label", definicao.aria(ligado, definicao.nome(item)));
        botao.dataset.alternadorPintado = "";
        const rotulo = botao.querySelector("[data-alternador-rotulo]");
        if (rotulo && rotulo.textContent !== definicao.rotulo(ligado)) rotulo.textContent = definicao.rotulo(ligado);
      }
    }
  }

  /*
   * A lista é relida se algo mudou enquanto ela chegava.
   *
   * Salvar logo depois de entrar dispara duas coisas ao mesmo tempo: a leitura
   * dos salvos e a gravação do novo. Se a leitura voltasse depois, apagaria da
   * memória o item recém-salvo, e o botão diria "Salvar" para algo já salvo.
   */
  function carregar(nome) {
    const estado = estados[nome];
    if (!autenticado()) return Promise.resolve();
    if (estado.carregando) return estado.carregando;
    const usuarioId = sessao.obter().usuario?.id;

    estado.carregando = (async () => {
      try {
        let lista;
        let antes;
        do {
          antes = estado.mutacoes;
          lista = await sessao.colecao(ALTERNADORES[nome].colecao).listar();
        } while (estado.mutacoes !== antes);
        if (sessao.obter().usuario?.id === usuarioId) {
          estado.mapa = new Map(lista.map((item) => [chave(item), item.id]));
          estado.carregado = true;
        }
      } catch {
        /* Sem a lista, o botão continua oferecendo a ação, que ainda funciona. */
      } finally {
        estado.carregando = null;
      }
      pintar();
    })();
    return estado.carregando;
  }

  function recarregar() {
    for (const [nome, estado] of Object.entries(estados)) {
      estado.mapa = new Map();
      estado.carregado = false;
      if (autenticado() && documento.querySelector(ALTERNADORES[nome].seletor)) carregar(nome);
    }
    pintar();
  }

  /* Botões que chegam depois — o artigo desenhado após a conta — ganham estado aqui. */
  function aoAparecerem() {
    for (const [nome, estado] of Object.entries(estados)) {
      if (autenticado() && !estado.carregado && documento.querySelector(ALTERNADORES[nome].seletor)) carregar(nome);
    }
    pintar();
  }

  async function ligar(nome, item) {
    const definicao = ALTERNADORES[nome];
    const estado = estados[nome];
    estado.mutacoes += 1;
    const registro = definicao.criar(item, new Date(agora()));
    const gravado = await sessao.colecao(definicao.colecao).gravar(registro);
    estado.mapa.set(chave(item), gravado?.id ?? registro.id);
    limparPendente();
    pintar();
    anunciar(definicao.anuncio(true, definicao.nome(item)));
  }

  async function desligar(nome, item) {
    const definicao = ALTERNADORES[nome];
    const estado = estados[nome];
    estado.mutacoes += 1;
    await sessao.colecao(definicao.colecao).remover(estado.mapa.get(chave(item)));
    estado.mapa.delete(chave(item));
    pintar();
    anunciar(definicao.anuncio(false, definicao.nome(item)));
  }

  async function aoClicar(evento) {
    for (const [nome, definicao] of Object.entries(ALTERNADORES)) {
      const botao = evento.target.closest?.(definicao.seletor);
      if (!botao) continue;
      evento.preventDefault();
      const item = definicao.ler(botao);
      const estado = estados[nome];
      botao.setAttribute("aria-busy", "true");

      try {
        if (autenticado()) {
          await carregar(nome);
          if (estado.mapa.has(chave(item))) await desligar(nome, item);
          else await ligar(nome, item);
          return;
        }
        guardarPendente(nome, item);
        const aconteceu = await acoes.exigir({
          descricao: definicao.descricao(definicao.nome(item)),
          executar: async () => {
            await carregar(nome);
            if (!estado.mapa.has(chave(item))) {
              await ligar(nome, item);
              return;
            }
            /*
             * Já estava salvo nesta conta — de outra visita, de outro aparelho.
             * O pedido foi atendido do mesmo jeito: a intenção guardada sai, e a
             * pessoa ouve o que ela queria saber.
             */
            limparPendente();
            pintar();
            anunciar(definicao.anuncio(true, definicao.nome(item)));
          },
        });
        if (!aconteceu && sessao.obter().status !== "aguardando-confirmacao") limparPendente();
      } catch (erro) {
        anunciar(mensagemDoErro(erro));
      } finally {
        botao.removeAttribute("aria-busy");
      }
      return;
    }
  }

  let statusAnterior = sessao.obter().status;
  const desligarSessao = sessao.assinar((estado) => {
    const mudou = (estado.status === "autenticado") !== (statusAnterior === "autenticado");
    statusAnterior = estado.status;
    if (mudou) recarregar();
  });

  documento.addEventListener("click", aoClicar);
  if (autenticado()) recarregar();

  return {
    recarregar,
    aoAparecerem,
    /* Só na chegada: é o caminho de quem voltou pelo link de confirmação. */
    async aplicarPendente() {
      const pendente = lerPendente();
      if (!pendente || !autenticado()) return false;
      try {
        await carregar(pendente.acao);
        if (estados[pendente.acao].mapa.has(chave(pendente.item))) limparPendente();
        else await ligar(pendente.acao, pendente.item);
        return true;
      } catch {
        return false;
      }
    },
    destroy() {
      desligarSessao();
      documento.removeEventListener("click", aoClicar);
    },
  };
}
