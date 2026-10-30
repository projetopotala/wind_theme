import { STATUS_DE_ATENDIMENTO } from "../../modelos.js";
import { e, secao, vazio } from "./comum.js";

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
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(data)
    : "Horário a confirmar";
}

function listaDePedidos(atendimentos, vazioTexto = "Você ainda não fez uma solicitação de atendimento.") {
  if (!atendimentos.length) return vazio({ texto: vazioTexto });
  return `<ol class="mp-atendimentos-lista">${atendimentos.map((pedido) => `<li class="mp-atendimento">
    <div>
      <p class="mp-status" data-status="${e(pedido.status)}">${e(STATUS_DE_ATENDIMENTO[pedido.status])}</p>
      <h3>${e(pedido.servico)}</h3>
      <p class="mp-cartao-detalhe">${e(MODALIDADES[pedido.modalidade])} · ${e(pedido.inicio ? horarioLegivel(pedido.inicio) : `${dataLegivel(pedido.dataPreferida)} · ${PERIODOS[pedido.periodoPreferido]}`)}</p>
    </div>
    <p class="mp-atendimento-nota">${pedido.status === "recebida"
      ? "A equipe recebeu seu pedido. Ele ainda não é uma consulta confirmada."
      : pedido.status === "em_contato"
        ? "A equipe está combinando os detalhes com você."
        : pedido.status === "encerrada"
          ? "Este pedido foi encerrado. Consulte sua Agenda para compromissos confirmados."
          : "Este pedido foi cancelado."}</p>
  </li>`).join("")}</ol>`;
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

export default {
  renderizar({ atendimentos = [], opcoesAtendimento = [], horariosAtendimento = [], atendimentoDisponivel = false, parametros = null }) {
    const pendentes = atendimentos.filter((pedido) => ["recebida", "em_contato"].includes(pedido.status));
    const confirmados = atendimentos.filter((pedido) => pedido.status === "encerrada" && pedido.inicio);
    const historico = atendimentos.filter((pedido) => pedido.status === "cancelada" || (pedido.status === "encerrada" && !pedido.inicio));
    const resumo = `<nav class="mp-atendimentos-resumo" aria-label="Resumo dos atendimentos">
      <a href="#mp-atendimentos-pendentes"><strong>${pendentes.length}</strong><span>Aguardando a equipe</span></a>
      <a href="#mp-atendimentos-confirmados"><strong>${confirmados.length}</strong><span>Confirmados</span></a>
      <a href="#mp-atendimentos-historico"><strong>${historico.length}</strong><span>No histórico</span></a>
    </nav>`;
    const acompanhamento = `${secao({
      id: "mp-atendimentos-pendentes", kicker: "Aguardando ação", titulo: "Solicitações pendentes",
      corpo: listaDePedidos(pendentes, "Nenhuma solicitação aguarda retorno da equipe."),
    })}${secao({
      id: "mp-atendimentos-confirmados", kicker: "Próximos atendimentos", titulo: "Consultas confirmadas",
      corpo: listaDePedidos(confirmados, "Quando uma consulta for confirmada, ela aparecerá aqui e na sua Agenda."),
    })}${secao({
      id: "mp-atendimentos-historico", classe: "mp-secao-discreta", kicker: "Histórico", titulo: "Pedidos encerrados ou cancelados",
      corpo: listaDePedidos(historico, "Seu histórico de solicitações está vazio."),
    })}`;
    if (!atendimentoDisponivel) {
      return `${resumo}<p class="mp-aviso" role="status">Novas solicitações continuam desativadas enquanto o fluxo completo é preparado.</p>${acompanhamento}`;
    }
    const corpo = formulario(opcoesAtendimento, horariosAtendimento, escolhaDoEndereco(parametros));
    return `${resumo}${secao({ id: "mp-atendimentos-novo", classe: "mp-atendimentos-acao", kicker: "Começar aqui", titulo: "Solicitar um atendimento", corpo })}${acompanhamento}`;
  },
};
