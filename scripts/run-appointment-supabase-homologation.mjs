// Homologação HTTP somente em projeto Supabase isolado. Nunca executa por importação.
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Referência pública aprovada para preparar o laboratório. Não é credencial.
export const HOMOLOG_PROJECT_REF = "pntjdelwdhicrdhanedr";

export function validateDestination(env, execute = false) {
  const ref = env.POTALA_HOMOLOG_PROJECT_REF || "";
  const url = new URL(env.POTALA_HOMOLOG_URL || "https://invalid.invalid");
  if (ref !== HOMOLOG_PROJECT_REF
    || url.protocol !== "https:" || url.hostname !== `${ref}.supabase.co`
    || url.pathname !== "/" || url.search || url.hash || url.username || url.password || url.port) {
    throw new Error("Destino de homologação ausente, inválido ou de produção.");
  }
  if (execute && env.POTALA_HOMOLOG_CONFIRM_REF !== ref) {
    throw new Error("Confirmação explícita do Project ID ausente.");
  }
  const key = env.POTALA_HOMOLOG_PUBLISHABLE_KEY || "";
  if (execute && !key.startsWith("sb_publishable_")) throw new Error("Chave publicável de homologação ausente.");
  return { ref, url: url.origin, key };
}

async function promptLine(label, hidden = false) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Execute o modo interativo em um terminal local com TTY.");
  }
  process.stdout.write(label);
  let value = "";
  return await new Promise((resolve, reject) => {
    const finish = (error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u0003") return finish(new Error("Entrada cancelada."));
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= " " && char !== "\u007f") {
          value += char;
          if (!hidden) process.stdout.write(char);
        }
      }
    };
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

export async function signInTestUser(url, key, email, password, fetchImpl = fetch) {
  const response = await fetchImpl(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data?.access_token !== "string" || data?.user?.email !== email) {
    throw new Error("Falha no login de uma conta fictícia; nenhum teste de escrita foi iniciado.");
  }
  return data.access_token;
}

async function interactiveEnvironment() {
  const ref = await promptLine("Project ID de homologação: ");
  if (ref !== HOMOLOG_PROJECT_REF) throw new Error("Project ID não autorizado.");
  const key = await promptLine("Chave publicável do projeto (entrada oculta): ", true);
  const env = { POTALA_HOMOLOG_PROJECT_REF: ref,
    POTALA_HOMOLOG_URL: `https://${ref}.supabase.co/`,
    POTALA_HOMOLOG_CONFIRM_REF: ref,
    POTALA_HOMOLOG_PUBLISHABLE_KEY: key };
  const { url } = validateDestination(env, true);
  for (const [label, field] of [["administrador ativo", "POTALA_HOMOLOG_ADMIN_JWT"],
    ["administrador inativo", "POTALA_HOMOLOG_INACTIVE_JWT"],
    ["usuário comum", "POTALA_HOMOLOG_ORDINARY_JWT"]]) {
    const email = await promptLine(`E-mail de ${label}: `);
    const password = await promptLine(`Senha de ${label} (entrada oculta): `, true);
    env[field] = await signInTestUser(url, key, email, password);
  }
  return env;
}

