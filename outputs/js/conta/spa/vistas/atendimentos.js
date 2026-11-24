import { STATUS_DE_ATENDIMENTO } from "../../modelos.js";
import { e, papelProfissional, secao, vazio } from "./comum.js";
import { aulasDoProfessor as secaoAulasDoProfessor } from "./aulas-do-professor.js";
import { caminhoDaSala } from "../../../sala/estado-sala.js";

/*
 * O link existe só para consulta online confirmada e futura. Ele não prova
 * acesso: a página da sala pergunta ao banco quem é a pessoa e se a janela abriu.
 */
export function ligacaoDaSala(pedido, tipo, agora = new Date()) {
  if (tipo !== "confirmada" || pedido?.modalidade !== "online" || !pedido.id) return "";
  const inicio = new Date(pedido.inicio || "");
  const referencia = agora instanceof Date ? agora : new Date(agora);
  /* Espelho da janela do banco, só para a tela: antes de abrir diz quando abre; o acesso real é decidido na sala. */
  if (Number.isFinite(inicio.valueOf()) && referencia.valueOf() < inicio.valueOf() - 15 * 60 * 1000) {
    const abre = new Date(inicio.valueOf() - 15 * 60 * 1000);
    return `<p class="mp-atendimento-sala"><span class="mp-nota">A sala abre ${e(quandoAbre(abre, referencia))}, 15 minutos antes do horário. Atualize a página nesse horário.</span></p>`;
  }
  try {
    return `<p class="mp-atendimento-sala"><a class="mp-botao" href="${e(caminhoDaSala(pedido.id))}">Entrar na sala</a> <span class="mp-nota">A sala abre 15 minutos antes do horário.</span></p>`;
  } catch { return ""; }
}

const diaSP = (data) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(data);
function quandoAbre(abre, agora) {
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(abre);
  const dias = Math.round((Date.parse(`${diaSP(abre)}T00:00:00Z`) - Date.parse(`${diaSP(agora)}T00:00:00Z`)) / 86400000);
  if (dias === 0) return `hoje às ${hora}`;
  if (dias === 1) return `amanhã às ${hora}`;
  return `em ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(abre)} às ${hora}`;
}

const TOLERANCIA_DA_SALA_MS = 30 * 60 * 1000;
const PERIODOS = Object.freeze({ manha: "Manhã", tarde: "Tarde", noite: "Noite" });
const MODALIDADES = Object.freeze({ presencial: "Presencial", online: "Online" });

function dataLegivel(valor) {
  const data = /^\d{4}-\d{2}-\d{2}$/.test(valor || "") ? new Date(`${valor}T12:00:00`) : null;
  return data && !Number.isNaN(data.valueOf())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(data)
    : "Data a combinar";
}

function horarioLegivel(valor) {
  const data = valor ? new Date(valor) : null;
  return data && !Number.isNaN(data.valueOf())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(data)
    : "Horário a confirmar";
}

function listaDePedidos(atendimentos, vazioTexto = "Você ainda não fez uma solicitação de atendimento.", tipo = "pedido", agora = new Date()) {
  if (!atendimentos.length) return vazio({ texto: vazioTexto });
  return `<ol class="mp-atendimentos-lista">${atendimentos.map((pedido) => `<li class="mp-atendimento">
    <div>
      <p class="mp-status" data-status="${e(pedido.status)}">${e(tipo === "confirmada" ? "Confirmada" : STATUS_DE_ATENDIMENTO[pedido.status])}</p>
      <h3>${e(pedido.servico)}</h3>
      <p class="mp-cartao-detalhe">${e(MODALIDADES[pedido.modalidade])} · ${e(pedido.inicio ? horarioLegivel(pedido.inicio) : `${dataLegivel(pedido.dataPreferida)} · ${PERIODOS[pedido.periodoPreferido]}`)}</p>
    </div>
    ${ligacaoDaSala(pedido, tipo, agora)}
    <p class="mp-atendimento-nota">${tipo === "confirmada"
      ? "Consulta confirmada. Os detalhes também estão disponíveis na sua Agenda."
      : tipo === "anterior"
        ? "O horário confirmado já passou. Este registro não informa, sozinho, se o atendimento foi realizado."
        : pedido.status === "recebida"
      ? "A equipe recebeu seu pedido. Ele ainda não é uma consulta confirmada."
      : pedido.status === "em_contato"
        ? "A equipe está combinando os detalhes com você."
        : pedido.status === "encerrada"
          ? "Este pedido foi encerrado. Consulte sua Agenda para compromissos confirmados."
          : "Este pedido foi cancelado."}</p>
  </li>`).join("")}</ol>`;
}

