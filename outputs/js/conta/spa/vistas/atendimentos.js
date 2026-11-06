import { STATUS_DE_ATENDIMENTO } from "../../modelos.js";
import { e, secao, vazio } from "./comum.js";
import { caminhoDaSala } from "../../../sala/estado-sala.js";

/*
 * O link existe só para consulta online confirmada e futura. Ele não prova
 * acesso: a página da sala pergunta ao banco quem é a pessoa e se a janela abriu.
 */
export function ligacaoDaSala(pedido, tipo) {
  if (tipo !== "confirmada" || pedido?.modalidade !== "online" || !pedido.id) return "";
  try {
    return `<p class="mp-atendimento-sala"><a class="mp-botao" href="${e(caminhoDaSala(pedido.id))}">Entrar na sala</a> <span class="mp-nota">A sala abre 15 minutos antes do horário.</span></p>`;
  } catch { return ""; }
}

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

function listaDePedidos(atendimentos, vazioTexto = "Você ainda não fez uma solicitação de atendimento.", tipo = "pedido") {
  if (!atendimentos.length) return vazio({ texto: vazioTexto });
  return `<ol class="mp-atendimentos-lista">${atendimentos.map((pedido) => `<li class="mp-atendimento">
    <div>
      <p class="mp-status" data-status="${e(pedido.status)}">${e(tipo === "confirmada" ? "Confirmada" : STATUS_DE_ATENDIMENTO[pedido.status])}</p>
      <h3>${e(pedido.servico)}</h3>
      <p class="mp-cartao-detalhe">${e(MODALIDADES[pedido.modalidade])} · ${e(pedido.inicio ? horarioLegivel(pedido.inicio) : `${dataLegivel(pedido.dataPreferida)} · ${PERIODOS[pedido.periodoPreferido]}`)}</p>
    </div>
    ${ligacaoDaSala(pedido, tipo)}
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
    id: "mp-agenda-profissional", kicker: "Como profissional", titulo: "Sua agenda de atendimentos",
    corpo: lista(proximas, "Nenhuma consulta futura atribuída a você."),
  })}${anteriores.length ? secao({
    id: "mp-agenda-profissional-anteriores", classe: "mp-secao-discreta", kicker: "Histórico", titulo: "Consultas anteriores",
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

function formulario(opcoes, horarios, ofertaEscolhida = null) {
  const ofertas = new Map(opcoes.map((item) => [item.id, item]));
  const disponiveis = horarios.filter((item) => ofertas.has(item.offering_id));
  if (!disponiveis.length) return `<p class="mp-aviso" role="status">Nenhum horário de atendimento está disponível agora.</p>`;
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

const vista = {
  renderizar({ atendimentos = [], opcoesAtendimento = [], horariosAtendimento = [], agendaProfissional = [], atendimentoDisponivel = false, parametros = null, agora = new Date() }) {
    /*
     * Quem tem consultas atribuídas é reconhecido como profissional pelo próprio
     * banco. Nesse caso a página abre pela agenda de quem atende; a parte de
     * cliente só aparece se a pessoa também fez pedidos como cliente.
     */
    const consultasProfissionais = Array.isArray(agendaProfissional) ? agendaProfissional : [];
    if (consultasProfissionais.length) {
      const agendaPropria = agendaDeQuemAtende(consultasProfissionais);
      if (!atendimentos.length) return agendaPropria;
      return `${agendaPropria}${vista.renderizar({ atendimentos, opcoesAtendimento, horariosAtendimento, atendimentoDisponivel, parametros, agora })}`;
    }
    const referencia = agora instanceof Date ? agora : new Date(agora);
    const futura = (pedido) => {
      const inicio = pedido.inicio ? new Date(pedido.inicio) : null;
      return inicio && Number.isFinite(inicio.valueOf()) && inicio > referencia;
    };
    const pendentes = atendimentos.filter((pedido) => ["recebida", "em_contato"].includes(pedido.status));
    const confirmados = atendimentos.filter((pedido) => pedido.status === "encerrada" && pedido.reservaId && futura(pedido));
    const anteriores = atendimentos.filter((pedido) => pedido.status === "encerrada" && (!pedido.reservaId || !futura(pedido)));
    const cancelados = atendimentos.filter((pedido) => pedido.status === "cancelada");
    const resumo = `<nav class="mp-atendimentos-resumo" aria-label="Resumo dos atendimentos">
      <a href="#mp-atendimentos-pendentes"><strong>${pendentes.length}</strong><span>Aguardando a equipe</span></a>
      <a href="#mp-atendimentos-confirmados"><strong>${confirmados.length}</strong><span>Confirmados</span></a>
      <a href="#mp-atendimentos-historico"><strong>${anteriores.length}</strong><span>Horários anteriores</span></a>
      <a href="#mp-atendimentos-cancelados"><strong>${cancelados.length}</strong><span>Cancelados</span></a>
    </nav>`;
    const acompanhamento = `${secao({
      id: "mp-atendimentos-pendentes", kicker: "Aguardando ação", titulo: "Solicitações pendentes",
      corpo: listaDePedidos(pendentes, "Nenhuma solicitação aguarda retorno da equipe."),
    })}${secao({
      id: "mp-atendimentos-confirmados", kicker: "Próximos atendimentos", titulo: "Consultas confirmadas",
      corpo: listaDePedidos(confirmados, "Quando uma consulta futura for confirmada, ela aparecerá aqui e na sua Agenda.", "confirmada"),
    })}${secao({
      id: "mp-atendimentos-historico", classe: "mp-secao-discreta", kicker: "Histórico", titulo: "Horários confirmados anteriores",
      corpo: listaDePedidos(anteriores, "Nenhum horário confirmado anterior.", "anterior"),
    })}${secao({
      id: "mp-atendimentos-cancelados", classe: "mp-secao-discreta", kicker: "Cancelamentos", titulo: "Solicitações canceladas",
      corpo: listaDePedidos(cancelados, "Nenhuma solicitação cancelada."),
    })}`;
    if (!atendimentoDisponivel) {
      return `${resumo}<p class="mp-aviso" role="status">Novas solicitações continuam desativadas enquanto o fluxo completo é preparado.</p>${acompanhamento}`;
    }
    const corpo = formulario(opcoesAtendimento, horariosAtendimento, escolhaDoEndereco(parametros));
    return `${resumo}${secao({ id: "mp-atendimentos-novo", classe: "mp-atendimentos-acao", kicker: "Começar aqui", titulo: "Solicitar um atendimento", corpo })}${acompanhamento}`;
  },
};

export default vista;
