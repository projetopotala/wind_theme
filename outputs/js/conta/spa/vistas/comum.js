/*
 * PEÇAS COMUNS DAS TELAS DO MEU POTALA.
 *
 * Toda tela é uma função que recebe o que a pessoa guardou e devolve HTML. Nada
 * aqui busca dado: as telas só leem o contexto que a SPA montou. Isso deixa
 * cada uma testável sem navegador e impede que duas telas peçam a mesma lista
 * ao banco ao mesmo tempo.
 */

import { escaparHtml } from "../../html.js";
import { iniciaisDe, nomeDeExibicao, primeiroNome } from "../../modelos.js";
import { continuarDeOndeParou, naoLidas, notificacoesPermitidas } from "../../leituras.js";
import { ROTAS, ROTAS_DA_NAVEGACAO, caminhoDa } from "../roteador.js";

export const e = escaparHtml;

export function secao({ id, kicker, titulo, acao = "", corpo, classe = "" }) {
  return `<section class="mp-secao ${classe}" aria-labelledby="${id}">
    <header class="mp-secao-topo">
      <div><p class="mp-kicker">${e(kicker)}</p><h2 id="${id}" class="mp-secao-titulo">${e(titulo)}</h2></div>
      ${acao}
    </header>
    ${corpo}
  </section>`;
}

export function verTudo(nome, texto = "Ver tudo") {
  return `<a class="mp-ver-tudo" href="${caminhoDa(nome)}">${e(texto)} <span aria-hidden="true">→</span></a>`;
}

export function vazio({ texto, link = null }) {
  const saida = link
    ? `<a class="mp-link" href="${e(link.href)}">${e(link.texto)} <span aria-hidden="true">↗</span></a>`
    : "";
  return `<div class="mp-vazio"><p>${e(texto)}</p>${saida}</div>`;
}

export function barraDeProgresso(fracao, rotulo) {
  const porcento = Math.round(Math.min(1, Math.max(0, Number(fracao) || 0)) * 100);
  return `<div class="mp-progresso" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${porcento}" aria-label="${e(rotulo || `${porcento}% percorrido`)}"><span style="--mp-avanco:${porcento}%"></span></div>`;
}

/* Sem imagem, uma capa com as iniciais: um espaço vazio parece imagem quebrada. */
export function capa(imagem, titulo) {
  if (imagem) return `<img class="mp-capa" src="${e(imagem)}" alt="" loading="lazy" decoding="async">`;
  return `<span class="mp-capa mp-capa-vazia" aria-hidden="true">${e(iniciaisDe(titulo))}</span>`;
}

function mensagemDeBoasVindas(dados) {
  if (continuarDeOndeParou(dados).length) return "Alguns caminhos você já começou. Outros ainda estão esperando por você.";
  if ((dados.salvos || []).length || (dados.historico || []).length) return "Continue sua jornada.";
  return "Seu espaço está pronto para guardar o que você encontrar pelo caminho.";
}

/*
 * DOIS AVISOS DIFERENTES PARA DADOS QUE NÃO SÃO DA PESSOA.
 *
 * Na demonstração ela escolheu ver dados de exemplo, e o aviso oferece a saída.
 * Numa conta real cujo banco ainda não foi conectado ela não escolheu nada — e
 * "sair da demonstração" não faria sentido, porque não há demonstração a
 * desligar: há uma migração a aplicar.
 */
function avisoDeDadosDeExemplo(estado) {
  if (estado.demonstracao) {
    return `<p class="mp-aviso" role="note">Você está vendo dados de demonstração, sem conta e sem entrar. Nada do que aparece aqui é seu, e o que você fizer fica só neste navegador. <a href="${caminhoDa("inicio")}?demo=sair" data-recarregar>Sair da demonstração</a></p>`;
  }
  if (estado.dadosEmReserva) {
    return "<p class=\"mp-aviso\" role=\"note\">Seu banco pessoal no Potala ainda não foi conectado: por enquanto aparecem dados de demonstração. Nada do que aparece aqui é seu.</p>";
  }
  return "";
}

