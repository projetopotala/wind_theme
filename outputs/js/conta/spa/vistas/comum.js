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
import { ROTAS, ROTAS_DA_BIBLIOTECA, ROTAS_DA_CONTA, ROTAS_PRINCIPAIS, caminhoDa } from "../roteador.js";

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

/*
 * Estado vazio: diz o que vai aparecer ali e oferece o próximo passo, sem culpa.
 * `titulo` é opcional; o link vira botão, para ser o caminho mais visível.
 */
export function vazio({ texto, titulo = "", link = null }) {
  const saida = link
    ? `<a class="mp-botao mp-botao-secundario mp-botao-pequeno" href="${e(link.href)}">${e(link.texto)}</a>`
    : "";
  return `<div class="mp-vazio"><span class="mp-vazio-icone" aria-hidden="true"></span><div class="mp-vazio-texto">${titulo ? `<p class="mp-vazio-titulo">${e(titulo)}</p>` : ""}<p>${e(texto)}</p>${saida}</div></div>`;
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

/* O selo ao lado de "Meu Potala": dado de exemplo é dito antes de qualquer outra coisa. */
function seloDeDados(estado) {
  if (estado.demonstracao) return " <span class=\"mp-selo-demo\">Demonstração</span>";
  if (estado.dadosEmReserva) return " <span class=\"mp-selo-demo\">Dados de exemplo</span>";
  return "";
}

/*
 * Quem o banco reconhece como profissional (vínculo ativo, consultas atribuídas)
 * ou professor (turmas ministradas). Vive aqui porque o menu, o Início e a tela
 * de atendimentos precisam da mesma resposta.
 */
export function papelProfissional({ agendaProfissional = [], perfisProfissionais = [], aulasDoProfessor = [] } = {}) {
  return (Array.isArray(agendaProfissional) && agendaProfissional.length > 0)
    || (Array.isArray(perfisProfissionais) && perfisProfissionais.length > 0)
    || (Array.isArray(aulasDoProfessor) && aulasDoProfessor.length > 0);
}

/* `data-icone` vem antes do href: o desenho do ícone é do CSS, o HTML só diz qual. */
function itemDaRota(nomeDaRota, rota) {
  const definicao = ROTAS.find((candidata) => candidata.nome === nomeDaRota);
  const corrente = nomeDaRota === rota.nome ? " aria-current=\"page\"" : "";
  return `<li><a data-icone="${nomeDaRota}" href="${caminhoDa(nomeDaRota)}"${corrente}>${e(definicao.rotulo)}</a></li>`;
}

/* Atalhos do trabalho, só para quem tem vínculo: levam ao trecho profissional da tela. */
function itensProfissionais(dados = {}) {
  const itens = [];
  const atende = (Array.isArray(dados.perfisProfissionais) && dados.perfisProfissionais.length)
    || (Array.isArray(dados.agendaProfissional) && dados.agendaProfissional.length);
  if (atende) itens.push(`<li><a data-icone="trabalho" href="${caminhoDa("atendimentos")}#mp-agenda-profissional">Consultas que atendo</a></li>`);
  if ((Array.isArray(dados.aulasDoProfessor) ? dados.aulasDoProfessor : []).some((aula) => aula?.id)) {
    itens.push(`<li><a data-icone="turmas" href="${caminhoDa("cursos")}#mp-aulas-do-professor">Turmas que ministro</a></li>`);
  }
  return itens.join("");
}

function identidadeDoMenu(estado, dados) {
  const nome = nomeDeExibicao(estado.usuario, estado.perfil);
  const papel = papelProfissional(dados) ? "Conta pessoal e profissional" : "Conta pessoal";
  const aviso = estado.demonstracao ? "Demonstração" : estado.dadosEmReserva ? "Dados de exemplo" : papel;
  return `<div class="mp-nav-identidade">
    <span class="mp-nav-avatar" aria-hidden="true">${e(iniciaisDe(nome, estado.usuario?.email))}</span>
    <span class="mp-nav-nome"><strong>${e(nome)}</strong><small>${e(aviso)}</small></span>
  </div>`;
}

/*
 * O MENU DO MEU POTALA.
 *
 * Uma só <nav>, que o CSS apresenta de dois jeitos: menu lateral fixo no
 * desktop; no celular, uma barra de quatro abas na parte de baixo, com "Mais"
 * abrindo o resto. Os links são sempre os mesmos — nenhum deixa de existir.
 * A primeira <ul> é a das abas principais (a SPA mantém a aba aberta à vista).
 */
export function renderizarMenu({ estado, rota, dados }) {
  const principais = ROTAS_PRINCIPAIS.map((nomeDaRota) => itemDaRota(nomeDaRota, rota)).join("");
  const biblioteca = ROTAS_DA_BIBLIOTECA.map((nomeDaRota) => itemDaRota(nomeDaRota, rota)).join("");
  const itensConta = ROTAS_DA_CONTA.map((nomeDaRota) => (nomeDaRota === "notificacoes"
    ? `<li>${renderizarLinkDeAvisos({ rota, dados })}</li>`
    : itemDaRota(nomeDaRota, rota))).join("");
  const trabalho = itensProfissionais(dados);
  const emMais = [...ROTAS_DA_BIBLIOTECA, ...ROTAS_DA_CONTA].includes(rota.nome);
  const novos = contarAvisosNovos(dados);

  return `<nav class="mp-nav" aria-label="Seções do Meu Potala">
    ${identidadeDoMenu(estado, dados)}
    <ul class="mp-nav-principal">${principais}</ul>
    <button type="button" class="mp-nav-mais" data-acao="menu-mais" data-icone="mais" aria-expanded="false" aria-controls="mp-nav-extra"${emMais ? " data-ativo=\"true\"" : ""}>Mais${novos ? `<span class="mp-contador">${novos}<span class="mp-sr"> ${novos === 1 ? "aviso novo" : "avisos novos"}</span></span>` : ""}</button>
    <div class="mp-nav-extra" id="mp-nav-extra">
      ${trabalho ? `<p class="mp-nav-rotulo" aria-hidden="true">Área profissional</p><ul class="mp-nav-profissional" aria-label="Área profissional">${trabalho}</ul>` : ""}
      <p class="mp-nav-rotulo" aria-hidden="true">Biblioteca</p>
      <ul class="mp-nav-biblioteca" aria-label="Biblioteca: o que você guardou e acompanha">${biblioteca}</ul>
      <p class="mp-nav-rotulo" aria-hidden="true">Minha conta</p>
      <ul class="mp-nav-conta" aria-label="Minha conta">${itensConta}</ul>
    </div>
  </nav>`;
}

export function renderizarCabecalho({ estado, rota, dados }) {
  const nome = nomeDeExibicao(estado.usuario, estado.perfil);
  const noInicio = rota.nome === "inicio";

  return `${renderizarMenu({ estado, rota, dados })}<header class="mp-cabecalho">
    <p class="mp-kicker">Meu Potala${seloDeDados(estado)}</p>
    <h1 class="mp-titulo" id="mp-vista-titulo" data-vista-titulo tabindex="-1">${noInicio ? `Olá, ${e(primeiroNome(estado.usuario, estado.perfil))}.` : e(rota.titulo)}</h1>
    ${noInicio ? `<p class="mp-lede">${e(mensagemDeBoasVindas(dados))}</p>` : ""}
    ${avisoDeDadosDeExemplo(estado)}
    <p class="mp-sr">Conta de ${e(nome)}</p>
  </header>`;
}

export function renderizarVisitante(estado = {}, rota = "") {
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
    <h1 class="mp-titulo" id="mp-vista-titulo" data-vista-titulo tabindex="-1">${rota === "atendimentos" ? "Agendar um atendimento" : "Seu espaço no Potala"}</h1>
    <p class="mp-lede">${rota === "atendimentos"
      ? "Para escolher profissional e horário, entre na sua conta ou crie uma. Depois de entrar, você continua aqui mesmo. O pedido só vira consulta quando o Instituto confirma."
      : "Guarde aquilo que encontra pelo caminho e continue sua jornada quando quiser."}</p>
    <div class="mp-acoes">
      <button type="button" class="mp-botao" data-conta-abrir="entrar">Entrar</button>
      <button type="button" class="mp-botao mp-botao-secundario" data-conta-abrir="criar">Criar uma conta</button>
    </div>
    <div class="mp-visita">
      <a class="mp-visita-botao" href="${caminhoDa("inicio")}?demo=visita" data-recarregar>Ver a página sem conta <span aria-hidden="true">→</span></a>
      <p class="mp-nota">Com dados de exemplo, só neste navegador: sem cadastro e sem entrar.</p>
    </div>
    <a class="mp-link" href="/travessia.html">Voltar à travessia <span aria-hidden="true">↗</span></a>
  </div>`;
}

/* Um esboço do que vem, no lugar de uma frase solta: a página não pula quando os dados chegam. */
export function renderizarCarregando() {
  return `<div class="mp-carregando" role="status" aria-busy="true">
    <p class="mp-kicker">Meu Potala</p>
    <p class="mp-carregando-texto">Abrindo seu espaço…</p>
    <div class="mp-esboco" aria-hidden="true"><span class="mp-esboco-titulo"></span><span class="mp-esboco-faixa"></span><span class="mp-esboco-cartao"></span><span class="mp-esboco-cartao"></span></div>
  </div>`;
}

export function renderizarNaoEncontrada() {
  return `<div class="mp-visitante">
    <p class="mp-kicker">Meu Potala</p>
    <h1 class="mp-titulo" id="mp-vista-titulo" data-vista-titulo tabindex="-1">Este caminho não existe no seu espaço.</h1>
    <a class="mp-botao" href="${caminhoDa("inicio")}">Ir para o Meu Potala</a>
  </div>`;
}
