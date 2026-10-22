import { APPOINTMENT_ADMIN_ENABLED, APPOINTMENT_RESERVATIONS_ENABLED } from "../appointments/config.js";
import { getAdminAccess } from "./admin-auth.js";
import { loadAppointmentRequests, updateAppointmentRequestStatus, STATES } from "./appointment-requests.js";
import { confirmAppointmentReservation } from "./appointment-reservations.js";
import { esc } from "./operations/comum.js";

const LABELS = { recebida: "Recebida", em_contato: "Em contato", encerrada: "Encerrada", cancelada: "Cancelada" };
const PERIODS = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };
const accessDenied = error => [error?.code, error?.status].some(value => ["401", "403", "42501", "PGRST301"].includes(String(value)));

function suggestedTime(row) {
  const hour = { manha: "09:00", tarde: "14:00", noite: "18:00" }[row.preferred_period] || "09:00";
  const start = `${row.preferred_date}T${hour}`;
  const end = new Date(`${start}:00-03:00`);
  end.setHours(end.getHours() + 1);
  const localEnd = new Date(end.valueOf() - 3 * 3600000).toISOString().slice(0, 16);
  return { start, end: localEnd };
}

const option = (item, label, selected = false) => `<option value="${esc(item.id)}" ${selected ? "selected" : ""}>${esc(item[label] || item.title || item.display_name || item.name || item.id)}</option>`;

function reservationForm(row, operational = {}) {
  if (row.reservation_schedule_id) return `<p class="mp-status">Reserva vinculada à agenda.</p>`;
  const rooms = (operational.rooms || []).filter(item => item.status === "available" && item.capacity);
  const offerings = (operational.activity_offerings || []).filter(item => item.active !== false);
  const professionals = (operational.profiles || []).filter(item => item.active !== false && item.roles?.includes("professional"));
  const clients = (operational.profiles || []).filter(item => item.active !== false && item.roles?.includes("client"));
  const legacy = !row.offering_id || !row.professional_profile_id;
  const time = suggestedTime(row);
  const room = row.modality === "presencial" ? `<label>Sala<select data-reservation-room required><option value="">Escolha uma sala</option>${rooms.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}</select></label>` : "";
  return `<fieldset data-appointment-reservation><legend>Confirmar na agenda</legend>
    ${legacy ? `<p class="appointment-reservation-wide op-muted">Solicitação pública anterior: selecione explicitamente os cadastros operacionais. O sistema não associa pelo nome do serviço.</p>
    <label>Oferta<select data-reservation-offering required><option value="">Escolha a oferta</option>${offerings.map(item => option(item, "title", item.id === row.offering_id)).join("")}</select></label>
    <label>Profissional<select data-reservation-professional required><option value="">Escolha o profissional</option>${professionals.map(item => option(item, "display_name", item.id === row.professional_profile_id)).join("")}</select></label>
    <label>Cliente operacional<select data-reservation-client required><option value="">Escolha o cliente</option>${clients.map(item => option(item, "display_name")).join("")}</select></label>` : ""}
    <label>Início<input data-reservation-start type="datetime-local" value="${esc(time.start)}" required></label>
    <label>Fim<input data-reservation-end type="datetime-local" value="${esc(time.end)}" required></label>${room}
    <label class="appointment-reservation-wide">Observações<textarea data-reservation-notes maxlength="1000"></textarea></label>
    <label class="appointment-reservation-wide"><input data-reservation-confirm type="checkbox" required> Revisei horário, profissional, modalidade${row.modality === "presencial" ? " e sala" : ""} e confirmo esta reserva.</label>
    <button type="button" data-appointment-confirm="${esc(row.id)}">Confirmar reserva</button>
  </fieldset>`;
}

