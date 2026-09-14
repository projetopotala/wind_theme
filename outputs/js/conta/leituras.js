/*
 * O QUE A ÁREA PESSOAL MOSTRA, CALCULADO A PARTIR DO QUE A PESSOA GUARDOU.
 *
 * O banco guarda fatos soltos: uma visita, um salvo, uma inscrição. "Continue de
 * onde parou", "Hoje / Ontem / Esta semana" e "Para você"
 * não são tabelas — são leituras desses fatos. Ficam aqui, puras e sem tela,
 * para que a mesma regra valha no Meu Potala, no painel da conta e nos testes.
 */

import { FILTROS_DE_SALVOS, TIPOS_DE_NOTIFICACAO, semAcento } from "./modelos.js";

const DIA = 86_400_000;

function inicioDoDia(valor) {
  const data = new Date(valor);
  data.setHours(0, 0, 0, 0);
  return data;
}

const instante = (valor) => (valor ? new Date(valor).getTime() : 0);

const chaveDoDia = (data) => [
  data.getFullYear(),
  String(data.getMonth() + 1).padStart(2, "0"),
  String(data.getDate()).padStart(2, "0"),
].join("-");

/* ------------------------------------------------------------------
 * Histórico
 * ------------------------------------------------------------------ */

/*
 * Hoje, Ontem, Esta semana, Antes — pelo DIA do calendário, e não por 24 horas.
 *
 * Uma visita às 23h de ontem, vista às 8h de hoje, aconteceu há nove horas. Por
 * horas corridas ela seria "hoje", e a pessoa, lembrando que leu à noite, acharia
 * o histórico errado.
 */
export function agruparHistorico(itens = [], agora = new Date()) {
  const hoje = inicioDoDia(agora).getTime();
  const ontem = hoje - DIA;
  const semana = hoje - 6 * DIA;
  const grupos = [
    { id: "hoje", rotulo: "Hoje", itens: [] },
    { id: "ontem", rotulo: "Ontem", itens: [] },
    { id: "semana", rotulo: "Esta semana", itens: [] },
    { id: "antes", rotulo: "Antes", itens: [] },
  ];

  for (const item of [...itens].sort((a, b) => instante(b.visitadoEm) - instante(a.visitadoEm))) {
    const momento = instante(item.visitadoEm);
    const grupo = momento >= hoje ? grupos[0] : momento >= ontem ? grupos[1] : momento >= semana ? grupos[2] : grupos[3];
    grupo.itens.push(item);
  }
  return grupos.filter((grupo) => grupo.itens.length);
}

/* ------------------------------------------------------------------
 * Salvos
 * ------------------------------------------------------------------ */

export function filtrarSalvos(itens = [], filtroId = "tudo") {
  const filtro = FILTROS_DE_SALVOS.find((opcao) => opcao.id === filtroId);
  const tipos = filtro?.tipos ? new Set(filtro.tipos) : null;
  return itens
    .filter((item) => !tipos || tipos.has(item.tipo))
    .sort((a, b) => instante(b.salvoEm) - instante(a.salvoEm));
}

export function contarSalvosPorFiltro(itens = []) {
  return Object.fromEntries(FILTROS_DE_SALVOS.map((filtro) => [filtro.id, filtrarSalvos(itens, filtro.id).length]));
}

/* ------------------------------------------------------------------
 * Progresso e "continue de onde parou"
 * ------------------------------------------------------------------ */

export function fracaoDoProgresso(progresso) {
  if (!progresso?.total) return 0;
  return Math.min(1, progresso.concluidas / progresso.total);
}

export function textoDoProgresso(progresso) {
  if (!progresso?.total) return null;
  const aulas = progresso.total === 1 ? "aula concluída" : "aulas concluídas";
  return `${progresso.concluidas} de ${progresso.total} ${aulas}`;
}

/*
 * O que a pessoa começou e não terminou, do mais recente para o mais antigo.
 *
 * Só entra o que tem para onde voltar: um curso sem conteúdo online não tem
 * "continuar" — tem a próxima aula, e ela mora na agenda. Terminado também não
 * entra: um convite para continuar algo concluído é ruído.
 */
export function continuarDeOndeParou({ historico = [], inscricoes = [], progressos = [] } = {}, limite = 4) {
  const porInscricao = new Map(progressos.map((progresso) => [progresso.inscricaoId, progresso]));
  const candidatos = [];

  for (const inscricao of inscricoes) {
    if (!["em_andamento", "proximo_encontro", "inscrito"].includes(inscricao.status)) continue;
    const progresso = porInscricao.get(inscricao.id);
    if (!inscricao.conteudoHref || !progresso?.total || progresso.concluidas >= progresso.total) continue;
    candidatos.push({
      tipo: "curso",
      titulo: inscricao.curso,
      href: inscricao.conteudoHref,
      imagem: inscricao.imagem,
      progresso: fracaoDoProgresso(progresso),
      detalhe: textoDoProgresso(progresso),
      momento: progresso.ultimoAcesso || inscricao.inscritoEm,
    });
  }

  for (const visita of historico) {
    if (visita.progresso === null || visita.progresso <= 0 || visita.progresso >= 1) continue;
    candidatos.push({
      tipo: visita.tipo,
      titulo: visita.titulo,
      href: visita.href,
      imagem: null,
      progresso: visita.progresso,
      detalhe: `${Math.round(visita.progresso * 100)}% percorrido`,
      momento: visita.visitadoEm,
    });
  }

  const vistos = new Set();
  return candidatos
    .sort((a, b) => instante(b.momento) - instante(a.momento))
    .filter((item) => {
      if (vistos.has(item.href)) return false;
      vistos.add(item.href);
      return true;
    })
    .slice(0, limite);
}

