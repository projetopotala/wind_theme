import { appointmentFailureMessage, buildAppointmentRequest, createAppointmentRequestSender } from "../shared/appointment-requests.js";
import { APPOINTMENT_REQUESTS_ENABLED, APPOINTMENT_TURNSTILE_SITE_KEY } from "./config.js";
import { createTurnstileTokenProvider } from "./turnstile.js";

export const RECEIVED_MESSAGE = "Solicitação recebida. Nossa equipe entrará em contato para verificar a disponibilidade. O horário ainda não está confirmado.";
export const DISABLED_MESSAGE = "O envio de solicitações pelo site ainda não está disponível. Nenhuma solicitação ou reserva será criada por este formulário.";
const SERVICES = ["Acupuntura", "Reflexologia Palmar", "Reiki"];

export function appointmentDateRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type) => parts.find((entry) => entry.type === type).value;
  const min = `${part("year")}-${part("month")}-${part("day")}`;
  const end = new Date(`${min}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 365);
  return { min, max: end.toISOString().slice(0, 10) };
}

export function validateAppointmentForm(raw, now = new Date()) {
  const request = buildAppointmentRequest(raw);
  const { min, max } = appointmentDateRange(now);
  if (!SERVICES.includes(request.service)) throw new Error("Selecione um dos serviços apresentados.");
  if (request.preferred_date < min || request.preferred_date > max) {
    throw new Error("Escolha uma preferência de data entre hoje e os próximos 365 dias.");
  }
  return request;
}

export function setupAppointmentForm(documentRef = document, {
  enabled = APPOINTMENT_REQUESTS_ENABLED, send, now = () => new Date(),
} = {}) {
  const form = documentRef.querySelector("#bookForm");
  const button = documentRef.querySelector("#bookContinue");
  const summary = documentRef.querySelector("#bookSummary");
  const fields = form?.querySelector("fieldset");
  if (!form || !button || !summary || !fields) return;
  const active = enabled === true;
  let submitting = false;
  const received = new Set();
  let sender;
  const show = (text, state, focus = false) => {
    summary.textContent = text;
    summary.dataset.state = state;
    summary.hidden = false;
    if (focus) summary.focus();
  };
  const setBusy = (busy) => {
    fields.disabled = !active || busy;
    button.disabled = !active || busy;
    form.setAttribute("aria-busy", String(busy));
    button.textContent = !active ? "Envio indisponível" : busy ? "Enviando…" : "Enviar solicitação →";
  };
  const updateDates = () => {
    Object.assign(form.elements.namedItem("preferred_date"), appointmentDateRange(now()));
  };
  setBusy(false);
  updateDates();
  form.noValidate = true;
  show(active ? "Informe suas preferências. O envio não garante disponibilidade." : DISABLED_MESSAGE, active ? "idle" : "disabled");
  const changed = () => {
    if (active && !submitting) { summary.hidden = true; summary.textContent = ""; }
  };
  form.addEventListener("input", changed);
  form.addEventListener("change", changed);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!active) { show(DISABLED_MESSAGE, "disabled", true); return; }
    if (submitting) return;
    updateDates();
    if (!form.reportValidity()) return;
    let request;
    try {
      request = validateAppointmentForm(Object.fromEntries(new FormData(form)), now());
    } catch (error) {
      show(error.message, "error", true);
      return;
    }
    const signature = JSON.stringify(request);
    if (received.has(signature)) { show(RECEIVED_MESSAGE, "received", true); return; }
    submitting = true;
    setBusy(true);
    show("Enviando sua solicitação…", "pending");
    try {
      sender ||= send ?? createAppointmentRequestSender({ challenge: createTurnstileTokenProvider({
        documentRef, sitekey: APPOINTMENT_TURNSTILE_SITE_KEY,
        container: documentRef.querySelector("#appointmentTurnstile"),
      }) });
      const result = await sender(request);
      if (result?.status === "pending") {
        show("Há um envio em andamento. Aguarde antes de tentar novamente.", "pending", true);
        return;
      }
      if (result?.status !== "recebida" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(result.id)) {
        throw new Error("Não foi possível confirmar o recebimento.");
      }
      received.add(signature);
      show(RECEIVED_MESSAGE, "received", true);
    } catch (error) {
      // Falha de rede pode ocorrer depois da gravação: não afirmar que nada foi enviado.
      show(appointmentFailureMessage(error), "error", true);
    } finally {
      submitting = false;
      setBusy(false);
    }
  });
}
