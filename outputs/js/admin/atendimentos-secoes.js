/*
 * Central de Atendimentos: organização em seções recolhíveis e cartões compactos.
 *
 * Só apresentação. Quem pode confirmar, conflitos de agenda, profissional elegível, janela da sala e
 * auditoria continuam no banco (confirm_appointment_request_reservation). Aqui os registros apenas são
 * separados pelo que ainda exige ação do Owner e pelo que já passou. Nada é apagado nem marcado como "realizado".
 */
import { esc } from "./operations/comum.js";

const PERIODOS = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };
const STATUS = { recebida: "Recebida", em_contato: "Em contato", encerrada: "Encerrada", cancelada: "Cancelada" };
const FUSO = "America/Sao_Paulo";
const TOLERANCIA_SALA_MS = 30 * 60 * 1000;

const dmy = (iso) => String(iso || "").split("-").reverse().join("/");
export const hojeEmSaoPaulo = (agora = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);
const nomeDo = (operacional, id) => (operacional.profiles || []).find((p) => p.id === id)?.display_name || "";
const itemDaAgenda = (row, operacional) => (row.reservation_schedule_id
  ? (operacional.schedule_items || []).find((s) => s.id === row.reservation_schedule_id) || null : null);

const formatoDia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });
const formatoHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });

export function quandoConfirmada(item) {
  if (!item?.starts_at) return "Horário a conferir na Agenda";
  const inicio = new Date(item.starts_at);
  if (!Number.isFinite(inicio.valueOf())) return "Horário a conferir na Agenda";
  const fim = item.ends_at ? new Date(item.ends_at) : null;
  return `${formatoDia.format(inicio)} às ${formatoHora.format(inicio)}${fim && Number.isFinite(fim.valueOf()) ? ` – ${formatoHora.format(fim)}` : ""}`;
}

/* Divide as solicitações em pendentes (ativas e vencidas), confirmadas futuras, histórico e canceladas. */
export function classificarAtendimentos(rows = [], operacional = {}, agora = new Date()) {
  const hoje = hojeEmSaoPaulo(agora);
  const pendentes = []; const confirmadas = []; const historico = []; const canceladas = [];
  for (const row of rows) {
    if (row.status === "cancelada") { canceladas.push(row); continue; }
    if (row.reservation_schedule_id) {
      const item = itemDaAgenda(row, operacional);
      const fim = new Date(item?.ends_at || item?.starts_at || "");
      const limite = Number.isFinite(fim.valueOf()) ? fim.valueOf() + (row.modality === "online" ? TOLERANCIA_SALA_MS : 0) : Infinity;
      (limite > agora.valueOf() ? confirmadas : historico).push(row);
      continue;
    }
    if (["recebida", "em_contato"].includes(row.status)) { pendentes.push(row); continue; }
    historico.push(row); // encerrada sem agendamento
  }
  const vencida = (row) => String(row.preferred_date || "") < hoje;
  const porData = (a, b) => String(a.preferred_date).localeCompare(String(b.preferred_date)) || String(a.created_at).localeCompare(String(b.created_at));
  pendentes.sort((a, b) => Number(vencida(a)) - Number(vencida(b)) || porData(a, b));
  const inicioDe = (row) => String(itemDaAgenda(row, operacional)?.starts_at || "");
  confirmadas.sort((a, b) => inicioDe(a).localeCompare(inicioDe(b)));
  historico.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return { pendentes, confirmadas, historico, canceladas, vencida };
}

export function secaoRecolhivel({ id, titulo, total, aberta, corpo, vazio }) {
  return `<details class="atend-secao" id="atend-${esc(id)}" data-atend-secao="${esc(id)}"${aberta ? " open" : ""}>
    <summary><span class="atend-secao-titulo">${esc(titulo)}</span><span class="atend-contagem" aria-label="${total} registros">${total}</span></summary>
    <div class="atend-secao-corpo">${total ? corpo : `<p class="op-muted">${esc(vazio)}</p>`}</div></details>`;
}

const modalidade = (row) => (row.modality === "online" ? "Online" : row.modality === "presencial" ? "Presencial" : row.modality);

export function cartaoPendente(row, { vencida, agendando, formulario, podeAgendar }) {
  const aberto = agendando === row.id;
  const slot = row.appointment_slot_id && row.appointment_slot?.held_by_request_id === row.id ? row.appointment_slot : null;
  const quando = slot ? quandoConfirmada(slot) : `${dmy(row.preferred_date)} · ${PERIODOS[row.preferred_period] || row.preferred_period}`;
  return `<article class="atend-cartao" data-appointment-row="${esc(row.id)}"${vencida ? ' data-vencida="true"' : ""}>
    <div class="atend-linha">
      <div class="atend-info"><strong>${esc(row.requester_name)}</strong><span>${esc(row.service)}</span></div>
      <p class="atend-meta">${esc(quando)} · ${esc(modalidade(row))}
        <span class="atend-selo" data-selo="${vencida ? "vencida" : esc(row.status)}">${vencida ? "Data vencida" : esc(STATUS[row.status] || row.status)}</span></p>
      ${podeAgendar ? `<button type="button" class="atend-agendar" data-atendimentos-agendar="${esc(row.id)}" aria-expanded="${aberto}">${aberto ? "Fechar" : "Agendar"}</button>` : ""}
    </div>
    ${aberto && podeAgendar ? formulario : ""}</article>`;
}

export function cartaoConfirmado(row, { operacional, link, rotulo = "" }) {
  const profissional = nomeDo(operacional, row.professional_profile_id) || "A definir";
  const item = itemDaAgenda(row, operacional);
  return `<article class="atend-cartao" data-atendimentos-confirmed="${esc(row.id)}">
    <div class="atend-linha">
      <div class="atend-info"><strong>${esc(row.requester_name)}</strong><span>${esc(row.service)}</span></div>
      <p class="atend-meta">${esc(quandoConfirmada(item))} · ${esc(modalidade(row))} · ${esc(profissional)}
        <span class="atend-selo" data-selo="${rotulo ? "encerrado" : "confirmada"}">${esc(rotulo || "Confirmada")}</span></p>
    </div>
    ${link || ""}</article>`;
}

/* Histórico: horário encerrado NÃO significa atendimento realizado; o texto diz só o que o banco sabe. */
export function cartaoHistorico(row, { operacional, link }) {
  if (row.reservation_schedule_id) return cartaoConfirmado(row, { operacional, link: "", rotulo: "Horário encerrado" });
  return `<article class="atend-cartao" data-atendimentos-historico="${esc(row.id)}">
    <div class="atend-linha"><div class="atend-info"><strong>${esc(row.requester_name)}</strong><span>${esc(row.service)}</span></div>
      <p class="atend-meta">${esc(dmy(row.preferred_date))} · ${esc(PERIODOS[row.preferred_period] || row.preferred_period)} · ${esc(modalidade(row))}
        <span class="atend-selo" data-selo="encerrado">Encerrada sem agendamento</span></p></div>${link || ""}</article>`;
}

export function cartaoCancelado(row) {
  return `<article class="atend-cartao" data-atendimentos-cancelada="${esc(row.id)}">
    <div class="atend-linha"><div class="atend-info"><strong>${esc(row.requester_name)}</strong><span>${esc(row.service)}</span></div>
      <p class="atend-meta">${esc(dmy(row.preferred_date))} · ${esc(PERIODOS[row.preferred_period] || row.preferred_period)} · ${esc(modalidade(row))}
        <span class="atend-selo" data-selo="cancelada">Cancelada</span></p></div></article>`;
}