/*
 * Agenda de quem atende. O estado vem do banco (appointment_room_context); o link
 * da sala só aparece com a janela aberta — fora dela a tela diz quando abre. Mesmo
 * com o link, quem decide o acesso é a sala, que pergunta de novo ao banco.
 */
const ESTADOS_DA_CONSULTA = Object.freeze({
  open: "Sala aberta",
  too_early: "Confirmada",
  expired: "Horário encerrado",
  closed: "Sala encerrada",
  cancelled: "Cancelada",
  not_confirmed: "Aguardando confirmação",
});

function horaLegivel(valor) {
  const data = valor ? new Date(valor) : null;
  return data && !Number.isNaN(data.valueOf())
    ? new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(data)
    : "";
}

export function acessoDaConsultaProfissional(consulta) {
  if (consulta?.estado === "open" && consulta.modalidade === "online" && consulta.id) {
    try {
      return `<p class="mp-atendimento-sala"><a class="mp-botao" href="${e(caminhoDaSala(consulta.id))}">Entrar na sala</a> <span class="mp-nota">A sala fica aberta até ${e(horaLegivel(consulta.fecha))}.</span></p>`;
    } catch { return ""; }
  }
  if (consulta?.estado === "too_early" && consulta.modalidade === "online") {
    return `<p class="mp-nota">A sala abre às ${e(horaLegivel(consulta.abre))}, 15 minutos antes do horário.</p>`;
  }
  return "";
}

const PROXIMAS = new Set(["open", "too_early"]);

function agendaDeQuemAtende(consultas) {
  const porInicio = (a, b) => String(a.inicio || "").localeCompare(String(b.inicio || ""));
  const proximas = consultas.filter((item) => PROXIMAS.has(item.estado)).sort(porInicio);
  const anteriores = consultas.filter((item) => !PROXIMAS.has(item.estado)).sort((a, b) => porInicio(b, a)).slice(0, 10);
  const lista = (itens, vazioTexto) => (!itens.length ? vazio({ texto: vazioTexto }) : `<ol class="mp-atendimentos-lista">${itens.map((consulta) => `<li class="mp-atendimento" data-consulta-profissional="${e(consulta.id)}">
    <div>
      <p class="mp-status" data-status="${e(consulta.estado)}">${e(ESTADOS_DA_CONSULTA[consulta.estado] || "Consulta")}</p>
      <h3>${e(consulta.servico)}</h3>
      <p class="mp-cartao-detalhe">${e(MODALIDADES[consulta.modalidade] || "")} · ${e(horarioLegivel(consulta.inicio))}${consulta.cliente ? ` · ${e(consulta.cliente)}` : ""}</p>
    </div>
    ${acessoDaConsultaProfissional(consulta)}
  </li>`).join("")}</ol>`);
  return `${secao({
    id: "mp-agenda-profissional", classe: "mp-secao-profissional", kicker: "Como profissional", titulo: "Sua agenda de atendimentos",
    corpo: lista(proximas, "Nenhuma consulta futura atribuída a você."),
  })}${anteriores.length ? secao({
    id: "mp-agenda-profissional-anteriores", classe: "mp-secao-discreta mp-secao-profissional", kicker: "Histórico", titulo: "Consultas anteriores",
    corpo: lista(anteriores, ""),
  }) : ""}`;
}

/*
 * O catálogo público manda o serviço escolhido em `?atendimento=<offering_id>`.
 * Aqui isso só pré-seleciona o horário mais próximo daquele serviço: a lista
 * continua inteira, para que ninguém fique preso a uma escolha feita antes, e
 * o envio segue pelo mesmo caminho de sempre. Nenhuma regra é duplicada.
 */
export function escolhaDoEndereco(parametros) {
  const pedido = parametros?.get?.("atendimento");
  return typeof pedido === "string" && pedido.trim() ? pedido.trim() : null;
}