/* ------------------------------------------------------------------
 * Agenda
 * ------------------------------------------------------------------ */

/*
 * O que ainda vai acontecer — incluindo o que está acontecendo agora.
 *
 * Um encontro das 19h às 21h, visto às 20h, não é passado: a pessoa pode estar
 * procurando o endereço da sala. Por isso o corte é pelo FIM, quando existe.
 */
export function proximosCompromissos(itens = [], agora = new Date(), limite = Infinity) {
  const agoraMs = instante(agora);
  return itens
    .filter((item) => instante(item.fim || item.inicio) >= agoraMs)
    .sort((a, b) => instante(a.inicio) - instante(b.inicio))
    .slice(0, limite);
}

function diaRelativo(data, agora) {
  const dias = Math.round((inicioDoDia(data) - inicioDoDia(agora)) / DIA);
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Amanhã";
  return null;
}

export function agruparAgenda(itens = [], agora = new Date()) {
  const grupos = new Map();
  for (const item of proximosCompromissos(itens, agora)) {
    const data = new Date(item.inicio);
    const chave = chaveDoDia(data);
    if (!grupos.has(chave)) {
      const rotulo = data.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
      grupos.set(chave, {
        chave,
        rotulo: rotulo.charAt(0).toLocaleUpperCase("pt-BR") + rotulo.slice(1),
        relativo: diaRelativo(data, agora),
        itens: [],
      });
    }
    grupos.get(chave).itens.push(item);
  }
  return [...grupos.values()];
}

function horaCurta(data) {
  const minutos = data.getMinutes();
  return minutos ? `${data.getHours()}h${String(minutos).padStart(2, "0")}` : `${data.getHours()}h`;
}

/* "hoje, 19h", "amanhã, 8h", "sex, 20 set · 10h" — a forma como se fala de um compromisso. */
export function quandoLegivel(valor, agora = new Date()) {
  const data = new Date(valor);
  if (!valor || Number.isNaN(data.getTime())) return "";
  const dias = Math.round((inicioDoDia(data) - inicioDoDia(agora)) / DIA);
  const hora = horaCurta(data);
  if (dias === 0) return `hoje, ${hora}`;
  if (dias === 1) return `amanhã, ${hora}`;
  if (dias === -1) return `ontem, ${hora}`;
  const dia = data.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
  return `${dia} · ${hora}`;
}

/* ------------------------------------------------------------------
 * Para você
 * ------------------------------------------------------------------ */

/*
 * RECOMENDAÇÕES POR AFINIDADE DE TEMAS, e nada além disso.
 *
 * O que a pessoa acompanha pesa mais que o que salvou, que pesa mais que o que
 * visitou: acompanhar é declarar interesse, salvar é querer voltar, visitar pode
 * ter sido acaso. O que ela já salvou ou visitou não é recomendado de novo.
 *
 * Sem sinal nenhum, a resposta é "descoberta" — alguns caminhos na ordem do
 * catálogo — e a tela diz isso, em vez de fingir que conhece a pessoa.
 */
export function recomendar({ catalogo = [], salvos = [], historico = [], acompanhados = [], limite = 3 } = {}) {
  const chave = (valor) => semAcento(valor).toLowerCase().trim();
  const idDe = (item) => `${item.tipo}:${item.ref}`;
  const pesos = new Map();
  const somar = (tema, peso) => {
    const normalizado = chave(tema);
    if (normalizado) pesos.set(normalizado, (pesos.get(normalizado) || 0) + peso);
  };
  const porId = new Map(catalogo.map((item) => [idDe(item), item]));

  for (const item of acompanhados) somar(item.rotulo, 3);
  for (const item of salvos) for (const tema of porId.get(idDe(item))?.temas || []) somar(tema, 2);
  for (const item of historico) for (const tema of porId.get(idDe(item))?.temas || []) somar(tema, 1);

  const conhecidos = new Set([...salvos, ...historico].map(idDe));
  const candidatos = catalogo.filter((item) => !conhecidos.has(idDe(item)));
  const descoberta = { motivo: "descoberta", itens: candidatos.slice(0, limite) };
  if (!pesos.size) return descoberta;

  const pontuados = candidatos
    .map((item, ordem) => ({
      item,
      ordem,
      pontos: (item.temas || []).reduce((soma, tema) => soma + (pesos.get(chave(tema)) || 0), 0),
    }))
    .filter((candidato) => candidato.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem);

  if (!pontuados.length) return descoberta;
  return { motivo: "afinidade", itens: pontuados.slice(0, limite).map((candidato) => candidato.item) };
}

/* ------------------------------------------------------------------
 * Avisos
 * ------------------------------------------------------------------ */

export function preferenciaAtiva(tipo, preferencias = []) {
  const escolhida = preferencias.find((preferencia) => preferencia.tipo === tipo);
  if (escolhida) return escolhida.ativa;
  return TIPOS_DE_NOTIFICACAO.find((opcao) => opcao.id === tipo)?.padrao ?? false;
}

/*
 * O filtro por preferência aqui é de EXIBIÇÃO.
 *
 * Quem deve deixar de CRIAR o aviso é o servidor, ao consultar as preferências
 * antes de gerar cada um. Este filtro existe para que desligar um tipo tenha
 * efeito imediato na tela, inclusive sobre avisos que já estavam na fila.
 */
export function notificacoesPermitidas(notificacoes = [], preferencias = []) {
  return notificacoes
    .filter((notificacao) => preferenciaAtiva(notificacao.tipo, preferencias))
    .sort((a, b) => instante(b.criadaEm) - instante(a.criadaEm));
}

export function naoLidas(notificacoes = []) {
  return notificacoes.filter((notificacao) => !notificacao.lidaEm).length;
}
