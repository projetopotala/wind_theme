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
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(data)
    : "Horário a confirmar";
}

function listaDePedidos(atendimentos) {
  if (!atendimentos.length) return vazio({ texto: "Você ainda não fez uma solicitação de atendimento." });
  return `<ol class="mp-atendimentos-lista">${atendimentos.map((pedido) => `<li class="mp-atendimento">
    <div>
      <p class="mp-status" data-status="${e(pedido.status)}">${e(STATUS_DE_ATENDIMENTO[pedido.status])}</p>
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

function formulario(opcoes, horarios) {
  const ofertas = new Map(opcoes.map((item) => [item.id, item]));
  const disponiveis = horarios.filter((item) => ofertas.has(item.offering_id));
  if (!disponiveis.length) return `<p class="mp-aviso" role="status">Nenhum horário de atendimento está disponível agora.</p>`;
  return `<form class="mp-form mp-atendimento-form" data-form="atendimento" novalidate>
    <label>Serviço e horário
      <select name="horarioId" required>
        <option value="">Escolha um horário disponível</option>
        ${disponiveis.map((item) => { const oferta = ofertas.get(item.offering_id); return `<option value="${e(item.id)}">${e(oferta.service)} · ${e(oferta.professional)} · ${e(horarioLegivel(item.starts_at))}</option>`; }).join("")}
      </select>
    </label>
    <p class="mp-nota">O horário fica reservado para análise. A consulta só entra na Agenda depois da confirmação da equipe.</p>
    <p class="mp-form-status" data-form-status role="alert"></p>
    <button class="mp-botao" type="submit">Solicitar atendimento</button>
  </form>`;
}

export default {
  renderizar({ atendimentos = [], opcoesAtendimento = [], horariosAtendimento = [], atendimentoDisponivel = false }) {
    const acompanhamento = secao({
      id: "mp-atendimentos-pedidos",
      kicker: "Acompanhamento",
      titulo: "Suas solicitações",
      corpo: listaDePedidos(atendimentos),
    });
    if (!atendimentoDisponivel) {
      return `<p class="mp-aviso" role="status">Novas solicitações continuam desativadas enquanto o fluxo completo é preparado.</p>${acompanhamento}`;
    }
    return `${secao({ id: "mp-atendimentos-novo", kicker: "Novo pedido", titulo: "Solicitar um atendimento", corpo: formulario(opcoesAtendimento, horariosAtendimento) })}${acompanhamento}`;
  },
};
