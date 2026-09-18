/*
 * A CONTA NO PORTAL: ONDE AS PEÇAS SE ENCONTRAM.
 *
 * Este é o único arquivo que sabe QUAL adaptador usar. Tudo o mais — sessão,
 * painel, "Salvar", histórico, Meu Potala — recebe as peças prontas.
 *
 * O SDK DO SUPABASE SÓ É BAIXADO QUANDO PRECISA. São 131 KB, e a maior parte das
 * visitas é de quem nunca entrou. Sem sessão guardada no navegador, a pessoa é
 * visitante sem nenhum download; o SDK vem quando ela vai entrar, ou quando já
 * existe uma sessão a restaurar.
 *
 * ?demo=conta liga a demonstração nesta aba, para avaliar a experiência sem
 * criar conta. ?demo=sair desliga.
 */

import { criarSessao, comReserva } from "./sessao.js";
import { criarAutenticacaoDemonstracao, criarDadosDemonstracao } from "./adaptadores/demonstracao.js";
import { montarPainelConta } from "./painel-conta.js";
import { criarAcoesComConta } from "./acoes-com-conta.js";
import { montarAlternadores } from "./alternadores.js";
import { montarRastro } from "./rastro.js";
import { atualizarGatilhos, garantirGatilho } from "./gatilho.js";
import { iniciaisDe, nomeDeExibicao } from "./modelos.js";
import { naoLidas, notificacoesPermitidas } from "./leituras.js";

const URL_DO_SDK = new URL("../../vendor/supabase.js", import.meta.url).href;
const URL_DO_CSS = new URL("../../css/conta.css", import.meta.url).href;
const CHAVE_DEMO = "potala.conta.demo";

function relatarFalhaDePersistencia(erro, contexto) {
  console.warn(`Conta: falha em ${contexto}.`, erro);
}

export function querDemonstracao(local = globalThis.location, armazenamento = globalThis.sessionStorage) {
  const pedido = new URLSearchParams(local?.search || "").get("demo");
  try {
    if (pedido === "conta" || pedido === "visita") {
      armazenamento?.setItem(CHAVE_DEMO, "1");
      return true;
    }
    if (pedido === "sair") {
      armazenamento?.removeItem(CHAVE_DEMO);
      return false;
    }
    return armazenamento?.getItem(CHAVE_DEMO) === "1";
  } catch {
    return pedido === "conta";
  }
}

/*
 * Existe uma sessão para restaurar?
 *
 * Duas pistas: o token que o Supabase grava (sb-<projeto>-auth-token) e os
 * parâmetros com que ele devolve a pessoa de um link de confirmação ou do Google.
 * Sem nenhuma das duas, não há o que restaurar e o SDK não precisa vir.
 */