export function renderAppointmentPanel({ rows, phase, message, busy, drafts, operationalState = {}, reservationsEnabled = false }) {
  const controls = !["disabled", "forbidden"].includes(phase);
  return `<section class="op-card" style="min-width:0;overflow-wrap:anywhere" aria-label="Solicitações de atendimento" aria-busy="${busy}"><h3>Recebido pelo site — Atendimentos</h3>
    <p class="op-muted">Solicitações não são reservas. Nenhum horário é confirmado por esta triagem.</p>
    <p role="status" aria-live="polite" tabindex="-1" data-appointment-feedback>${esc(message)}</p>
    ${controls ? `<button type="button" data-appointment-reload ${busy ? "disabled" : ""}>Recarregar solicitações</button>` : ""}
    ${rows.map(row => `<article class="op-card" data-appointment-row="${esc(row.id)}"><h4>${esc(row.service)}</h4>
      <dl><dt>Solicitante</dt><dd>${esc(row.requester_name)}</dd><dt>Modalidade</dt><dd>${esc(row.modality === "online" ? "Online" : row.modality === "presencial" ? "Presencial" : row.modality)}</dd>
      <dt>Preferências (sem reserva)</dt><dd>${esc(String(row.preferred_date).split("-").reverse().join("/"))} · ${esc(PERIODS[row.preferred_period] || row.preferred_period)}</dd>
      <dt>Contato (${esc(row.contact_type === "email" ? "e-mail" : "telefone")})</dt><dd style="overflow-wrap:anywhere">${esc(row.contact)}</dd>
      <dt>Solicitada em</dt><dd>${esc(new Date(row.created_at).toLocaleString("pt-BR"))}</dd><dt>Estado atual</dt><dd>${esc(LABELS[row.status] || row.status)}</dd></dl>
      <label>Estado de acompanhamento<select data-appointment-state="${esc(row.id)}" ${busy ? "disabled" : ""}>${STATES.map(state => `<option value="${state}" ${state === (drafts[row.id] || row.status) ? "selected" : ""}>${LABELS[state]}</option>`).join("")}</select></label>
      <button type="button" data-appointment-save="${esc(row.id)}" ${busy ? "disabled" : ""}>Salvar estado</button>
      ${controls && !busy && reservationsEnabled ? reservationForm(row, operationalState) : ""}</article>`).join("")}</section>`;
}

