import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAppointmentPanel } from "../../outputs/js/admin/appointment-panel.js";
import { updateAppointmentRequestStatus, STATES } from "../../outputs/js/admin/appointment-requests.js";
import { APPOINTMENT_ADMIN_ENABLED } from "../../outputs/js/appointments/config.js";

const row = { id: "10000000-0000-4000-8000-000000000001", service: "Reiki", modality: "online", requester_name: "Pessoa fictícia",
  contact_type: "email", contact: "pessoa@example.invalid", preferred_date: "2026-11-10", preferred_period: "tarde",
  status: "recebida", created_at: "2026-10-18T12:00:00Z", updated_at: "2026-10-18T12:00:00Z" };
function fixture({ enabled = true, reservationsEnabled = false, role = "admin", signedIn = true, active = true } = {}) {
  const calls = [], handlers = {};
  const target = { innerHTML: "", querySelector: () => ({ focus() {} }) };
  const root = { querySelector: () => target, contains: () => true, addEventListener: (type, fn) => { handlers[type] = fn; }, removeEventListener() {} };
  const response = { list: { data: [row], error: null }, slots: { data: [], error: null }, update: { data: { ...row, status: "em_contato", updated_at: "2026-10-18T13:00:00Z" }, error: null } };
  const client = { auth: { getSession: async () => ({ data: { session: signedIn ? { user: { id: "admin-test" } } : null } }) }, from(table) {
    calls.push(["from", table]);
    let mode = "list";
    const query = { select(value) { calls.push(["select", table, value]); return query; }, order(key, options) { calls.push(["order", key, options]); return query; }, limit() { return table === "appointment_slots" ? response.slots : response.list; },
      update(value) { mode = "update"; calls.push(["update", value]); return query; }, eq(key, value) { calls.push(["eq", key, value]); return query; },
      maybeSingle() { return table === "users" ? { data: { id: "admin-test", role, active } } : response[mode]; } };
    return query;
  } };
  const panel = createAppointmentPanel({ root, client, enabled, reservationsEnabled });
  panel.render();
  return { panel, calls, response, target, handlers, client };
}

test("flag administrativa false: nenhuma consulta nem autenticação remota", async () => {
  assert.equal(APPOINTMENT_ADMIN_ENABLED, false);
  const f = fixture({ enabled: APPOINTMENT_ADMIN_ENABLED });
  await f.panel.reload(); await f.panel.save(row.id, "em_contato");
  assert.deepEqual(f.calls, []);
  assert.match(f.target.innerHTML, /temporariamente indisponível/);
  assert.doesNotMatch(f.target.innerHTML, /example.invalid|data-appointment-save/);
});
test("visitante, usuário comum e administrador inativo não consultam contatos", async () => {
  for (const options of [{ signedIn: false }, { role: "visitor" }, { active: false }]) {
    const f = fixture(options); await f.panel.reload();
    assert.equal(f.calls.some(call => call[1] === "appointment_requests"), false);
    assert.equal(f.calls.some(call => call[1] === "appointment_slots"), false);
    assert.match(f.target.innerHTML, /Acesso administrativo necessário/);
  }
});
test("admin e owner autorizados: lista separada, campos escapados e quatro estados", async () => {
  for (const role of ["admin", "owner"]) {
    const f = fixture({ role }); f.response.list.data = [{ ...row, service: '<img src=x onerror="alert(1)">' }];
    await f.panel.reload();
    assert.match(f.target.innerHTML, /&lt;img/);
    assert.doesNotMatch(f.target.innerHTML, /<img/);
    for (const state of STATES) assert.ok(f.target.innerHTML.includes(`value="${state}"`));
    for (const value of [row.contact, "10/11/2026", "Tarde", "Pessoa fictícia", "Online", "limite de 100"]) assert.ok(f.target.innerHTML.includes(value));
    assert.match(f.target.innerHTML, /Solicitações não são reservas/);
    assert.deepEqual(f.calls.filter(call => call[0] === "order"), [
      ["order", "created_at", { ascending: false }], ["order", "id", { ascending: false }],
    ]);
  }
});

test("admin autenticado vincula o slot por held_by_request_id e mostra 19h readonly", async () => {
  const f = fixture({ role: "admin", reservationsEnabled: true });
  f.response.slots.data = [{
    id: "30000000-0000-4000-8000-000000000003",
    starts_at: "2026-11-12T22:00:00Z",
    ends_at: "2026-11-12T23:00:00Z",
    status: "held",
    held_by_request_id: row.id,
  }];
  await f.panel.reload();
  assert.match(f.target.innerHTML, /value="2026-11-12T19:00" readonly/);
  assert.match(f.target.innerHTML, /value="2026-11-12T20:00" readonly/);
  assert.ok(f.calls.some(call => call[0] === "select" && call[1] === "appointment_slots"));
});

test("mudança de estado pelo evento: somente status, revisão atômica e nenhum comando operacional", async () => {
  const f = fixture(); await f.panel.reload();
  f.handlers.change({ target: { dataset: { appointmentState: row.id }, value: "em_contato" } });
  const button = { dataset: { appointmentSave: row.id } };
  await f.handlers.click({ target: { closest: selector => selector === "[data-appointment-save]" ? button : null } });
  assert.deepEqual(f.calls.find(call => call[0] === "update"), ["update", { status: "em_contato" }]);
  assert.ok(f.calls.some(call => call[0] === "eq" && call[1] === "updated_at" && call[2] === row.updated_at));
  assert.match(f.target.innerHTML, /Estado de acompanhamento atualizado/);
  assert.match(f.target.innerHTML, /Nenhuma reserva foi criada ou confirmada/);
  const writes = f.calls.filter(call => call[0] === "update").length;
  await f.panel.save(row.id, "confirmada");
  assert.equal(f.calls.filter(call => call[0] === "update").length, writes);
});

