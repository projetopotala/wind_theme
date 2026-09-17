/*
 * O CLIENTE DA OPERAÇÃO, falando com o Supabase.
 *
 * Leitura: public.op_snapshot() devolve o estado inteiro de uma revisão.
 * Escrita: o comando roda em motor.js sobre essa revisão e o resultado vai a
 * public.op_apply(), que confere quem está gravando, se a revisão ainda é a
 * mesma e se o identificador do pedido já foi usado — tudo numa transação.
 *
 * Os comandos saem em fila: o segundo só começa depois que o primeiro gravou e
 * o estado novo chegou, senão os dois partiriam da mesma revisão e o segundo
 * seria recusado sem motivo aparente.
 */
import { aplicarComando } from "./motor.js";
import { applyResourceCommand } from "./resources.js";
import { applyScheduleCommand } from "./schedule.js";

const clone = (value) => (value == null ? value : structuredClone(value));
const stable = (value) => (value && typeof value === "object" && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
  : Array.isArray(value) ? value.map(stable) : value);
const signature = (type, payload) => JSON.stringify(stable({ type, payload }));
const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const HANDLERS = Object.freeze([applyScheduleCommand, applyResourceCommand]);

export class OperationsError extends Error {
  constructor(message, cause = {}) {
    super(message);
    this.name = "OperationsError";
    this.code = cause.code || "";
    this.cause = cause;
  }
}

/* Mensagens do banco viram frases que dizem o que fazer. */
export function traduzirErro(error = {}) {
  const texto = `${error.message || ""} ${error.details || ""}`;
  if (error.code === "PGRST202" || (/op_(apply|snapshot)/.test(texto) && /not find|schema cache/i.test(texto))) {
    return new OperationsError("A operação ainda não foi instalada no banco do Portal.", error);
  }
  if (error.code === "42501") return new OperationsError("Seu acesso não permite usar a operação do Instituto.", error);
  if (error.code === "PT409") return new OperationsError("Os dados foram atualizados em outra janela. Confira e tente novamente.", error);
  if (error.code === "23505" && /room_code/.test(texto)) return new OperationsError("Já existe uma sala com este código.", error);
  if (error.code === "23505" && /asset_code/.test(texto)) return new OperationsError("Já existe um patrimônio com este código.", error);
  if (/Failed to fetch|NetworkError|Load failed/i.test(texto)) return new OperationsError("Sem conexão com o banco do Portal. Verifique a internet e tente de novo.", error);
  return new OperationsError(error.message || "Não foi possível salvar.", error);
}

export function createOperationsClient({ client, handlers = HANDLERS, id = uuid, agora = () => new Date().toISOString() } = {}) {
  if (typeof client?.rpc !== "function") throw new TypeError("Um cliente Supabase é obrigatório para a operação.");
  let state = null;
  let queue = Promise.resolve();
  let retry = null;
  let actor = "Administração Potala";

  async function refresh() {
    const { data, error } = await client.rpc("op_snapshot");
    if (error) throw traduzirErro(error);
    state = clone(data);
    return clone(state);
  }

  async function execute(type, payload) {
    if (!state) await refresh();
    const mark = signature(type, payload);
    const key = retry?.signature === mark ? retry.key : uuid();
    retry = { signature: mark, key };
    const { result, changes } = aplicarComando(state, { type, payload }, { handlers, id, agora: agora(), actor });
    const { data, error } = await client.rpc("op_apply", {
      p_revision: state.revision,
      p_idempotency_key: key,
      p_action: type,
      p_payload: payload,
      p_result: result ?? null,
      p_changes: changes,
    });
    if (error) {
      if (error.code === "PT409") await refresh().catch(() => {});
      throw traduzirErro(error);
    }
    await refresh();
    retry = null;
    return clone(data?.result);
  }

  function command(type, payload = {}) {
    const task = queue.then(() => execute(type, clone(payload)));
    queue = task.catch(() => {});
    return task;
  }

  return {
    get snapshot() { return clone(state); },
    refresh,
    command,
    /* Só rotula o que o navegador grava nos documentos; a auditoria usa a conta autenticada, decidida no banco. */
    setActor(value) { actor = String(value || "").trim().slice(0, 120) || "Administração Potala"; },
  };
}