// Defesa de interface e sessão; a autorização efetiva continua nas políticas RLS.
export function createAppointmentPanel({ root, client, enabled = APPOINTMENT_ADMIN_ENABLED, access = getAdminAccess,
  reservationsEnabled = APPOINTMENT_RESERVATIONS_ENABLED, getOperationalState = () => null,
  confirmReservation = confirmAppointmentReservation, id = () => globalThis.crypto.randomUUID() } = {}) {
  let epoch = 0;
  const state = { rows: [], drafts: {}, phase: enabled === true ? "idle" : "disabled", busy: false,
    message: enabled === true ? "Carregue as solicitações de atendimento." : "Acompanhamento de atendimentos temporariamente indisponível. Aguardando homologação." };
  function render(focus = false) {
    const target = root.querySelector("[data-appointment-admin]");
    if (!target) return;
    target.innerHTML = renderAppointmentPanel({ ...state, operationalState: getOperationalState() || {}, reservationsEnabled });
    if (focus) target.querySelector("[data-appointment-feedback]")?.focus();
  }
  function clear() {
    epoch++;
    Object.assign(state, { rows: [], drafts: {}, reservationKeys: {}, busy: false, phase: enabled === true ? "forbidden" : "disabled", message: enabled === true ? "Acesso administrativo necessário." : "Acompanhamento de atendimentos temporariamente indisponível. Aguardando homologação." });
    render();
  }
  async function execute(work, pending) {
    if (enabled !== true || state.busy) return;
    const ticket = ++epoch;
    state.busy = true; state.message = pending; render();
    try {
      const permission = await access(client);
      if (ticket !== epoch) return;
      if (permission.state !== "authorized") { clear(); return; }
      state.phase = "ready";
      await work(ticket);
    } catch (error) {
      if (ticket !== epoch) return;
      if (accessDenied(error)) { clear(); return; }
      // Não expor corpos HTTP/SQL nem conservar dados possivelmente obsoletos.
      state.rows = []; state.drafts = {}; state.phase = "error";
      state.message = error.code === "APPOINTMENT_CONFLICT"
        ? "A solicitação mudou ou não está acessível. Recarregue e revise antes de salvar novamente."
        : "Não foi possível confirmar a operação. Recarregue as solicitações antes de tentar novamente.";
    } finally {
      if (ticket === epoch) { state.busy = false; render(true); }
    }
  }
  function reload() {
    return execute(async ticket => {
      const rows = await loadAppointmentRequests(client);
      if (ticket !== epoch) return;
      state.rows = rows; state.drafts = {};
      state.message = rows.length ? `Exibindo ${rows.length} solicitações mais recentes (limite de 100).` : "Nenhuma solicitação de atendimento recebida.";
    }, "Carregando solicitações…");
  }
  function save(id, status) {
    if (!STATES.includes(status)) return;
    const row = state.rows.find(item => item.id === id);
    if (!row) return;
    return execute(async ticket => {
      const updated = await updateAppointmentRequestStatus(client, id, status, row.updated_at);
      if (ticket !== epoch) return;
      state.rows = state.rows.map(item => item.id === id ? updated : item);
      delete state.drafts[id];
      state.message = "Estado de acompanhamento atualizado. Nenhuma reserva foi criada ou confirmada.";
    }, "Salvando estado…");
  }
  function confirm(id, fields) {
    if (!reservationsEnabled) return;
    const row = state.rows.find(item => item.id === id);
    if (!row || row.reservation_schedule_id) return;
    state.reservationKeys ||= {};
    state.reservationKeys[id] ||= idFactory();
    return execute(async ticket => {
      await confirmReservation(client, {
        requestId: id,
        expectedUpdatedAt: row.updated_at,
        idempotencyKey: state.reservationKeys[id],
        startsAt: fields.start,
        endsAt: fields.end,
        roomId: fields.room,
        notes: fields.notes,
        offeringId: fields.offering,
        professionalProfileId: fields.professional,
        clientProfileId: fields.client,
      });
      if (ticket !== epoch) return;
      delete state.reservationKeys[id];
      const rows = await loadAppointmentRequests(client);
      if (ticket !== epoch) return;
      state.rows = rows; state.drafts = {};
      state.message = "Reserva confirmada e vinculada à solicitação na agenda operacional.";
    }, "Confirmando reserva…");
  }
  function click(event) {
    const reloadButton = event.target.closest?.("[data-appointment-reload]");
    const saveButton = event.target.closest?.("[data-appointment-save]");
    const confirmButton = event.target.closest?.("[data-appointment-confirm]");
    if (reloadButton && root.contains(reloadButton)) return reload();
    if (saveButton && root.contains(saveButton)) {
      const id = saveButton.dataset.appointmentSave;
      return save(id, state.drafts[id] || state.rows.find(row => row.id === id)?.status);
    }
    if (confirmButton && root.contains(confirmButton)) {
      const article = confirmButton.closest("[data-appointment-row]");
      const approved = article?.querySelector("[data-reservation-confirm]")?.checked;
      if (!approved) { state.message = "Confirme que revisou os dados da reserva."; render(true); return; }
      return confirm(confirmButton.dataset.appointmentConfirm, {
        start: article.querySelector("[data-reservation-start]")?.value,
        end: article.querySelector("[data-reservation-end]")?.value,
        room: article.querySelector("[data-reservation-room]")?.value || "",
        notes: article.querySelector("[data-reservation-notes]")?.value || "",
        offering: article.querySelector("[data-reservation-offering]")?.value || "",
        professional: article.querySelector("[data-reservation-professional]")?.value || "",
        client: article.querySelector("[data-reservation-client]")?.value || "",
      });
    }
  }
  function change(event) {
    const id = event.target.dataset?.appointmentState;
    if (!state.busy && state.rows.some(row => row.id === id) && STATES.includes(event.target.value)) state.drafts[id] = event.target.value;
  }
  root.addEventListener("click", click); root.addEventListener("change", change);
  const idFactory = id;
  return { render, reload, save, confirm, clear, destroy() { clear(); root.removeEventListener("click", click); root.removeEventListener("change", change); } };
}