test("conflito exige recarga; erro HTTP não vira sucesso e permite retry", async () => {
  for (const result of [{ data: null, error: null }, { data: null, error: { code: "503", message: "CORPO PRIVADO" } }]) {
    const f = fixture(); await f.panel.reload(); f.response.update = result;
    await f.panel.save(row.id, "em_contato");
    assert.match(f.target.innerHTML, /Recarregue/);
    assert.doesNotMatch(f.target.innerHTML, /CORPO PRIVADO|Estado de acompanhamento atualizado|example.invalid/);
    f.response.update = { data: { ...row, status: "em_contato" }, error: null };
    await f.panel.reload(); await f.panel.save(row.id, "em_contato");
    assert.match(f.target.innerHTML, /Estado de acompanhamento atualizado/);
  }
});

test("carregamento, duplo clique e sessão encerrada descartam resposta tardia", async () => {
  const f = fixture(); let release;
  f.response.list = new Promise(resolve => { release = resolve; });
  const pending = f.panel.reload();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(f.target.innerHTML, /Carregando solicitações/);
  await f.panel.reload();
  assert.equal(f.calls.filter(call => call[0] === "from" && call[1] === "appointment_requests").length, 1);
  f.panel.clear(); release({ data: [row], error: null }); await pending;
  assert.doesNotMatch(f.target.innerHTML, /example.invalid/);
});

test("lista vazia e falha de listagem com recuperação", async () => {
  const f = fixture(); f.response.list = { error: { message: "segredo" } };
  await f.panel.reload(); assert.match(f.target.innerHTML, /Não foi possível/);
  assert.doesNotMatch(f.target.innerHTML, /segredo/);
  f.response.list = { data: [], error: null }; await f.panel.reload();
  assert.match(f.target.innerHTML, /Nenhuma solicitação de atendimento recebida/);
});

test("401/403 e permissão negada limpam contatos e exigem novo acesso", async () => {
  for (const error of [{ code: "401" }, { code: "403" }, { code: "42501" }, { code: "PGRST301" }, { code: "PGRST999", status: 403 }]) {
    const f = fixture(); await f.panel.reload();
    assert.match(f.target.innerHTML, /example.invalid/);
    f.response.update = { data: null, error: { ...error, message: "Dado privado" } };
    await f.panel.save(row.id, "em_contato");
    assert.doesNotMatch(f.target.innerHTML, /example.invalid|Dado privado|data-appointment-reload/);
    assert.match(f.target.innerHTML, /Acesso administrativo necessário/);
  }
});

test("duplo clique em salvar não repete PATCH e mantém bloqueio durante a escrita", async () => {
  const f = fixture(); await f.panel.reload(); let release;
  f.response.update = new Promise(resolve => { release = resolve; });
  const saving = f.panel.save(row.id, "em_contato");
  await new Promise(resolve => setImmediate(resolve));
  assert.match(f.target.innerHTML, /Salvando estado/);
  await f.panel.save(row.id, "cancelada");
  assert.equal(f.calls.filter(call => call[0] === "update").length, 1);
  release({ data: { ...row, status: "em_contato" }, error: null }); await saving;
  assert.match(f.target.innerHTML, /Estado de acompanhamento atualizado/);
});

test("sessão perdida após listagem impede PATCH e remove contatos", async () => {
  const f = fixture(); await f.panel.reload();
  f.client.auth.getSession = async () => ({ data: { session: null } });
  await f.panel.save(row.id, "encerrada");
  assert.equal(f.calls.some(call => call[0] === "update"), false);
  assert.doesNotMatch(f.target.innerHTML, /example.invalid/);
});

test("adaptador rejeita revisão ausente e estados inválidos antes de escrever", async () => {
  const f = fixture();
  await assert.rejects(updateAppointmentRequestStatus(f.client, row.id, "confirmada", row.updated_at));
  await assert.rejects(updateAppointmentRequestStatus(f.client, row.id, "em_contato"));
  assert.deepEqual(f.calls, []);
});

test("integração preserva carregamento existente e não chama RPC operacional (estático)", () => {
  const read = path => readFileSync(new URL(`../../outputs/js/admin/${path}`, import.meta.url), "utf8");
  const views = read("operations/views.js");
  const dashboard = views.slice(views.indexOf("function dashboard"), views.indexOf("const DIA"));
  const reports = views.slice(views.indexOf("function reports"), views.indexOf("export function renderView"));
  assert.match(read("admin-entry.js"), /carregarRecebidos\(client\)/);
  assert.match(dashboard, /<div data-appointment-admin><\/div>/);
  assert.doesNotMatch(reports, /data-appointment-admin/);
  assert.doesNotMatch(read("appointment-panel.js") + read("appointment-requests.js"), /op_apply|op_snapshot|service_role/);
});

test("migration prepara RLS administrativa e revisão updated_at (inspeção estática)", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202610160001_appointment_requests.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /grant update \(status\) on public\.appointment_requests to authenticated/);
  assert.match(sql, /for select to authenticated using \(\(select public\.is_portal_admin\(\)\)\)/);
  assert.match(sql, /for update to authenticated using \(\(select public\.is_portal_admin\(\)\)\)/);
  assert.match(sql, /new\.updated_at := clock_timestamp\(\)/);
  assert.match(sql, /create trigger appointment_requests_touch before update on public\.appointment_requests/);
  assert.doesNotMatch(sql, /grant (select|update|delete) [^;]+ to anon/i);
});
