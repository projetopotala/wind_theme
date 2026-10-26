import { SUPABASE_CONFIG } from "../supabase/config.js";
import { RestError } from "../supabase/rest.js";

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
export async function submitAppointmentRequest(args, token, {
  config = SUPABASE_CONFIG, fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  if (!config.url || !config.publishableKey || typeof fetchImpl !== "function") {
    throw new RestError("Envio indisponível.");
  }
  let response;
  try {
    response = await fetchImpl(`${config.url.replace(/\/$/, "")}/functions/v1/submit-appointment-request`, {
      method: "POST", headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ ...args, turnstile_token: token }),
    });
  } catch { throw new RestError("Sem conexão com o Portal. Tente de novo em instantes."); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new RestError("Não foi possível receber a solicitação.", { status: response.status });
  return data;
}

/*
 * A frase de cada falha do envio público.
 *
 * O servidor (submit-appointment-request) responde com status diferentes, e cada
 * um pede uma saída diferente: dado inválido pede revisão, 429 pede espera, 503
 * diz que o recebimento está fechado. Antes, toda falha virava "confira sua
 * conexão" — e a pessoa repetia o gesto que não ia funcionar. Nenhuma frase diz
 * que nada foi gravado (uma falha pode chegar depois da gravação) nem confirma
 * horário.
 */
export function appointmentFailureMessage(error) {
  const nada = " Nenhum horário está confirmado.";
  switch (error?.status) {
    case 400:
    case 413:
      return `Revise o serviço, o nome, o contato e as preferências e envie de novo.${nada}`;
    case 403:
      return `Não foi possível concluir a verificação de segurança. Tente novamente com os mesmos dados.${nada}`;
    case 409:
      return `Os dados mudaram desde a tentativa anterior. Revise a solicitação e envie de novo.${nada}`;
    case 429:
      return `Recebemos muitas solicitações em pouco tempo. Tente novamente mais tarde.${nada}`;
    case 503:
      return `O recebimento de solicitações está temporariamente indisponível. Tente mais tarde com os mesmos dados.${nada}`;
    default:
      break;
  }
  if (typeof error?.message === "string" && error.message.startsWith("Verificação")) {
    return `Não foi possível concluir a verificação de segurança. Tente novamente com os mesmos dados.${nada}`;
  }
  return `Não foi possível confirmar o recebimento. Confira sua conexão e tente novamente com os mesmos dados.${nada}`;
}

export function createAppointmentRequestSender({ submit = submitAppointmentRequest, challenge,
  storage, crypto = globalThis.crypto } = {}) {
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
      if (typeof challenge !== "function") throw new Error("Verificação indisponível.");
      const token = await challenge();
      if (!token) throw new Error("Verificação não concluída.");
      const result = await submit({ p_idempotency_key: key, ...args }, token);
      if (!result || !UUID.test(result.id) || result.status !== "recebida") {
        throw new Error("Não foi possível confirmar o recebimento. Tente novamente com os mesmos dados.");
      }
      return { id: result.id, status: "recebida" };
    } finally {
      pending = false;
    }
  };
}
