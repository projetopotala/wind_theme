/*
 * Seção "Atendimentos" da Central Operacional.
 *
 * Reúne em um só lugar o que o administrador faz para atender alguém:
 * disponibilizar horário, responder solicitações e acompanhar o confirmado.
 * É só apresentação: as regras (publicação do perfil, compatibilidade
 * oferta/profissional, sala, sobreposição, e-mail do cliente) continuam no
 * banco. Nada aqui publica perfil, cria cadastro ou muda o que já existe.
 */
import { esc } from "./operations/comum.js";
import { classificarAtendimentos, secaoRecolhivel, cartaoPendente, cartaoConfirmado, cartaoHistorico, cartaoCancelado } from "./atendimentos-secoes.js";

export const DURATIONS = Object.freeze([30, 45, 60]);

const fmtTime = (iso) => String(iso || '').slice(11, 16);

/* Soma minutos a um horário de parede "AAAA-MM-DD" + "HH:mm", sem fuso. */
export function computeEnd(date, time, minutes) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^\d{2}:\d{2}$/.test(time || "")) return "";
  if (!DURATIONS.includes(Number(minutes))) return "";
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const end = new Date(Date.UTC(y, m - 1, d, h, mi + Number(minutes)));
  return Number.isFinite(end.valueOf()) ? end.toISOString().slice(0, 16) : "";
}

export const modalityOf = (offering) => (offering?.mode === "online" ? "online" : "presencial");

/* Mensagens próprias do horário: nada vindo do banco é repassado. */
export function slotErrorMessage(error) {
  switch (String(error?.code ?? "")) {
    case "42501": return "Seu acesso não permite disponibilizar horários.";
    case "PT409": return "O profissional ou a sala já tem um horário sobreposto neste período. Escolha outro horário.";
    case "23514": return "A sala escolhida não está disponível. Escolha outra sala.";
    case "22023": return "O horário não foi aceito. Confira: profissional publicado e ativo, serviço compatível com ele, horário no futuro e, se presencial, sala dentro do funcionamento.";
    default: return "Não foi possível disponibilizar o horário. Revise os dados e tente de novo.";
  }
}

function slotForm({ controls, busy, reservationsEnabled, operational, draft }) {
  if (!controls) return "";
  if (!reservationsEnabled) return `<p class="op-muted">A disponibilização de horários está desligada neste ambiente.</p>`;
  const professionals = (operational.profiles || []).filter((p) => p.active !== false && p.roles?.includes("professional"));
  const offerings = (operational.activity_offerings || []).filter((o) => o.active !== false);
  const rooms = (operational.rooms || []).filter((r) => r.status === "available" && r.capacity);
  const sel = (value, wanted) => (String(value) === String(wanted) ? "selected" : "");
  return `<fieldset data-atendimentos-slot class="atend-slot"><legend>Dados do horário</legend>
    <label>Profissional<select data-slot-professional required><option value="">Escolha o profissional</option>${professionals.map((p) =>
      `<option value="${esc(p.id)}" data-published="${p.published === true}" ${sel(p.id, draft.professional)}>${esc(p.display_name || p.id)}${p.published === true ? "" : " — não publicado"}</option>`).join("")}</select></label>
    <p class="atend-aviso appointment-reservation-wide" data-slot-unpublished role="status" hidden>Este profissional ainda não está publicado, então o banco vai recusar o horário. Publique o perfil em Pessoas antes. Nada é publicado automaticamente.</p>
    <label>Serviço (oferta)<select data-slot-offering required><option value="">Escolha o serviço</option>${offerings.map((o) =>
      `<option value="${esc(o.id)}" data-professional="${esc(o.professional_id || "")}" data-mode="${modalityOf(o)}" ${sel(o.id, draft.offering)}>${esc(o.title || o.id)}</option>`).join("")}</select></label>
    <p class="op-muted appointment-reservation-wide" data-slot-modality aria-live="polite"></p>
    <label data-slot-room-label hidden>Sala<select data-slot-room><option value="">Escolha uma sala</option>${rooms.map((r) =>
      `<option value="${esc(r.id)}" ${sel(r.id, draft.room)}>${esc(r.name || r.id)}</option>`).join("")}</select></label>
    <label>Data<input data-slot-date type="date" value="${esc(draft.date || "")}" required></label>
    <label>Horário de início<input data-slot-time type="time" value="${esc(draft.time || "")}" required></label>
    <label>Duração<select data-slot-duration>${DURATIONS.map((m) => `<option value="${m}" ${sel(m, draft.duration || 60)}>${m} minutos</option>`).join("")}</select></label>
    <p class="op-muted appointment-reservation-wide" data-slot-end aria-live="polite"></p>
    <button type="button" data-appointment-slot-create ${busy ? "disabled" : ""}>Disponibilizar horário</button></fieldset>`;
}

/*
 * Primeira visualização: só o que exige ação (solicitações pendentes). O resto fica recolhido, com a contagem.
 * Só um formulário "Agendar" fica aberto por vez (state.agendando); os demais são cartões compactos.
 */