export function horarioSugerido(horarios, ofertaEscolhida) {
  if (!ofertaEscolhida) return null;
  const candidatos = horarios.filter((item) => item.offering_id === ofertaEscolhida);
  if (!candidatos.length) return null;
  return candidatos.reduce((cedo, item) => (
    String(item.starts_at) < String(cedo.starts_at) ? item : cedo
  ));
}

function formularioHorario(opcoes, horarios, ofertaEscolhida = null) {
  const ofertas = new Map(opcoes.map((item) => [item.id, item]));
  const disponiveis = horarios.filter((item) => ofertas.has(item.offering_id));
  if (!disponiveis.length) return "";
  const sugerido = horarioSugerido(disponiveis, ofertaEscolhida);
  const escolhida = ofertaEscolhida ? ofertas.get(ofertaEscolhida) : null;
  const aviso = !escolhida ? ""
    : sugerido
      ? `<p class="mp-nota" data-atendimento-escolhido="${e(ofertaEscolhida)}">Você veio de <strong>${e(escolhida.service)}</strong>, com ${e(escolhida.professional)}. Deixamos o horário mais próximo selecionado — você pode trocar por outro da lista.</p>`
      : `<p class="mp-aviso" role="status" data-atendimento-escolhido="${e(ofertaEscolhida)}">Não há horário aberto para <strong>${e(escolhida.service)}</strong> agora. Escolha outro horário da lista ou volte mais tarde.</p>`;
  return `<form class="mp-form mp-atendimento-form" data-form="atendimento" novalidate>
    ${aviso}
    <label>Serviço e horário
      <select name="horarioId" required>
        <option value=""${sugerido ? "" : " selected"}>Escolha um horário disponível</option>
        ${disponiveis.map((item) => { const oferta = ofertas.get(item.offering_id); return `<option value="${e(item.id)}"${sugerido && item.id === sugerido.id ? " selected" : ""}>${e(oferta.service)} · ${e(oferta.professional)} · ${e(horarioLegivel(item.starts_at))}</option>`; }).join("")}
      </select>
    </label>
    <p class="mp-nota">O horário fica reservado para análise. A consulta só entra na Agenda depois da confirmação da equipe.</p>
    <p class="mp-form-status" data-form-status role="alert"></p>
    <button class="mp-botao" type="submit">Solicitar atendimento</button>
  </form>`;
}

/*
 * Pedido sem horario: o cliente escolhe o servico publicado e diz uma preferencia de dia e periodo.
 * Usa submit_authenticated_appointment_request (identidade da sessao, RLS e limite no banco).
 * Nao reserva nada: a equipe escolhe profissional e horario e so entao a consulta e confirmada.
 */
export function hojeISO(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/* Fim de cada período (hora cheia, America/Sao_Paulo): hoje só vale o período que ainda não terminou. */
const FIM_DO_PERIODO = Object.freeze({ manha: 12, tarde: 18, noite: 24 });
export function periodoEncerrado(dia, periodo, agora = new Date()) {
  if (dia !== hojeISO(agora) || !FIM_DO_PERIODO[periodo]) return false;
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(agora));
  const minutos = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", minute: "2-digit" }).format(agora));
  return hora + minutos / 60 >= FIM_DO_PERIODO[periodo];
}

