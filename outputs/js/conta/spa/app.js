/*
 * O MEU POTALA COMO SPA.
 *
 * Um documento, um roteador e nove telas. Ir de Salvos para Agenda troca o miolo
 * da página sem recarregar: o topo, o botão da conta e o painel ficam onde
 * estão, e a troca tem uma transição curta em vez de um clarão branco.
 *
 * OS DADOS SÃO LIDOS UMA VEZ POR VISITA. As oito coleções chegam juntas e as
 * telas trabalham sobre essa cópia: trocar de tela não pede nada ao banco.
 * Remover um salvo muda o banco e a cópia, e a tela redesenha na hora.
 *
 * A AUTORIZAÇÃO NÃO MORA AQUI. Esta tela esconde o espaço de quem não entrou por
 * cortesia, não por segurança: quem decide o que cada pessoa lê e grava são as
 * políticas de RLS do banco. Um visitante que forçasse esta tela a desenhar não
 * receberia dado nenhum para mostrar.
 */

import { montarConta } from "../conta.js";
import { mensagemDoErro } from "../mensagens.js";
import { notificacoesPermitidas } from "../leituras.js";
import { TIPOS_DE_NOTIFICACAO, criarCompromisso, criarPreferencia } from "../modelos.js";
import { criarRoteador } from "./roteador.js";
import { renderizarCabecalho, renderizarCarregando, renderizarNaoEncontrada, renderizarVisitante } from "./vistas/comum.js";
import inicio from "./vistas/inicio.js";
import perfil from "./vistas/perfil.js";
import cursos from "./vistas/cursos.js";
import agenda from "./vistas/agenda.js";
import salvos from "./vistas/salvos.js";
import historico from "./vistas/historico.js";
import acompanhando from "./vistas/acompanhando.js";
import notificacoes from "./vistas/notificacoes.js";
import configuracoes from "./vistas/configuracoes.js";

export const VISTAS = Object.freeze({ inicio, perfil, cursos, agenda, salvos, historico, acompanhando, notificacoes, configuracoes });
const COLECOES_DA_AREA = Object.freeze(["salvos", "historico", "acompanhando", "inscricoes", "progressos", "agenda", "notificacoes", "preferencias"]);

