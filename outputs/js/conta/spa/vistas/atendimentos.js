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

function listaDePedidos(atendimentos) {
  if (!atendimentos.length) return vazio({ texto: "Você ainda não fez uma solicitação de atendimento." });
  return `<ol class="mp-atendimentos-lista">${atendimentos.map((pedido) => `<li class="mp-atendimento">
    <div>
      <p class="mp-status" data-status="${e(pedido.status)}">${e(STATUS_DE_ATENDIMENTO[pedido.status])}</p>
      <h3>${e(pedido.servico)}</h3>
      <p class="mp-cartao-detalhe">${e(MODALIDADES[pedido.modalidade])} · ${e(dataLegivel(pedido.dataPreferida))} · ${e(PERIODOS[pedido.periodoPreferido])}</p>
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

function formulario(opcoes) {
  if (!opcoes.length) return `<p class="mp-aviso" role="status">Nenhum serviço com profissional habilitado está disponível agora.</p>`;
  return `<form class="mp-form mp-atendimento-form" data-form="atendimento" novalidate>
    <label>Serviço
      <select name="ofertaId" required>
        <option value="">Escolha um serviço</option>
        ${opcoes.map((item) => `<option value="${e(item.id)}">${e(item.service)} · ${e(item.professional)}</option>`).join("")}
      </select>
    </label>
    <label>Modalidade
      <select name="modalidade" required>
        <option value="presencial">Presencial</option><option value="online">Online</option>
      </select>
    </label>
    <label>Data preferida <input name="dataPreferida" type="date" required></label>
    <label>Período
      <select name="periodoPreferido" required>
        <option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option>
      </select>
    </label>
    <p class="mp-nota">O envio registra um pedido. A consulta só entra na Agenda depois da confirmação da equipe.</p>
    <p class="mp-form-status" data-form-status role="alert"></p>
    <button class="mp-botao" type="submit">Solicitar atendimento</button>
  </form>`;
}

export default {
  renderizar({ atendimentos = [], opcoesAtendimento = [], atendimentoDisponivel = false }) {
    const acompanhamento = secao({
      id: "mp-atendimentos-pedidos",
      kicker: "Acompanhamento",
      titulo: "Suas solicitações",
      corpo: listaDePedidos(atendimentos),
    });
    if (!atendimentoDisponivel) {
      return `<p class="mp-aviso" role="status">Novas solicitações continuam desativadas enquanto o fluxo completo é preparado.</p>${acompanhamento}`;
    }
    return `${secao({ id: "mp-atendimentos-novo", kicker: "Novo pedido", titulo: "Solicitar um atendimento", corpo: formulario(opcoesAtendimento) })}${acompanhamento}`;
  },
};