export function amanhaISO(agora = new Date()) {
  const d = new Date(agora.valueOf() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

function formularioSemHorario(opcoes, temHorarios, ofertaEscolhida, agora) {
  if (!opcoes.length) return `<p class="mp-aviso" role="status">Ainda não há serviços de atendimento publicados pelo Instituto.</p>`;
  const minimo = hojeISO(agora);
  const livres = Object.keys(PERIODOS).filter((periodo) => !periodoEncerrado(minimo, periodo, agora));
  const diaInicial = livres.length ? minimo : amanhaISO(agora);
  const titulo = temHorarios ? "Prefere outro dia? Peça sem escolher horário" : "Peça seu atendimento";
  const nota = temHorarios
    ? "Se nenhum horário acima servir, diga sua preferência. A equipe responde com profissional e horário."
    : "Não há horários abertos agora, mas você pode pedir mesmo assim. A equipe responde com profissional e horário.";
  return `<form class="mp-form mp-atendimento-form" data-form="atendimento-sem-horario" novalidate>
    <p class="mp-kicker">${e(titulo)}</p>
    <p class="mp-nota">${e(nota)}</p>
    <label>Serviço
      <select name="ofertaId" required>
        <option value="">Escolha o serviço</option>
        ${opcoes.map((item) => `<option value="${e(item.id)}" data-modalidade="${item.modality === "online" ? "online" : "presencial"}"${item.id === ofertaEscolhida ? " selected" : ""}>${e(item.service)} · ${item.modality === "online" ? "Online" : "Presencial"}</option>`).join("")}
      </select>
    </label>
    <label>Dia de preferência
      <input type="date" name="dataPreferida" min="${e(minimo)}" value="${e(diaInicial)}" required>
    </label>
    <label>Período de preferência
      <select name="periodoPreferido" required>
        ${Object.entries(PERIODOS).map(([valor, nome]) => `<option value="${valor}"${diaInicial === minimo && periodoEncerrado(minimo, valor, agora) ? " disabled" : ""}>${nome}</option>`).join("")}
      </select>
    </label>
    <p class="mp-nota">Isto é uma solicitação, não uma consulta marcada. Ela aparece abaixo em "Aguardando confirmação".</p>
    <p class="mp-form-status" data-form-status role="alert"></p>
    <button class="mp-botao" type="submit">Solicitar atendimento</button>
  </form>`;
}

function formulario(opcoes, horarios, ofertaEscolhida = null, agora = new Date()) {
  const comHorario = formularioHorario(opcoes, horarios, ofertaEscolhida);
  return `${comHorario}${formularioSemHorario(opcoes, Boolean(comHorario), ofertaEscolhida, agora)}`;
}

export { papelProfissional };

export function mostraInterfaceDeCliente(contexto = {}) {
  return !papelProfissional(contexto) || (Array.isArray(contexto.atendimentos) && contexto.atendimentos.length > 0);
}

/* Mesma regra de "confirmada e ainda não terminou" usada na lista: fim + 30 min quando online. */
export function consultaAindaVale(pedido, agora = new Date()) {
  const referencia = agora instanceof Date ? agora : new Date(agora);
  const fim = new Date(pedido?.fim || pedido?.inicio || "");
  if (!Number.isFinite(fim.valueOf())) return false;
  const limite = fim.valueOf() + (pedido.modalidade === "online" ? TOLERANCIA_DA_SALA_MS : 0);
  return limite > referencia.valueOf();
}

export function separarAtendimentos(atendimentos = [], agora = new Date()) {
  const lista = Array.isArray(atendimentos) ? atendimentos : [];
  const futura = (pedido) => consultaAindaVale(pedido, agora);
  return {
    pendentes: lista.filter((pedido) => ["recebida", "em_contato"].includes(pedido.status)),
    confirmados: lista.filter((pedido) => pedido.status === "encerrada" && pedido.reservaId && futura(pedido))
      .sort((a, b) => String(a.inicio || "").localeCompare(String(b.inicio || ""))),
    anteriores: lista.filter((pedido) => pedido.status === "encerrada" && (!pedido.reservaId || !futura(pedido))),
    cancelados: lista.filter((pedido) => pedido.status === "cancelada"),
  };
}

const vista = {
  renderizar({ atendimentos = [], opcoesAtendimento = [], horariosAtendimento = [], agendaProfissional = [], perfisProfissionais = [], aulasDoProfessor = [], atendimentoDisponivel = false, parametros = null, agora = new Date() }) {
    /*
     * Profissional é quem o banco reconhece: vínculo ativo com perfil profissional
     * ativo (perfisProfissionais) ou consultas atribuídas. Com zero consultas a
     * agenda aparece vazia. A parte de cliente só aparece se houver pedidos próprios.
     */
    const consultasProfissionais = Array.isArray(agendaProfissional) ? agendaProfissional : [];
    const aulasMinistradas = Array.isArray(aulasDoProfessor) ? aulasDoProfessor : [];
    if (papelProfissional({ agendaProfissional, perfisProfissionais, aulasDoProfessor })) {
      const agendaPropria = `${secaoAulasDoProfessor(aulasMinistradas, agora)}${agendaDeQuemAtende(consultasProfissionais)}`;
      if (!atendimentos.length) return agendaPropria;
      /* Os dois papéis, separados por um marco visível: o trabalho em cima, o que é seu embaixo. */
      const marco = "<p class=\"mp-papel\"><span>Como cliente</span> Os atendimentos que você pediu para você</p>";
      return `${agendaPropria}${marco}${vista.renderizar({ atendimentos, opcoesAtendimento, horariosAtendimento, atendimentoDisponivel, parametros, agora })}`;
    }
    const referencia = agora instanceof Date ? agora : new Date(agora);
    const { pendentes, confirmados, anteriores, cancelados } = separarAtendimentos(atendimentos, referencia);
    const resumo = `<nav class="mp-atendimentos-resumo" aria-label="Resumo dos atendimentos">
      <a href="#mp-atendimentos-pendentes"><strong>${pendentes.length}</strong><span>Aguardando a equipe</span></a>
      <a href="#mp-atendimentos-confirmados"><strong>${confirmados.length}</strong><span>Confirmados</span></a>
      <a href="#mp-atendimentos-historico"><strong>${anteriores.length}</strong><span>Horários anteriores</span></a>
      <a href="#mp-atendimentos-cancelados"><strong>${cancelados.length}</strong><span>Cancelados</span></a>
    </nav>`;
    /* O que está vivo (confirmado, aguardando) fica à vista; o que passou, recolhido. */
    const confirmadas = secao({
      id: "mp-atendimentos-confirmados", classe: "mp-secao-destaque", kicker: "Próximos atendimentos", titulo: "Consultas confirmadas",
      corpo: listaDePedidos(confirmados, "Quando uma consulta futura for confirmada, ela aparecerá aqui e na sua Agenda.", "confirmada", referencia),
    });
    const aguardando = secao({
      id: "mp-atendimentos-pendentes", kicker: "Em análise pela equipe", titulo: "Aguardando confirmação",
      corpo: listaDePedidos(pendentes, "Nenhuma solicitação aguarda retorno da equipe."),
    });
    const passados = anteriores.length + cancelados.length;
    const historico = `<details class="mp-recolhido"${passados ? "" : " data-vazio"}>
      <summary>Histórico e cancelamentos <span class="mp-recolhido-total">${passados}</span></summary>
      ${secao({
    id: "mp-atendimentos-historico", classe: "mp-secao-discreta", kicker: "Histórico", titulo: "Horários confirmados anteriores",
    corpo: listaDePedidos(anteriores, "Nenhum horário confirmado anterior.", "anterior"),
  })}${secao({
    id: "mp-atendimentos-cancelados", classe: "mp-secao-discreta", kicker: "Cancelamentos", titulo: "Solicitações canceladas",
    corpo: listaDePedidos(cancelados, "Nenhuma solicitação cancelada."),
  })}
    </details>`;
    const temAlgoVivo = confirmados.length + pendentes.length > 0;
    const vivos = confirmados.length ? `${confirmadas}${aguardando}` : `${aguardando}${confirmadas}`;
    if (!atendimentoDisponivel) {
      return `${resumo}<p class="mp-aviso" role="status">Novas solicitações continuam desativadas enquanto o fluxo completo é preparado.</p>${vivos}${historico}`;
    }
    const corpo = formulario(opcoesAtendimento, horariosAtendimento, escolhaDoEndereco(parametros), referencia);
    const novo = secao({ id: "mp-atendimentos-novo", classe: "mp-atendimentos-acao", kicker: temAlgoVivo ? "Outro atendimento" : "Começar aqui", titulo: "Solicitar um atendimento", corpo });
    /* Quem já tem consulta ou pedido vê isso primeiro; o atalho leva direto ao formulário. */
    const atalho = temAlgoVivo
      ? "<p class=\"mp-atalho\"><a class=\"mp-botao\" href=\"#mp-atendimentos-novo\">Solicitar outro atendimento</a></p>"
      : "";
    return temAlgoVivo
      ? `${resumo}${atalho}${vivos}${novo}${historico}`
      : `${resumo}${novo}${vivos}${historico}`;
  },
};

export default vista;