/*
 * A ABA DA TELA ABERTA FICA À VISTA NA FAIXA.
 *
 * No celular as abas não cabem e a faixa rola de lado. O cabeçalho nasce de novo
 * a cada troca de tela, e a faixa nova começa no zero: quem tocava em Salvos via
 * a faixa voltar ao começo, com Salvos fora dela (MP-02).
 *
 * A conta é feita em coordenadas da própria faixa — de 0 até `total` — e devolve
 * a rolagem horizontal que deixa a aba inteira dentro da janela visível, com uma
 * folga que mostra um pedaço da vizinha e avisa que há mais abas. Aba já visível
 * não mexe em nada. Só a faixa rola: nunca a página.
 */
export const FOLGA_DA_ABA = 24;

export function rolagemQueRevelaAba({ atual = 0, visivel = 0, total = 0, abaInicio = 0, abaFim = 0, folga = FOLGA_DA_ABA } = {}) {
  const numero = (valor) => (Number.isFinite(valor) ? valor : 0);
  const maximo = Math.max(0, numero(total) - numero(visivel));
  let alvo = numero(atual);
  if (numero(abaInicio) - folga < alvo) alvo = numero(abaInicio) - folga;
  else if (numero(abaFim) + folga > alvo + numero(visivel)) alvo = numero(abaFim) + folga - numero(visivel);
  return Math.round(Math.min(maximo, Math.max(0, alvo)));
}

/*
 * Aplica a conta acima à faixa que acabou de ser desenhada.
 *
 * `rolagemAnterior` é onde a faixa velha estava: num redesenho da mesma tela
 * (remover um salvo, ligar um aviso) a faixa fica onde a pessoa a deixou; numa
 * troca, a aba recém-tocada já estava à vista e nada pula. Sem aba corrente na
 * faixa — Notificações e Configurações vivem fora dela —, só a posição volta.
 */
export function manterAbaAtivaVisivel(faixa, rolagemAnterior = 0, aba = faixa?.querySelector("[aria-current='page']")) {
  if (!faixa) return;
  const visivel = faixa.clientWidth;
  const total = faixa.scrollWidth;
  const atual = Math.min(Math.max(0, Number(rolagemAnterior) || 0), Math.max(0, total - visivel));
  let alvo = atual;
  if (aba && total > visivel) {
    const caixaDaFaixa = faixa.getBoundingClientRect();
    const caixaDaAba = aba.getBoundingClientRect();
    /* Posição da aba contada do começo da faixa, qualquer que seja a rolagem agora. */
    const abaInicio = caixaDaAba.left - caixaDaFaixa.left + faixa.scrollLeft;
    alvo = rolagemQueRevelaAba({ atual, visivel, total, abaInicio, abaFim: abaInicio + caixaDaAba.width });
  }
  if (Math.round(faixa.scrollLeft) !== alvo) faixa.scrollLeft = alvo;
}

/*
 * O LINK "NOTIFICAÇÕES" DO CABEÇALHO, EM PEÇAS.
 *
 * A contagem e o miolo do link existem uma vez só, aqui. O cabeçalho usa as duas
 * peças ao nascer; quando um aviso é confirmado como lido com a pessoa em outra
 * tela, a SPA troca só o miolo deste link (ver avisos.js) — e não a tela inteira,
 * que pode ter um formulário pela metade (D1).
 */
export function contarAvisosNovos(dados = {}) {
  return naoLidas(notificacoesPermitidas(dados.notificacoes || [], dados.preferencias || []));
}

export function conteudoDoLinkDeAvisos(avisos = 0) {
  const contador = avisos
    ? ` <span class="mp-contador">${avisos}<span class="mp-sr"> ${avisos === 1 ? "novo" : "novos"}</span></span>`
    : "";
  return `Notificações${contador}`;
}

export function renderizarLinkDeAvisos({ rota, dados }) {
  const corrente = rota?.nome === "notificacoes" ? " aria-current=\"page\"" : "";
  return `<a class="mp-nav-avisos" href="${caminhoDa("notificacoes")}"${corrente}>${conteudoDoLinkDeAvisos(contarAvisosNovos(dados))}</a>`;
}