export async function runHttpChecks(env, fetchImpl = fetch) {
  const { url, key } = validateDestination(env, true);
  const tokens = {
    admin: env.POTALA_HOMOLOG_ADMIN_JWT,
    ordinary: env.POTALA_HOMOLOG_ORDINARY_JWT,
    inactive: env.POTALA_HOMOLOG_INACTIVE_JWT,
  };
  if (Object.values(tokens).some(value => !value || value.split(".").length !== 3)) {
    throw new Error("JWTs das três contas fictícias ausentes ou inválidos.");
  }
  const subjects = {};
  for (const [role, token] of Object.entries(tokens)) {
    let claims;
    try { claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); }
    catch { throw new Error(`JWT ${role} malformado.`); }
    if (claims.iss !== `${url}/auth/v1` || claims.role !== "authenticated"
      || !claims.sub || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) {
      throw new Error(`JWT ${role} não pertence ao destino ou expirou.`);
    }
    subjects[role] = claims.sub;
  }
  if (new Set(Object.values(subjects)).size !== 3) throw new Error("As contas de teste devem ser distintas.");
  const results = [];
  async function request(path, method, token, body, extra = {}) {
    const response = await fetchImpl(`${url}/rest/v1/${path}`, {
      method, headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json", ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    return { status: response.status, ok: response.ok, data };
  }
  function check(name, pass, detail = "") {
    results.push({ name, result: pass ? "PASSOU" : "FALHOU", detail });
    if (!pass) throw new Error(`Falha: ${name}${detail ? ` (${detail})` : ""}`);
  }
  // Confirma assinatura e pertença dos JWTs pelo Auth real antes da primeira escrita.
  for (const [role, token] of Object.entries(tokens)) {
    const response = await fetchImpl(`${url}/auth/v1/user`, {
      method: "GET", headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    const user = response.ok ? await response.json() : null;
    check(`Auth real: ${role}`, response.ok && user?.id === subjects[role]);
    const membership = await request(`users?select=id,role,active&id=eq.${encodeURIComponent(subjects[role])}`,
      "GET", token);
    check(`Papel efetivo: ${role}`, membership.ok && Array.isArray(membership.data)
      && (role === "ordinary" ? membership.data.length === 0
        : membership.data.length === 1 && membership.data[0].role === "admin"
          && membership.data[0].active === (role === "admin")));
  }
  const idempotencyKey = randomUUID();
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const payload = { p_idempotency_key: idempotencyKey, p_service: "Atendimento fictício",
    p_modality: "online", p_requester_name: "Pessoa de Homologação",
    p_contact_type: "email", p_contact: `f224-${idempotencyKey}@example.invalid`,
    p_preferred_date: date, p_preferred_period: "tarde" };
  const first = await request("rpc/submit_appointment_request", "POST", null, payload);
  check("RPC pública e persistência", first.ok && first.data?.status === "recebida"
    && typeof first.data?.id === "string" && Object.keys(first.data).sort().join() === "id,status");
  const repeat = await request("rpc/submit_appointment_request", "POST", null, payload);
  check("Idempotência persistente", repeat.ok && repeat.data?.id === first.data.id);
  const conflict = await request("rpc/submit_appointment_request", "POST", null,
    { ...payload, p_service: "Serviço fictício diferente" });
  check("Chave com conteúdo distinto", !conflict.ok && conflict.data?.code === "PT409");
  const invalid = await request("rpc/submit_appointment_request", "POST", null,
    { ...payload, p_idempotency_key: randomUUID(), p_service: "" });
  check("Payload inválido", !invalid.ok && invalid.data?.code === "22023");
  const path = `appointment_requests?select=id,service,status,updated_at&id=eq.${encodeURIComponent(first.data.id)}`;
  const anon = await request(path, "GET", null);
  check("Leitura pública bloqueada", !anon.ok || Array.isArray(anon.data) && anon.data.length === 0);
  const anonUpdate = await request(path, "PATCH", null, { status: "encerrada" }, { Prefer: "return=representation" });
  check("Escrita pública bloqueada", !anonUpdate.ok || Array.isArray(anonUpdate.data) && anonUpdate.data.length === 0);
  for (const role of ["ordinary", "inactive"]) {
    const res = await request(path, "GET", tokens[role]);
    check(`Leitura negada a ${role}`, !res.ok || Array.isArray(res.data) && res.data.length === 0);
    const write = await request(path, "PATCH", tokens[role], { status: "cancelada" }, { Prefer: "return=representation" });
    check(`Atualização negada a ${role}`, !write.ok || Array.isArray(write.data) && write.data.length === 0);
  }
  const admin = await request(path, "GET", tokens.admin);
  check("Leitura do administrador ativo", admin.ok && Array.isArray(admin.data) && admin.data.length === 1);
  const updatedAt = admin.data[0].updated_at;
  const update = await request(`${path}&updated_at=eq.${encodeURIComponent(updatedAt)}`, "PATCH", tokens.admin,
    { status: "em_contato" }, { Prefer: "return=representation" });
  check("Atualização administrativa e timestamp", update.ok && Array.isArray(update.data)
    && update.data.length === 1 && update.data[0].status === "em_contato"
    && update.data[0].updated_at !== updatedAt);
  const stale = await request(`${path}&updated_at=eq.${encodeURIComponent(updatedAt)}`, "PATCH", tokens.admin,
    { status: "encerrada" }, { Prefer: "return=representation" });
  check("Conflito por versão antiga", stale.ok && Array.isArray(stale.data) && stale.data.length === 0);
  let current = update.data[0];
  for (const status of ["encerrada", "cancelada", "recebida"]) {
    const changed = await request(`${path}&updated_at=eq.${encodeURIComponent(current.updated_at)}`,
      "PATCH", tokens.admin, { status }, { Prefer: "return=representation" });
    check(`Estado ${status}`, changed.ok && Array.isArray(changed.data) && changed.data.length === 1
      && changed.data[0].status === status && changed.data[0].updated_at !== current.updated_at);
    current = changed.data[0];
  }
  const ordered = await request("appointment_requests?select=id,created_at&order=created_at.desc,id.desc&limit=100", "GET", tokens.admin);
  check("Listagem administrativa ordenada", ordered.ok && Array.isArray(ordered.data)
    && ordered.data.some(row => row.id === first.data.id)
    && ordered.data.every((row, index, list) => index === 0
      || list[index - 1].created_at > row.created_at
      || list[index - 1].created_at === row.created_at && list[index - 1].id >= row.id));
  const racePayload = { ...payload, p_idempotency_key: randomUUID(),
    p_contact: `f224-race-${randomUUID()}@example.invalid` };
  const race = await Promise.all(Array.from({ length: 2 }, () =>
    request("rpc/submit_appointment_request", "POST", null, racePayload)));
  check("Concorrência sem duplicação confirmada", race.some(item => item.ok && item.data?.status === "recebida")
    && race.every(item => item.ok ? item.data?.id === race.find(value => value.ok).data.id
      : item.data?.code === "PT429"));
  const raceRepeat = await request("rpc/submit_appointment_request", "POST", null, racePayload);
  check("Idempotência após concorrência", raceRepeat.ok && raceRepeat.data?.id === race.find(item => item.ok).data.id);
  const volumeContact = `f224-volume-${randomUUID()}@example.invalid`;
  for (let index = 0; index < 5; index++) {
    const accepted = await request("rpc/submit_appointment_request", "POST", null,
      { ...payload, p_idempotency_key: randomUUID(), p_contact: volumeContact });
    check(`Limite por contato: envio ${index + 1}`, accepted.ok && accepted.data?.status === "recebida");
  }
  const limited = await request("rpc/submit_appointment_request", "POST", null,
    { ...payload, p_idempotency_key: randomUUID(), p_contact: volumeContact });
  check("Limite por contato: sexto envio recusado", !limited.ok && limited.data?.code === "PT429");
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const execute = process.argv.includes("--execute");
    const interactive = process.argv.includes("--interactive-auth");
    if (interactive && !execute) throw new Error("--interactive-auth exige --execute.");
    const env = interactive ? await interactiveEnvironment() : process.env;
    const destination = validateDestination(env, execute);
    if (!execute) {
      console.log(`Preparado para projeto isolado ${destination.ref}; nenhuma requisição enviada. Use --execute somente após aprovação.`);
    } else {
      for (const result of await runHttpChecks(env)) console.log(`${result.result}: ${result.name}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
