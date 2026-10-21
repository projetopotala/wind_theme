import { APPOINTMENT_ADMIN_ENABLED } from "../appointments/config.js";
import { getAdminAccess } from "./admin-auth.js";
import { loadAppointmentRequests, updateAppointmentRequestStatus, STATES } from "./appointment-requests.js";
import { esc } from "./operations/comum.js";

const LABELS = { recebida: "Recebida", em_contato: "Em contato", encerrada: "Encerrada", cancelada: "Cancelada" };
const PERIODS = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };
const accessDenied = error => [error?.code, error?.status].some(value => ["401", "403", "42501", "PGRST301"].includes(String(value)));

export function renderAppointmentPanel({ rows, phase, message, busy, drafts }) {
  const controls = !["disabled", "forbidden"].includes(phase);
  return `<section class="op-card" style="min-width:0;overflow-wrap:anywhere" aria-label="Solicitações de atendimento" aria-busy="${busy}"><h3>Recebido pelo site — Atendimentos</h3>
    <p class="op-muted">Solicitações não são reservas. Nenhum horário é confirmado por esta triagem.</p>
    <p role="status" aria-live="polite" tabindex="-1" data-appointment-feedback>${esc(message)}</p>
    ${controls ? `<button type="button" data-appointment-reload ${busy ? "disabled" : ""}>Recarregar solicitações</button>` : ""}
    ${rows.map(row => `<article class="op-card"><h4>${esc(row.service)}</h4>
      <dl><dt>Solicitante</dt><dd>${esc(row.requester_name)}</dd><dt>Modalidade</dt><dd>${esc(row.modality === "online" ? "Online" : row.modality === "presencial" ? "Presencial" : row.modality)}</dd>
      <dt>Preferências (sem reserva)</dt><dd>${esc(String(row.preferred_date).split("-").reverse().join("/"))} · ${esc(PERIODS[row.preferred_period] || row.preferred_period)}</dd>
      <dt>Contato (${esc(row.contact_type === "email" ? "e-mail" : "telefone")})</dt><dd style="overflow-wrap:anywhere">${esc(row.contact)}</dd>
      <dt>Solicitada em</dt><dd>${esc(new Date(row.created_at).toLocaleString("pt-BR"))}</dd><dt>Estado atual</dt><dd>${esc(LABELS[row.status] || row.status)}</dd></dl>
      <label>Estado de acompanhamento<select data-appointment-state="${esc(row.id)}" ${busy ? "disabled" : ""}>${STATES.map(state => `<option value="${state}" ${state === (drafts[row.id] || row.status) ? "selected" : ""}>${LABELS[state]}</option>`).join("")}</select></label>
      <button type="button" data-appointment-save="${esc(row.id)}" ${busy ? "disabled" : ""}>Salvar estado</button></article>`).join("")}</section>`;
}

// Defesa de interface e sessão; a autorização efetiva continua nas políticas RLS.
export function createAppointmentPanel({ root, client, enabled = APPOINTMENT_ADMIN_ENABLED, access = getAdminAccess } = {}) {
  let epoch = 0;
  const state = { rows: [], drafts: {}, phase: enabled === true ? "idle" : "disabled", busy: false,
    message: enabled === true ? "Carregue as solicitações de atendimento." : "Acompanhamento de atendimentos temporariamente indisponível. Aguardando homologação." };
  function render(focus = false) {
    const target = root.querySelector("[data-appointment-admin]");
    if (!target) return;
    target.innerHTML = renderAppointmentPanel(state);
    if (focus) target.querySelector("[data-appointment-feedback]")?.focus();
  }
  function clear() {
    epoch++;
    Object.assign(state, { rows: [], drafts: {}, busy: false, phase: enabled === true ? "forbidden" : "disabled", message: enabled === true ? "Acesso administrativo necessário." : "Acompanhamento de atendimentos temporariamente indisponível. Aguardando homologação." });
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
  function click(event) {
    const reloadButton = event.target.closest?.("[data-appointment-reload]");
    const saveButton = event.target.closest?.("[data-appointment-save]");
    if (reloadButton && root.contains(reloadButton)) return reload();
    if (saveButton && root.contains(saveButton)) {
      const id = saveButton.dataset.appointmentSave;
      return save(id, state.drafts[id] || state.rows.find(row => row.id === id)?.status);
    }
  }
  function change(event) {
    const id = event.target.dataset?.appointmentState;
    if (!state.busy && state.rows.some(row => row.id === id) && STATES.includes(event.target.value)) state.drafts[id] = event.target.value;
  }
  root.addEventListener("click", click); root.addEventListener("change", change);
  return { render, reload, save, clear, destroy() { clear(); root.removeEventListener("click", click); root.removeEventListener("change", change); } };
}
