import { criarRestPublico } from "../supabase/rest.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORAGE_KEY = "potala.appointment-request.v1";
const length = (value) => [...value].length;

export function buildAppointmentRequest(raw = {}) {
  const text = (name) => typeof raw[name] === "string" ? raw[name].trim() : "";
  const request = {
    service: text("service"), modality: text("modality"), requester_name: text("requester_name"),
    contact_type: text("contact_type"), contact: text("contact").toLowerCase(),
    preferred_date: text("preferred_date"), preferred_period: text("preferred_period"),
  };
  const date = new Date(`${request.preferred_date}T12:00:00Z`);
  if (length(request.service) < 3 || length(request.service) > 120
    || length(request.requester_name) < 2 || length(request.requester_name) > 100
    || !["online", "presencial"].includes(request.modality)
    || !["manha", "tarde", "noite"].includes(request.preferred_period)
    || !/^\d{4}-\d{2}-\d{2}$/.test(request.preferred_date)
    || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== request.preferred_date
    || length(request.contact) < 8 || length(request.contact) > 254
    || !(request.contact_type === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.contact)
      || request.contact_type === "telefone" && /^\+?[0-9]{10,15}$/.test(request.contact))) {
    throw new Error("Revise o serviço, nome, contato e preferências da solicitação.");
  }
  return request;
}

// Não monta o formulário nem envia automaticamente. A data relativa é validada
// no servidor; assim uma repetição idempotente continua válida após a data passar.
// Guarda somente a chave e um resumo criptográfico, nunca os campos de contato.
export function createAppointmentRequestSender({ rest, storage, crypto = globalThis.crypto } = {}) {
  let pending = false;
  return async (raw) => {
    if (pending) return { status: "pending" };
    pending = true;
    try {
      const request = buildAppointmentRequest(raw);
      const bytes = new TextEncoder().encode(JSON.stringify(request));
      const fingerprint = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((byte) => byte.toString(16).padStart(2, "0")).join("");
      // Se o armazenamento estiver indisponível/corrompido, não envia e não
      // inventa outra chave para um pedido que pode já ter sido persistido.
      const store = storage ?? globalThis.localStorage;
      if (!store) throw new Error("Não foi possível preservar a chave da solicitação neste navegador.");
      const saved = store.getItem(STORAGE_KEY);
      const previous = saved ? JSON.parse(saved) : null;
      if (previous && (!/^[a-f0-9]{64}$/.test(previous.fingerprint) || !UUID.test(previous.key))) {
        throw new Error("A chave local da solicitação precisa ser revisada antes de tentar novamente.");
      }
      const key = previous?.fingerprint === fingerprint ? previous.key : crypto.randomUUID();
      store.setItem(STORAGE_KEY, JSON.stringify({ fingerprint, key }));
      const args = Object.fromEntries(Object.entries(request).map(([name, value]) => [`p_${name}`, value]));
      const result = await (rest ?? criarRestPublico()).rpc("submit_appointment_request", { p_idempotency_key: key, ...args });
      if (!result || !UUID.test(result.id) || result.status !== "recebida") {
        throw new Error("Não foi possível confirmar o recebimento. Tente novamente com os mesmos dados.");
      }
      return { id: result.id, status: "recebida" };
    } finally {
      pending = false;
    }
  };
}