export function haSessaoGuardada(armazenamento = globalThis.localStorage, local = globalThis.location) {
  if (/[#&?](access_token|code|error_description)=/.test(`${local?.hash || ""}${local?.search || ""}`)) return true;
  try {
    for (let indice = 0; indice < (armazenamento?.length || 0); indice += 1) {
      if (/^sb-[a-z0-9]+-auth-token$/.test(armazenamento.key(indice) || "")) return true;
    }
  } catch {
    /* Armazenamento bloqueado: não há sessão que se possa ler. */
  }
  return false;
}

let sdkPrometido = null;

export function carregarSdk(documento = document) {
  if (globalThis.supabase?.createClient) return Promise.resolve(globalThis.supabase);
  if (!sdkPrometido) {
    sdkPrometido = new Promise((resolver, rejeitar) => {
      const script = documento.createElement("script");
      script.src = URL_DO_SDK;
      script.async = true;
      script.onload = () => (globalThis.supabase?.createClient
        ? resolver(globalThis.supabase)
        : rejeitar(new Error("O SDK do Supabase carregou sem createClient.")));
      script.onerror = () => {
        sdkPrometido = null;
        rejeitar(new Error("O SDK do Supabase não pôde ser carregado."));
      };
      documento.head.append(script);
    });
  }
  return sdkPrometido;
}

/*
 * Um adaptador de autenticação que só fabrica o real na primeira necessidade.
 *
 * Quem assina mudanças antes de o SDK existir não é esquecido: os ouvintes ficam
 * guardados e são ligados ao adaptador real no momento em que ele nasce.
 */
export function autenticacaoPreguicosa({ fabricar, haSessao }) {
  let real = null;
  let prometida = null;
  const esperando = new Set();
  const desligadores = new Map();

  function obterReal() {
    if (real) return Promise.resolve(real);
    if (!prometida) {
      prometida = fabricar()
        .then((adaptador) => {
          real = adaptador;
          for (const ouvinte of esperando) desligadores.set(ouvinte, real.aoMudar?.(ouvinte));
          esperando.clear();
          return real;
        })
        .catch((erro) => {
          prometida = null;
          throw erro;
        });
    }
    return prometida;
  }

  const delegar = (metodo) => async (...argumentos) => (await obterReal())[metodo](...argumentos);

  return {
    demonstracao: false,
    async sessaoAtual() {
      if (!real && !haSessao()) return { usuario: null };
      return (await obterReal()).sessaoAtual();
    },
    entrar: delegar("entrar"),
    criarConta: delegar("criarConta"),
    sair: delegar("sair"),
    recuperarSenha: delegar("recuperarSenha"),
    definirNovaSenha: delegar("definirNovaSenha"),
    provedores: delegar("provedores"),
    entrarComGoogle: delegar("entrarComGoogle"),
    aoMudar(ouvinte) {
      if (real) return real.aoMudar(ouvinte);
      esperando.add(ouvinte);
      return () => {
        esperando.delete(ouvinte);
        desligadores.get(ouvinte)?.();
      };
    },
  };
}

function dadosPreguicosos(fabricar) {
  let prometidos = null;
  const obter = () => {
    prometidos ||= fabricar().catch((erro) => {
      prometidos = null;
      throw erro;
    });
    return prometidos;
  };
  const delegar = (metodo) => async (...argumentos) => (await obter())[metodo](...argumentos);
  return {
    perfil: delegar("perfil"),
    salvarPerfil: delegar("salvarPerfil"),
    listar: delegar("listar"),
    gravar: delegar("gravar"),
    remover: delegar("remover"),
    limpar: delegar("limpar"),
    marcarLida: delegar("marcarLida"),
  };
}

let sessaoGlobal = null;

/*
 * O pedido de demonstração sai do endereço depois de lido.
 *
 * Ele já ficou guardado na aba. Deixá-lo no endereço faria um link copiado dali
 * abrir a demonstração para outra pessoa, e o botão Voltar repetiria a entrada.
 */
function tirarPedidoDoEndereco(janela) {
  try {
    const url = new URL(janela.location.href);
    url.searchParams.delete("demo");
    janela.history.replaceState(janela.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* Sem History API, o parâmetro só continua visível no endereço. */
  }
}

export function obterSessaoGlobal({ documento = document, janela = window } = {}) {
  if (sessaoGlobal) return sessaoGlobal;
  const reserva = criarDadosDemonstracao();
  const pedido = new URLSearchParams(janela.location.search).get("demo");
  const demonstracao = querDemonstracao(janela.location, janela.sessionStorage);
  if (pedido) tirarPedidoDoEndereco(janela);

  if (demonstracao) {
    const autenticacao = criarAutenticacaoDemonstracao();
    /*
     * ?demo=visita é o botão "ver sem conta": entra direto como a pessoa
     * fictícia, sem formulário. Antes de a sessão ler quem está dentro — por
     * isso aqui, e não depois de montar.
     */
    if (pedido === "visita") autenticacao.iniciarVisita();
    sessaoGlobal = criarSessao({ autenticacao, dados: reserva, aoFalhar: relatarFalhaDePersistencia });
  } else {
    /* Sair da demonstração leva junto a pessoa fictícia, para ela não reaparecer numa próxima visita. */
    if (pedido === "sair") criarAutenticacaoDemonstracao().sair();
    const cliente = async () => {
      const sdk = await carregarSdk(documento);
      const { getSupabaseClient } = await import("../supabase/client.js");
      return getSupabaseClient({ sdk });
    };
    const autenticacao = autenticacaoPreguicosa({
      fabricar: async () => {
        const { criarAutenticacaoSupabase } = await import("./adaptadores/supabase.js");
        return criarAutenticacaoSupabase({ client: await cliente(), origem: janela.location.origin });
      },
      haSessao: () => haSessaoGuardada(janela.localStorage, janela.location),
    });
    const principal = dadosPreguicosos(async () => {
      const { criarDadosSupabase } = await import("./adaptadores/supabase.js");
      return criarDadosSupabase({ client: await cliente() });
    });
    sessaoGlobal = criarSessao({ autenticacao, dados: comReserva(principal, reserva), aoFalhar: relatarFalhaDePersistencia });
  }

  sessaoGlobal.iniciar();
  return sessaoGlobal;
}

function injetarCss(documento) {
  if (documento.querySelector("link[data-conta-css]")) return Promise.resolve();
  return new Promise((pronto) => {
    const link = documento.createElement("link");
    link.rel = "stylesheet";
    link.href = URL_DO_CSS;
    link.setAttribute("data-conta-css", "");
    link.onload = pronto;
    link.onerror = pronto;
    documento.head.append(link);
    /* Uma folha lenta não pode segurar a conta: o botão já funciona sem ela. */
    setTimeout(pronto, 1500);
  });
}

function criarAnunciador(documento) {
  const regiao = documento.createElement("p");
  regiao.className = "conta-anuncio";
  regiao.setAttribute("role", "status");
  regiao.setAttribute("aria-live", "polite");
  regiao.setAttribute("data-keeps-expansion", "");
  documento.body.append(regiao);
  let temporizador = 0;
  return (mensagem) => {
    regiao.textContent = mensagem;
    regiao.classList.add("is-visivel");
    clearTimeout(temporizador);
    temporizador = setTimeout(() => regiao.classList.remove("is-visivel"), 3600);
  };
}

let montagem = null;

export function montarConta({ documento = document, janela = window } = {}) {
  /*
   * Nas prévias do painel editorial quem lê é o editor conferindo a página, e
   * não um visitante: nada de conta, botão ou histórico ali.
   */
  const parametros = new URLSearchParams(janela.location.search);
  if (parametros.get("admin-preview") === "1" || parametros.get("preview") === "1") return Promise.resolve(null);
  if (montagem) return montagem;

  montagem = (async () => {
    await injetarCss(documento);
    const sessao = obterSessaoGlobal({ documento, janela });
    garantirGatilho(documento);

    let avisosNovos = 0;
    const painel = montarPainelConta({ documento, sessao, janela, obterNaoLidas: () => avisosNovos });
    const acoes = criarAcoesComConta({ sessao, painel, janela });
    const anunciar = criarAnunciador(documento);
    const alternadores = montarAlternadores({ documento, sessao, acoes, anunciar });
    const rastro = montarRastro({ documento, sessao, aoFalhar: relatarFalhaDePersistencia });

    const pintar = (estado) => {
      const nome = nomeDeExibicao(estado.usuario, estado.perfil);
      atualizarGatilhos(documento, estado, {
        iniciais: iniciaisDe(nome, estado.usuario?.email),
        nome,
        avatarUrl: estado.perfil?.avatarUrl,
        naoLidas: avisosNovos,
      });
    };

    async function contarAvisos() {
      if (sessao.obter().status !== "autenticado") {
        avisosNovos = 0;
        return;
      }
      try {
        const [avisos, preferencias] = await Promise.all([
          sessao.colecao("notificacoes").listar(),
          sessao.colecao("preferencias").listar(),
        ]);
        avisosNovos = naoLidas(notificacoesPermitidas(avisos, preferencias));
      } catch {
        avisosNovos = 0;
      }
      pintar(sessao.obter());
    }

    let statusAnterior = null;
    const aoMudar = (estado) => {
      pintar(estado);
      if (estado.status === statusAnterior) return;
      const chegando = statusAnterior === null || statusAnterior === "carregando";
      statusAnterior = estado.status;
      contarAvisos();
      /*
       * A ação guardada é retomada só na CHEGADA autenticada — quem volta pelo
       * link de confirmação. Um login feito agora, nesta aba, já conclui a ação
       * pelo painel; retomá-la aqui também a faria duas vezes.
       */
      if (estado.status === "autenticado" && chegando) alternadores.aplicarPendente();
    };
    sessao.assinar(aoMudar);
    aoMudar(sessao.obter());

    /*
     * A Home redesenha a jornada quando o conteúdo remoto chega, e o botão do
     * canto nasce de novo, sem as iniciais; o artigo desenha os seus botões
     * depois da conta. O observador só age quando aparece algo ainda sem estado.
     */
    const observador = new MutationObserver(() => {
      if (documento.querySelector("[data-conta-gatilho]:not([data-conta-estado])")) pintar(sessao.obter());
      if (documento.querySelector("[data-salvar]:not([data-alternador-pintado]), [data-acompanhar]:not([data-alternador-pintado])")) {
        alternadores.aoAparecerem();
      }
    });
    observador.observe(documento.body, { childList: true, subtree: true });

    return {
      sessao,
      painel,
      acoes,
      anunciar,
      alternadores,
      recontarAvisos: contarAvisos,
      destroy() {
        observador.disconnect();
        rastro.destroy();
        alternadores.destroy();
        acoes.destroy();
        painel.destroy();
      },
    };
  })();

  return montagem;
}