export function renderAtendimentos({ rows, phase, message, busy, operationalState = {}, reservationsEnabled = false, slotDraft = {}, helpers,
  agora = new Date(), abertas = {}, agendando = null }) {
  const controls = !["disabled", "forbidden"].includes(phase);
  const grupos = classificarAtendimentos(rows, operationalState, agora);
  const aberta = (id, padrao = false) => (id in abertas ? abertas[id] === true : padrao);
  const podeAgendar = Boolean(controls && !busy && reservationsEnabled);
  const link = (row) => helpers.roomLink(row);
  const sala = (row) => (row.reservation_schedule_id ? link(row) : "");
  const pendentes = grupos.pendentes.map((row) => cartaoPendente(row, {
    vencida: grupos.vencida(row), agendando, podeAgendar,
    formulario: podeAgendar && agendando === row.id ? helpers.reservationForm(row, operationalState, { simple: true, agora }) : "",
  })).join("");
  const vencidas = grupos.pendentes.filter(grupos.vencida).length;
  return `<div class="atend" aria-busy="${busy}">
    <p role="status" aria-live="polite" tabindex="-1" data-appointment-feedback>${esc(message)}</p>
    ${controls ? `<button type="button" data-appointment-reload ${busy ? "disabled" : ""}>Recarregar</button>` : ""}
    ${secaoRecolhivel({ id: "solicitacoes", titulo: "Solicitações pendentes", total: grupos.pendentes.length, aberta: aberta("solicitacoes", true), corpo: `${vencidas ? `<p class="atend-aviso" role="status">${vencidas} com data preferida já vencida: reagende, ou feche em "Estado" se não for mais necessário. Elas não somem sozinhas.</p>` : ""}${pendentes}`, vazio: "Nenhuma solicitação aguardando confirmação." })}
    ${secaoRecolhivel({ id: "confirmadas", titulo: "Consultas confirmadas", total: grupos.confirmadas.length, aberta: aberta("confirmadas"), corpo: grupos.confirmadas.map((row) => cartaoConfirmado(row, { operacional: operationalState, link: `${sala(row)}<button type="button" data-atendimentos-goto="agenda">Ver na Agenda</button>` })).join(""), vazio: "Nenhuma consulta confirmada à frente." })}
    ${secaoRecolhivel({ id: "historico", titulo: "Histórico e encerradas", total: grupos.historico.length, aberta: aberta("historico"), corpo: grupos.historico.map((row) => cartaoHistorico(row, { operacional: operationalState, link: "" })).join(""), vazio: "Nada no histórico ainda." })}
    ${secaoRecolhivel({ id: "canceladas", titulo: "Canceladas", total: grupos.canceladas.length, aberta: aberta("canceladas"), corpo: grupos.canceladas.map(cartaoCancelado).join(""), vazio: "Nenhuma solicitação cancelada." })}
    <details class="atend-secao" id="atend-horario" data-atend-secao="horario"${aberta("horario") ? " open" : ""}><summary><span class="atend-secao-titulo">Disponibilizar horário público</span></summary>
      <div class="atend-secao-corpo">${slotForm({ controls, busy, reservationsEnabled, operational: operationalState, draft: slotDraft })}</div></details></div>`;
}

export function readSlotForm(form) {
  const get = (selector) => form.querySelector(selector)?.value || "";
  return {
    professional: get("[data-slot-professional]"), offering: get("[data-slot-offering]"), room: get("[data-slot-room]"),
    date: get("[data-slot-date]"), time: get("[data-slot-time]"), duration: Number(get("[data-slot-duration]")) || 60,
  };
}

/* Ajusta o formulário sem recriá-lo: aviso de publicação, ofertas compatíveis, sala e término. */
export function syncSlotForm(form) {
  if (!form) return;
  const professional = form.querySelector("[data-slot-professional]");
  const offering = form.querySelector("[data-slot-offering]");
  const roomLabel = form.querySelector("[data-slot-room-label]");
  const room = form.querySelector("[data-slot-room]");
  const chosen = professional?.selectedOptions?.[0];
  const warning = form.querySelector("[data-slot-unpublished]");
  if (warning) warning.hidden = !(professional?.value && chosen?.dataset.published === "false");
  for (const option of offering?.options || []) {
    const owner = option.dataset?.professional;
    option.disabled = Boolean(option.value && professional?.value && owner && owner !== professional.value);
  }
  if (offering?.selectedOptions?.[0]?.disabled) offering.value = "";
  const mode = offering?.selectedOptions?.[0]?.dataset?.mode;
  const modality = form.querySelector("[data-slot-modality]");
  if (modality) modality.textContent = !offering?.value ? "" : mode === "online" ? "Modalidade: online — sem sala." : "Modalidade: presencial — escolha a sala.";
  const presencial = Boolean(offering?.value) && mode !== "online";
  if (roomLabel) roomLabel.hidden = !presencial;
  if (room) { room.required = presencial; if (!presencial) room.value = ""; }
  const values = readSlotForm(form);
  const end = computeEnd(values.date, values.time, values.duration);
  const endNode = form.querySelector("[data-slot-end]");
  if (endNode) endNode.textContent = end ? `Término: ${fmtTime(end)} (calculado pela duração).` : "";
}