export function renderizarCabecalho({ estado, rota, dados }) {
  const nome = nomeDeExibicao(estado.usuario, estado.perfil);
  const noInicio = rota.nome === "inicio";

  const abas = ROTAS_DA_NAVEGACAO.map((nomeDaRota) => {
    const definicao = ROTAS.find((candidata) => candidata.nome === nomeDaRota);
    const corrente = nomeDaRota === rota.nome ? " aria-current=\"page\"" : "";
    return `<li><a href="${caminhoDa(nomeDaRota)}"${corrente}>${e(definicao.rotulo)}</a></li>`;
  }).join("");

  return `<header class="mp-cabecalho">
    <p class="mp-kicker">Meu Potala</p>
    <h1 class="mp-titulo" id="mp-vista-titulo" data-vista-titulo tabindex="-1">${noInicio ? `Olá, ${e(primeiroNome(estado.usuario, estado.perfil))}.` : e(rota.titulo)}</h1>
    ${noInicio ? `<p class="mp-lede">${e(mensagemDeBoasVindas(dados))}</p>` : ""}
    ${avisoDeDadosDeExemplo(estado)}
    <nav class="mp-nav" aria-label="Seções do Meu Potala">
      <ul>${abas}</ul>
      ${renderizarLinkDeAvisos({ rota, dados })}
    </nav>
    <p class="mp-sr">Conta de ${e(nome)}</p>
  </header>`;
}

export function renderizarVisitante(estado = {}) {
  /* Quem acabou de criar a conta ainda não entrou: a tela diz o que falta, e não oferece cadastro de novo. */
  if (estado.status === "aguardando-confirmacao") {
    return `<div class="mp-visitante">
      <p class="mp-kicker">Meu Potala</p>
      <h1 class="mp-titulo" id="mp-vista-titulo" data-vista-titulo tabindex="-1">Confirme seu e-mail</h1>
      <p class="mp-lede">Enviamos um link para <strong>${e(estado.emailPendente || "o seu e-mail")}</strong>. Ao abri-lo, seu espaço estará aqui.</p>
      <div class="mp-acoes">
        <button type="button" class="mp-botao mp-botao-secundario" data-conta-abrir="entrar">Já confirmei — entrar</button>
      </div>
    </div>`;
  }
  return `<div class="mp-visitante">
    <p class="mp-kicker">Meu Potala</p>
    <h1 class="mp-titulo" id="mp-vista-titulo" data-vista-titulo tabindex="-1">Seu espaço no Potala</h1>
    <p class="mp-lede">Guarde aquilo que encontra pelo caminho e continue sua jornada quando quiser.</p>
    <div class="mp-acoes">
      <button type="button" class="mp-botao" data-conta-abrir="entrar">Entrar</button>
      <button type="button" class="mp-botao mp-botao-secundario" data-conta-abrir="criar">Criar uma conta</button>
    </div>
    <div class="mp-visita">
      <a class="mp-visita-botao" href="${caminhoDa("inicio")}?demo=visita" data-recarregar>Ver a página sem conta <span aria-hidden="true">→</span></a>
      <p class="mp-nota">Com dados de exemplo, só neste navegador: sem cadastro e sem entrar.</p>
    </div>
    <a class="mp-link" href="/transcendido.html">Voltar à travessia <span aria-hidden="true">↗</span></a>
  </div>`;
}

export function renderizarCarregando() {
  return "<p class=\"mp-carregando\" aria-busy=\"true\">Abrindo seu espaço…</p>";
}

export function renderizarNaoEncontrada() {
  return `<div class="mp-visitante">
    <p class="mp-kicker">Meu Potala</p>
    <h1 class="mp-titulo" id="mp-vista-titulo" data-vista-titulo tabindex="-1">Este caminho não existe no seu espaço.</h1>
    <a class="mp-botao" href="${caminhoDa("inicio")}">Ir para o Meu Potala</a>
  </div>`;
}
