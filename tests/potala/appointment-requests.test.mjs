import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildAppointmentRequest, createAppointmentRequestSender } from "../../outputs/js/shared/appointment-requests.js";
import { criarRestPublico } from "../../outputs/js/supabase/rest.js";
import { updateAppointmentRequestStatus } from "../../outputs/js/admin/appointment-requests.js";

const valid = { service: "Reiki", modality: "presencial", requester_name: "Pessoa Fictícia",
  contact_type: "email", contact: "TESTE@example.invalid", preferred_date: "2027-01-10", preferred_period: "tarde" };
const receipt = { id: "10000000-0000-4000-8000-000000000001", status: "recebida" };
function memory() {
  let value = null;
  return { getItem: () => value, setItem: (_, next) => { value = next; } };
}
function sender(rest, storage = memory()) {
  return createAppointmentRequestSender({ rest, storage, crypto: webcrypto });
}

test("solicitação normaliza dados e descarta estado administrativo fornecido pelo visitante", () => {
  assert.deepEqual(buildAppointmentRequest({ ...valid, status: "confirmada", service: " Reiki " }),
    { ...valid, contact: "teste@example.invalid" });
  assert.equal(buildAppointmentRequest({ ...valid, contact_type: "telefone", contact: "+5511999999999" }).contact_type, "telefone");
});

test("campos inválidos não alcançam a API", async () => {
  let calls = 0;
  const send = sender({ rpc: async () => { calls++; return receipt; } });
  for (const invalid of [{ service: "" }, { service: "a".repeat(121) }, { requester_name: " " },
    { modality: "constructor" }, { preferred_period: "madrugada" }, { contact: "inválido" },
    { contact_type: "outro" }, { preferred_date: "2027-02-30" }, { preferred_date: "infinity" }]) {
    await assert.rejects(send({ ...valid, ...invalid }), /Revise/);
  }
  assert.equal(calls, 0);
});

test("contrato usa somente a RPC pública e exige comprovante recebido", async () => {
  const rest = criarRestPublico({ config: { url: "https://isolado.invalid", publishableKey: "chave-ficticia" },
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://isolado.invalid/rest/v1/rpc/submit_appointment_request");
      assert.equal(options.method, "POST");
      const { p_idempotency_key, ...args } = JSON.parse(options.body);
      assert.match(p_idempotency_key, /^[a-f0-9-]{36}$/);
      assert.deepEqual(args, Object.fromEntries(Object.entries(buildAppointmentRequest(valid)).map(([key, value]) => [`p_${key}`, value])));
      return new Response(JSON.stringify(receipt), { status: 200 });
    } });
  assert.deepEqual(await sender(rest)(valid), receipt);
});

test("cliques durante envio retornam pending sem outro POST", async () => {
  let release;
  let calls = 0;
  const send = sender({ rpc: () => { calls++; return new Promise((resolve) => { release = resolve; }); } });
  const first = send(valid);
  assert.deepEqual(await send(valid), { status: "pending" });
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  release(receipt);
  assert.deepEqual(await first, receipt);
  assert.equal(calls, 1);
});

test("recarregar e repetir após resposta perdida conserva chave; proposta diferente recebe outra", async () => {
  const storage = memory();
  const keys = [];
  const rest = { rpc: async (_, args) => { keys.push(args.p_idempotency_key); if (keys.length === 1) throw new Error("rede"); return receipt; } };
  await assert.rejects(sender(rest, storage)(valid), /rede/);
  const reloaded = sender(rest, storage);
  await reloaded(valid);
  await reloaded(valid);
  await reloaded({ ...valid, service: "Acupuntura" });
  assert.equal(keys[0], keys[1]);
  assert.equal(keys[1], keys[2]);
  assert.notEqual(keys[2], keys[3]);
  assert.doesNotMatch(storage.getItem(), /Fictícia|example|Reiki|Acupuntura/);
});

for (const code of [403, 409, 429, 500]) {
  test(`HTTP ${code} não confirma recebimento e permite nova tentativa`, async () => {
    let calls = 0;
    const rest = criarRestPublico({ config: { url: "https://isolado.invalid", publishableKey: "ficticia" },
      fetchImpl: async () => ++calls === 1 ? new Response(JSON.stringify({ message: "Recusado" }), { status: code })
        : new Response(JSON.stringify(receipt), { status: 200 }) });
    const send = sender(rest);
    await assert.rejects(send(valid), (error) => error.status === code);
    assert.deepEqual(await send(valid), receipt);
  });
}

test("resposta vazia, malformada ou de reserva confirmada não é aceita", async () => {
  for (const result of [null, {}, { ...receipt, status: "confirmada" }, { ...receipt, id: "inválido" }]) {
    await assert.rejects(sender({ rpc: async () => result })(valid), /Não foi possível confirmar/);
  }
});

test("armazenamento corrompido ou indisponível impede envio sem chave persistente", async () => {
  let calls = 0;
  const rest = { rpc: async () => { calls++; return receipt; } };
  await assert.rejects(sender(rest, { getItem: () => "{}" })(valid), /chave local/);
  await assert.rejects(sender(rest, { getItem: () => null, setItem: () => { throw new Error("bloqueado"); } })(valid), /bloqueado/);
  assert.equal(calls, 0);
});

test("adaptador administrativo não envia outros campos nem confirma zero linhas", async () => {
  const client = { from(table) {
    assert.equal(table, "appointment_requests");
    return { update(fields) {
      assert.deepEqual(fields, { status: "em_contato" });
      const query = { eq: () => query, select: () => query, maybeSingle: async () => ({ data: null, error: null }) };
      return query;
    } };
  } };
  await assert.rejects(updateAppointmentRequestStatus(client, receipt.id, "confirmada"), /inválido/);
  await assert.rejects(updateAppointmentRequestStatus(client, receipt.id, "em_contato", "2026-10-18T12:00:00Z"), /não confirmada/);
});

const sql = readFileSync(new URL("../../supabase/migrations/202610160001_appointment_requests.sql", import.meta.url), "utf8");
test("contrato SQL declara RLS e não concede leitura/escrita direta ao visitante (inspeção estática)", () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public.appointment_requests from public, anon, authenticated/);
  assert.match(sql, /grant update \(status\)/);
  assert.equal((sql.match(/select public.is_portal_admin\(\)/g) || []).length, 3);
  assert.doesNotMatch(sql, /grant (select|insert|update|delete)[^;]*to anon/s);
  assert.match(sql, /security definer set search_path = ''/);
  assert.match(sql, /revoke all on function public.submit_appointment_request[^;]+from public, anon, authenticated/);
});
test("contrato SQL declara idempotência, limites e resposta sem contato (inspeção estática)", () => {
  assert.match(sql, /idempotency_key uuid not null unique/);
  assert.match(sql, /pg_try_advisory_xact_lock/);
  assert.match(sql, /is distinct from row/);
  assert.match(sql, /errcode = 'PT409'/);
  assert.match(sql, /interval '24 hours'\) >= 5/);
  assert.match(sql, /interval '1 minute'\) >= 60/);
  assert.match(sql, /return jsonb_build_object\('id', request_id, 'status', 'recebida'\)/);
  assert.doesNotMatch(sql, /op_apply\(|op_snapshot\(|'confirmada'/);
});