export async function montarMeuPotala({ documento = document, janela = window } = {}) {
  const palco = documento.querySelector("[data-meu-potala]");
  if (!palco) return null;
  const conta = await montarConta({ documento, janela });
  if (!conta) return null;
  const { sessao, painel, anunciar } = conta;

  const reduzido = () => Boolean(janela.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  let dados = null;
  let dono = null;
  let pedido = null;
  let desligarVista = null;
  let geracao = 0;
  let esperaDaLimpeza = 0;

  /* ------------------------------------------------------------------
   * Dados
   * ------------------------------------------------------------------ */

  /*
   * Uma coleção que falha não derruba as outras.
   *
   * Sem a agenda, Salvos continua útil. A tela avisa que parte não carregou e
   * oferece tentar de novo, em vez de uma página inteira de erro.
   */
  function carregarDados() {
    const usuarioId = sessao.obter().usuario?.id;
    if (dados && dono === usuarioId) return Promise.resolve(dados);
    if (pedido?.usuarioId === usuarioId) return pedido.promessa;

    const promessa = Promise.all(COLECOES_DA_AREA.map((nome) => sessao.colecao(nome).listar()
      .then((lista) => ({ nome, lista }))
      .catch((erro) => ({ nome, lista: [], erro }))))
      .then((respostas) => {
        if (sessao.obter().usuario?.id !== usuarioId) return null;
        dados = Object.fromEntries(respostas.map(({ nome, lista }) => [nome, lista]));
        dados.falhas = respostas.filter((resposta) => resposta.erro).map((resposta) => resposta.nome);
        dono = usuarioId;
        return dados;
      })
      .finally(() => {
        if (pedido?.promessa === promessa) pedido = null;
      });
    pedido = { usuarioId, promessa };
    return promessa;
  }

  const trocarNaCopia = (nome, transformar) => {
    if (dados) dados = { ...dados, [nome]: transformar(dados[nome] || []) };
  };
  const acharEm = (nome, id) => (dados?.[nome] || []).find((item) => item.id === id);

  /* ------------------------------------------------------------------
   * Desenho
   * ------------------------------------------------------------------ */

  function ligarVista(nome) {
    desligarVista?.();
    desligarVista = null;
    const vista = VISTAS[nome];
    if (!vista?.ligar || !palco.querySelector("[data-vista]")) return;
    desligarVista = vista.ligar(palco, { sessao, anunciar, atualizar: () => desenhar("atualizacao") }) || null;
  }

  /*
   * O FOCO DEPOIS DE CADA TROCA.
   *
   * Mudou de tela: vai para o título, e a página volta ao topo — é o que um
   * leitor de tela anuncia como "página nova". Redesenhou a mesma tela (removeu
   * um salvo, trocou um filtro, ligou um aviso): o foco fica onde estava, ou no
   * vizinho mais próximo quando o elemento sumiu. Sem isso, quem usa teclado
   * voltaria ao começo do documento a cada clique.
   */
  function trocar(html, { nome = null, origem }) {
    const focoAntes = documento.activeElement;
    const focoEstavaAqui = focoAntes && focoAntes !== palco && palco.contains(focoAntes);
    const idDoFoco = focoAntes?.id || null;
    const mudaDeTela = origem === "navegacao" || origem === "historico";

    const aplicar = () => {
      palco.innerHTML = html;
      ligarVista(nome);
    };
    const depois = () => {
      /*
       * Entrar ou sair redesenha a página inteira, e o botão que tinha o foco —
       * o "Entrar" do convite — deixa de existir. Sem isto o foco caía no corpo
       * do documento, e a rolagem ficava onde o convite estava.
       */
      if (origem === "sessao" && (!documento.activeElement || documento.activeElement === documento.body)) {
        janela.scrollTo?.({ top: 0, behavior: "instant" });
        palco.querySelector("[data-vista-titulo]")?.focus({ preventScroll: true });
        return;
      }
      if (mudaDeTela) {
        janela.scrollTo?.({ top: 0, behavior: "instant" });
        palco.querySelector("[data-vista-titulo]")?.focus({ preventScroll: true });
        return;
      }
      if (focoEstavaAqui && !focoAntes.isConnected) {
        const alvo = (idDoFoco && documento.getElementById(idDoFoco))
          || palco.querySelector("[data-foco-reserva]")
          || palco.querySelector("[data-vista-titulo]");
        alvo?.focus({ preventScroll: true });
      }
    };

    if (mudaDeTela && typeof documento.startViewTransition === "function" && !reduzido()) {
      documento.startViewTransition(aplicar).updateCallbackDone.then(depois, depois);
    } else {
      aplicar();
      depois();
    }
  }

  async function desenhar(origem = "navegacao") {
    const minha = ++geracao;
    const { rota, encontrada } = roteador.atual();
    const estado = sessao.obter();
    documento.title = `${encontrada ? rota.titulo : "Meu Potala"} — Instituto Potala`;

    if (estado.status === "carregando") return trocar(renderizarCarregando(), { origem: "carregamento" });
    if (!encontrada) return trocar(renderizarNaoEncontrada(), { origem });
    if (estado.status !== "autenticado") return trocar(renderizarVisitante(estado), { origem });

    if (!dados || dono !== estado.usuario.id) {
      if (origem !== "atualizacao") trocar(renderizarCarregando(), { origem: "carregamento" });
      await carregarDados();
      if (minha !== geracao || !dados) return;
    }

    const atual = sessao.obter();
    const contexto = { ...dados, estado: atual, agora: new Date(), parametros: new URLSearchParams(janela.location.search) };
    let corpo;
    try {
      corpo = VISTAS[rota.nome].renderizar(contexto);
    } catch (erro) {
      console.error(`Meu Potala: a tela ${rota.nome} não pôde ser desenhada.`, erro);
      corpo = "<p class=\"mp-aviso\" role=\"alert\">Esta parte do seu espaço não pôde ser mostrada agora.</p>";
    }
    const falhou = dados.falhas.length
      ? "<p class=\"mp-aviso\" role=\"status\">Parte do seu espaço não carregou. <button type=\"button\" class=\"mp-link-botao\" data-acao=\"recarregar\">Tentar de novo</button></p>"
      : "";
    trocar(
      `${renderizarCabecalho({ estado: atual, rota, dados })}${falhou}<div class="mp-vista" data-vista="${rota.nome}">${corpo}</div>`,
      { nome: rota.nome, origem },
    );
  }

  /* ------------------------------------------------------------------
   * Ações
   * ------------------------------------------------------------------ */

  async function agir(botao, trabalho, sucesso) {
    if (botao) {
      botao.disabled = true;
      botao.setAttribute("aria-busy", "true");
    }
    try {
      await trabalho();
      if (sucesso) anunciar(sucesso);
      desenhar("atualizacao");
    } catch (erro) {
      anunciar(mensagemDoErro(erro));
      if (botao?.isConnected) {
        botao.disabled = false;
        botao.removeAttribute("aria-busy");
      }
    }
  }

  const removerDe = (colecao, id) => async () => {
    await sessao.colecao(colecao).remover(id);
    trocarNaCopia(colecao, (lista) => lista.filter((item) => item.id !== id));
  };

  const ACOES = {
    "remover-salvo": (botao, id) => {
      const item = acharEm("salvos", id);
      return agir(botao, removerDe("salvos", id), item ? `“${item.titulo}” saiu de Salvos.` : "Item removido de Salvos.");
    },
    "remover-historico": (botao, id) => agir(botao, removerDe("historico", id), "Removido do histórico."),
    "deixar-de-acompanhar": (botao, id) => {
      const item = acharEm("acompanhando", id);
      return agir(botao, removerDe("acompanhando", id), item ? `Você deixou de acompanhar ${item.rotulo}.` : "Você deixou de acompanhar.");
    },
    "remover-compromisso": (botao, id) => agir(botao, removerDe("agenda", id), "Compromisso removido da agenda."),

    /* Apagar tudo pede um segundo toque em cinco segundos: não há como desfazer. */
    "limpar-historico": (botao) => {
      if (!botao.dataset.confirmando) {
        botao.dataset.confirmando = "true";
        botao.textContent = "Toque de novo para apagar tudo";
        clearTimeout(esperaDaLimpeza);
        esperaDaLimpeza = setTimeout(() => {
          if (!botao.isConnected) return;
          delete botao.dataset.confirmando;
          botao.textContent = "Limpar histórico";
        }, 5000);
        return null;
      }
      clearTimeout(esperaDaLimpeza);
      return agir(botao, async () => {
        await sessao.colecao("historico").limpar();
        trocarNaCopia("historico", () => []);
      }, "Histórico apagado.");
    },

    "marcar-lida": (botao, id) => agir(botao, async () => {
      const quando = new Date().toISOString();
      await sessao.colecao("notificacoes").marcarLida(id, quando);
      trocarNaCopia("notificacoes", (lista) => lista.map((item) => (item.id === id ? { ...item, lidaEm: quando } : item)));
      conta.recontarAvisos();
    }, "Aviso marcado como lido."),

    "marcar-todas": (botao) => agir(botao, async () => {
      const quando = new Date().toISOString();
      const pendentes = notificacoesPermitidas(dados.notificacoes, dados.preferencias).filter((item) => !item.lidaEm);
      for (const item of pendentes) await sessao.colecao("notificacoes").marcarLida(item.id, quando);
      const lidos = new Set(pendentes.map((item) => item.id));
      trocarNaCopia("notificacoes", (lista) => lista.map((item) => (lidos.has(item.id) ? { ...item, lidaEm: quando } : item)));
      conta.recontarAvisos();
    }, "Todos os avisos foram marcados como lidos."),

    /* O link segue normalmente; marcar como lido vai junto, sem segurar a navegação. */
    "abrir-aviso": (_botao, id) => {
      const item = acharEm("notificacoes", id);
      if (item && !item.lidaEm) sessao.colecao("notificacoes").marcarLida(id).catch(() => null);
      return null;
    },

    sair: (botao) => agir(botao, () => sessao.sair(), "Você saiu. Até a próxima travessia."),

    recarregar: () => {
      dados = null;
      dono = null;
      return desenhar("atualizacao");
    },
  };

  const aoClicar = (evento) => {
    const abrir = evento.target.closest?.("[data-conta-abrir]");
    if (abrir) {
      painel.abrir({ estado: abrir.dataset.contaAbrir, origem: abrir });
      return;
    }
    const botao = evento.target.closest?.("[data-acao]");
    if (!botao || !palco.contains(botao)) return;
    ACOES[botao.dataset.acao]?.(botao, botao.dataset.id);
  };

  const aoMudarPreferencia = (evento) => {
    const chave = evento.target.closest?.("[data-preferencia]");
    if (!chave) return;
    const tipo = chave.dataset.preferencia;
    const ativa = chave.checked;
    const rotulo = TIPOS_DE_NOTIFICACAO.find((opcao) => opcao.id === tipo)?.rotulo || "Aviso";
    chave.disabled = true;

    sessao.colecao("preferencias").gravar(criarPreferencia({ tipo, ativa }))
      .then(() => {
        trocarNaCopia("preferencias", (lista) => [...lista.filter((item) => item.tipo !== tipo), criarPreferencia({ tipo, ativa })]);
        anunciar(`${rotulo}: ${ativa ? "ligado" : "desligado"}.`);
        conta.recontarAvisos();
        desenhar("atualizacao");
      })
      .catch((erro) => {
        chave.checked = !ativa;
        chave.disabled = false;
        anunciar(mensagemDoErro(erro));
      });
  };

  const aoEnviar = (evento) => {
    const form = evento.target.closest?.("[data-form='compromisso']");
    if (!form) return;
    evento.preventDefault();
    const campos = Object.fromEntries(new FormData(form));
    const aviso = form.querySelector("[data-form-status]");

    if (!String(campos.titulo || "").trim() || !campos.data || !campos.hora) {
      aviso.textContent = "Diga o quê, o dia e a hora.";
      return;
    }
    let registro;
    try {
      /* "2026-09-20T19:00", sem fuso: o navegador lê como hora local de quem anotou. */
      registro = criarCompromisso({ tipo: "outro", titulo: campos.titulo, inicio: new Date(`${campos.data}T${campos.hora}`), local: campos.local, origem: "pessoal" });
    } catch {
      aviso.textContent = "Confira o dia e a hora.";
      return;
    }
    if (new Date(registro.inicio) < new Date()) {
      aviso.textContent = "Esse horário já passou.";
      return;
    }
    agir(form.querySelector("[type='submit']"), async () => {
      const gravado = await sessao.colecao("agenda").gravar(registro);
      trocarNaCopia("agenda", (lista) => [...lista, gravado || registro]);
    }, `“${registro.titulo}” está na sua agenda.`);
  };

  /* ------------------------------------------------------------------
   * Ligação
   * ------------------------------------------------------------------ */

  const roteador = criarRoteador({ janela, documento, aoMudar: (_resolucao, { origem }) => desenhar(origem) });

  const retrato = (estado) => ({ status: estado.status, usuarioId: estado.usuario?.id || null, perfil: estado.perfil });
  let anterior = retrato(sessao.obter());
  const desligarSessao = sessao.assinar((estado) => {
    const agora = retrato(estado);
    if (agora.usuarioId !== dono) {
      dados = null;
      dono = null;
    }
    const mudouPessoa = agora.status !== anterior.status || agora.usuarioId !== anterior.usuarioId;
    const mudouPerfil = agora.perfil !== anterior.perfil;
    anterior = agora;
    if (mudouPessoa) desenhar("sessao");
    else if (mudouPerfil && !palco.querySelector("[data-perfil-form][data-alterado]")) desenhar("atualizacao");
  });

  palco.addEventListener("click", aoClicar);
  palco.addEventListener("change", aoMudarPreferencia);
  palco.addEventListener("submit", aoEnviar);
  roteador.iniciar();

  return {
    roteador,
    desenhar,
    destroy() {
      desligarVista?.();
      desligarSessao();
      roteador.destroy();
      palco.removeEventListener("click", aoClicar);
      palco.removeEventListener("change", aoMudarPreferencia);
      palco.removeEventListener("submit", aoEnviar);
    },
  };
}

if (typeof document !== "undefined" && document.querySelector?.("[data-meu-potala]")) {
  montarMeuPotala().catch((erro) => {
    console.error("Não foi possível abrir o Meu Potala.", erro);
    const palco = document.querySelector("[data-meu-potala]");
    if (palco) palco.innerHTML = "<p class=\"mp-aviso\" role=\"alert\">Seu espaço não abriu agora. Recarregue a página em alguns instantes.</p>";
  });
}
