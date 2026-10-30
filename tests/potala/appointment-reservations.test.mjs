import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { confirmAppointmentReservation, traduzirErroDaConfirmacao } from "../../outputs/js/admin/appointment-reservations.js";
import { createAppointmentPanel, renderAppointmentPanel, suggestedTime } from "../../outputs/js/admin/appointment-panel.js";

const requestId = "10000000-0000-4000-8000-000000000001";
const key = "20000000-0000-4000-8000-000000000002";
const updatedAt = "2026-10-22T12:00:00Z";

test("adaptador envia somente o contrato da RPC atômica e não inclui preço", async () => {
  const calls = [];
  const client = { async rpc(name, args) {
    calls.push([name, args]);
    return { data: { result: { request_id: requestId, schedule_id: "schedule-1", status: "encerrada" }, revision: 8 }, error: null };
  } };
  const result = await confirmAppointmentReservation(client, {
    requestId, expectedUpdatedAt: updatedAt, idempotencyKey: key,
    startsAt: "2026-11-10T14:00", endsAt: "2026-11-10T15:00", roomId: " sala-1 ", notes: " Confirmado ",
    offeringId: " o1 ", professionalProfileId: " p1 ", clientProfileId: " c1 ",
  });
  assert.equal(result.result.schedule_id, "schedule-1");
  assert.deepEqual(calls, [["confirm_appointment_request_reservation", {
    p_request_id: requestId,
    p_expected_updated_at: updatedAt,
    p_idempotency_key: key,
    p_schedule: { starts_at: "2026-11-10T17:00:00.000Z", ends_at: "2026-11-10T18:00:00.000Z", room_id: "sala-1", notes: "Confirmado", offering_id: "o1", professional_profile_id: "p1", client_profile_id: "c1" },
  }]]);
  assert.equal("price_cents" in calls[0][1].p_schedule, false);
});

test("adaptador bloqueia identificadores e horários inválidos antes da rede", async () => {
  let calls = 0;
  const client = { rpc: async () => { calls++; return {}; } };
  await assert.rejects(confirmAppointmentReservation(client, { requestId: "x", expectedUpdatedAt: updatedAt, idempotencyKey: key }), /Recarregue/);
  await assert.rejects(confirmAppointmentReservation(client, { requestId, expectedUpdatedAt: updatedAt, idempotencyKey: key, startsAt: "2026-11-10T15:00", endsAt: "2026-11-10T14:00" }), /posterior/);
  await assert.rejects(confirmAppointmentReservation(client, { requestId, expectedUpdatedAt: updatedAt, idempotencyKey: key,
    startsAt: "2026-11-12T18:00", endsAt: "2026-11-12T19:00", slotStartsAt: "2026-11-12T19:00", slotEndsAt: "2026-11-12T20:00" }), /slot solicitado/);
  assert.equal(calls, 0);
});

test("triagem usa o horário real do slot em São Paulo e preserva o legado sem slot", () => {
  const slot = (starts_at, ends_at) => ({ id: "30000000-0000-4000-8000-000000000003", starts_at, ends_at, status: "held", held_by_request_id: requestId });
  const row = { id: requestId, appointment_slot_id: "30000000-0000-4000-8000-000000000003" };
  assert.deepEqual(suggestedTime({ ...row, appointment_slot: slot("2026-11-12T22:00:00Z", "2026-11-12T23:00:00Z") }),
    { start: "2026-11-12T19:00", end: "2026-11-12T20:00", fromSlot: true });
  assert.deepEqual(suggestedTime({ ...row, appointment_slot: slot("2026-11-12T12:00:00Z", "2026-11-12T13:00:00Z") }),
    { start: "2026-11-12T09:00", end: "2026-11-12T10:00", fromSlot: true });
  assert.deepEqual(suggestedTime({ ...row, appointment_slot: slot("2026-11-12T17:00:00Z", "2026-11-12T18:00:00Z") }),
    { start: "2026-11-12T14:00", end: "2026-11-12T15:00", fromSlot: true });
  assert.deepEqual(suggestedTime({ preferred_date: "2026-11-12", preferred_period: "noite" }),
    { start: "2026-11-12T18:00", end: "2026-11-12T19:00", fromSlot: false });
});

test("conflito mantém semântica de recarga e resposta inconsistente não confirma", async () => {
  const conflict = { rpc: async () => ({ data: null, error: { code: "PT409", message: "interno" } }) };
  await assert.rejects(confirmAppointmentReservation(conflict, {
    requestId, expectedUpdatedAt: updatedAt, idempotencyKey: key, startsAt: "2026-11-10T14:00", endsAt: "2026-11-10T15:00",
  }), error => error.code === "APPOINTMENT_CONFLICT" && !/interno/.test(error.message));
  const inconsistent = { rpc: async () => ({ data: { result: {} }, error: null }) };
  await assert.rejects(confirmAppointmentReservation(inconsistent, {
    requestId, expectedUpdatedAt: updatedAt, idempotencyKey: key, startsAt: "2026-11-10T14:00", endsAt: "2026-11-10T15:00",
  }), /não foi confirmada/);
});

test("erro de vínculo do cliente é distinguido sem expor detalhes do banco", async () => {
  const client = { rpc: async () => ({ data: null, error: {
    code: "PT422", message: "e-mail privado e detalhes internos",
  } }) };
  await assert.rejects(confirmAppointmentReservation(client, {
    requestId, expectedUpdatedAt: updatedAt, idempotencyKey: key,
    startsAt: "2026-11-10T14:00", endsAt: "2026-11-10T15:00",
  }), error => error.code === "APPOINTMENT_CLIENT_LINK"
    && /cadastro operacional/.test(error.message)
    && !/e-mail privado|detalhes internos/.test(error.message));
});

test("painel exige seleção explícita para pedido público e confirmação explícita", () => {
  const operationalState = { rooms: [{ id: "r1", name: "Sala 1", status: "available", capacity: 2 }], activity_offerings: [{ id: "o1", title: "Reiki", active: true }], profiles: [{ id: "p1", display_name: "Profissional", roles: ["professional"], active: true }, { id: "c1", display_name: "Cliente", roles: ["client"], active: true }] };
  const base = { phase: "ready", message: "", busy: false, drafts: {}, operationalState, reservationsEnabled: true };
  const legacy = renderAppointmentPanel({ ...base, rows: [{ id: requestId, service: "Reiki", modality: "presencial", requester_name: "Pessoa", contact_type: "email", contact: "x@example.invalid", preferred_date: "2026-11-10", preferred_period: "tarde", status: "recebida", created_at: updatedAt }] });
  assert.match(legacy, /não associa pelo nome do serviço/);
  assert.match(legacy, /data-reservation-offering/);
  assert.match(legacy, /data-reservation-professional/);
  assert.match(legacy, /data-reservation-client/);
  assert.match(legacy, /data-appointment-confirm/);
  const linked = renderAppointmentPanel({ ...base, rows: [{ id: requestId, service: "Reiki", modality: "presencial", requester_name: "Pessoa", contact_type: "email", contact: "x@example.invalid", preferred_date: "2026-11-10", preferred_period: "tarde", status: "recebida", offering_id: "o1", professional_profile_id: "p1", created_at: updatedAt }] });
  assert.match(linked, /data-reservation-confirm/);
  assert.match(linked, /data-reservation-room/);
  assert.match(linked, /Confirmar reserva/);
});

test("painel autoriza antes da RPC e preserva a chave numa tentativa repetida", async () => {
  const row = { id: requestId, service: "Reiki", modality: "online", requester_name: "Pessoa", contact_type: "email", contact: "x@example.invalid", preferred_date: "2026-11-10", preferred_period: "tarde", status: "recebida", offering_id: "o1", professional_profile_id: "p1", created_at: updatedAt, updated_at: updatedAt };
  const target = { innerHTML: "", querySelector: () => ({ focus() {} }) };
  const root = { querySelector: () => target, addEventListener() {}, removeEventListener() {} };
  const client = { from() { const query = { select() { return query; }, order() { return query; }, limit: async () => ({ data: [row], error: null }) }; return query; } };
  const keys = [];
  let attempt = 0;
  const panel = createAppointmentPanel({
    root, client, enabled: true, reservationsEnabled: true, id: () => key,
    access: async () => ({ state: "authorized" }),
    confirmReservation: async (_client, input) => {
      keys.push(input.idempotencyKey);
      if (!attempt++) throw new Error("falha temporária");
      return { result: { request_id: requestId, schedule_id: "schedule-1" } };
    },
  });
  await panel.reload();
  await panel.confirm(requestId, { start: "2026-11-10T14:00", end: "2026-11-10T15:00" });
  await panel.reload();
  await panel.confirm(requestId, { start: "2026-11-10T14:00", end: "2026-11-10T15:00" });
  assert.deepEqual(keys, [key, key]);

  let unauthorizedCalls = 0;
  const forbidden = createAppointmentPanel({ root, client, enabled: true, reservationsEnabled: true, access: async () => ({ state: "forbidden" }), confirmReservation: async () => { unauthorizedCalls++; } });
  await forbidden.reload();
  await forbidden.confirm(requestId, { start: "2026-11-10T14:00", end: "2026-11-10T15:00" });
  assert.equal(unauthorizedCalls, 0);

  const linkFailure = createAppointmentPanel({
    root, client, enabled: true, reservationsEnabled: true,
    access: async () => ({ state: "authorized" }),
    confirmReservation: async () => { throw Object.assign(new Error("detalhe privado"), { code: "APPOINTMENT_CLIENT_LINK" }); },
  });
  await linkFailure.reload();
  await linkFailure.confirm(requestId, { start: "2026-11-10T14:00", end: "2026-11-10T15:00" });
  assert.match(target.innerHTML, /vínculo operacional válido/);
  assert.doesNotMatch(target.innerHTML, /detalhe privado|agenda mudou/);
});

test("flag de reservas permanece fechada mesmo com a triagem administrativa disponível", async () => {
  const config = readFileSync(new URL("../../outputs/js/appointments/config.js", import.meta.url), "utf8");
  assert.match(config, /APPOINTMENT_RESERVATIONS_ENABLED\s*=\s*false/);
  const markup = renderAppointmentPanel({ rows: [], phase: "ready", message: "", busy: false, drafts: {}, reservationsEnabled: false });
  assert.doesNotMatch(markup, /data-appointment-confirm|data-appointment-reservation/);
});

test("migration liga solicitação e agenda na mesma transação com autorização e concorrência", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202610220001_appointment_request_reservations.sql", import.meta.url), "utf8");
  assert.match(sql, /begin;[\s\S]*commit;\s*$/i);
  assert.match(sql, /if actor_id is null or not public\.is_portal_admin\(\)/i);
  assert.match(sql, /from public\.op_meta where id = 1 for update/i);
  assert.match(sql, /from public\.appointment_requests[\s\S]*where id = p_request_id for update/i);
  assert.match(sql, /reservation_schedule_id is not null[\s\S]*PT409/i);
  assert.match(sql, /Selecione oferta e profissional operacionais/i);
  assert.match(sql, /diverge da solicitação autenticada/i);
  assert.match(sql, /Modalidade incompatível com a oferta/i);
  assert.match(sql, /Profissional não vinculado à oferta/i);
  assert.match(sql, /start_at <= clock_timestamp\(\)/i);
  assert.match(sql, /America\/Sao_Paulo/i);
  assert.match(sql, /maintenance\.collection = 'maintenance_orders'/i);
  assert.match(sql, /lower\(document ->> 'email'\) = lower\(request\.contact\)/i);
  assert.match(sql, /client_matches <> 1[\s\S]*cadastro operacional inequívoco/i);
  assert.match(sql, /insert into public\.op_records \(collection, id, document, updated_at\)[\s\S]*'schedule_items'/i);
  assert.match(sql, /set offering_id = selected_offering_id[\s\S]*reservation_schedule_id = schedule_id[\s\S]*status = 'encerrada'/i);
  assert.match(sql, /appointment_request_id/i);
  assert.match(sql, /create unique index op_records_schedule_appointment_request_uidx/i);
  assert.match(sql, /validate_appointment_reservation_link/i);
  assert.match(sql, /op_records_validate_before_write/i);
  assert.match(sql, /grant select \(offering_id, professional_profile_id, reservation_schedule_id, reservation_confirmed_at\)[\s\S]*to authenticated/i);
  assert.match(sql, /appointment_request_id' is distinct from old\.document ->> 'appointment_request_id'[\s\S]*vínculo da reserva/i);
  assert.match(sql, /migration separada[\s\S]*conceder EXECUTE a authenticated[\s\S]*ativação da flag/i);
  assert.match(sql, /revoke all on function public\.confirm_appointment_request_reservation[\s\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /grant execute on function public\.confirm_appointment_request_reservation/i);
  assert.doesNotMatch(sql, /insert into public\.op_records[\s\S]*'financial_entries'/i);
  assert.doesNotMatch(sql, /service_role/i);
});

test("guarda transacional exige que schedule_items corresponda ao slot vinculado", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202610290006_appointment_slot_confirmation_guard.sql", import.meta.url), "utf8");
  assert.match(sql, /request\.appointment_slot_id is null[\s\S]*return new/i);
  assert.match(sql, /slot\.held_by_request_id is distinct from request\.id/i);
  assert.match(sql, /slot\.status not in \('held', 'booked'\)/i);
  assert.match(sql, /document_start is distinct from slot\.starts_at/i);
  assert.match(sql, /document_end is distinct from slot\.ends_at/i);
  assert.match(sql, /before insert or update of document on public\.op_records/i);
  assert.match(sql, /revoke all on function public\.validate_appointment_schedule_slot_match\(\) from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /service_role|disable row level security|grant execute/i);
});

test("migration vincula somente identidade autenticada confirmada e preserva o núcleo transacional", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261030072001_appointment_authenticated_client_link.sql", import.meta.url), "utf8");
  assert.match(sql, /rename to confirm_appointment_request_reservation_core/i);
  assert.match(sql, /if actor_id is null or not public\.is_portal_admin\(\)/i);
  assert.match(sql, /usuario\.email_confirmed_at/i);
  assert.match(sql, /request\.contact_type is distinct from 'email'[\s\S]*request\.contact[\s\S]*auth_email/i);
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*appointment-client-email:/i);
  assert.match(sql, /from public\.appointment_profile_accounts[\s\S]*user_id = request\.requester_user_id/i);
  assert.match(sql, /profile_matches > 1[\s\S]*cadastros operacionais duplicados/i);
  assert.match(sql, /profile_matches = 1[\s\S]*roles'[\s\S]*client/i);
  assert.match(sql, /profile_id := request\.requester_user_id::text[\s\S]*insert into public\.op_records[\s\S]*'profiles'/i);
  assert.match(sql, /insert into public\.appointment_profile_accounts \(user_id, profile_id, active\)/i);
  assert.match(sql, /unique_violation[\s\S]*vinculado a outra conta/i);
  assert.match(sql, /request\.requester_user_id is null[\s\S]*confirm_appointment_request_reservation_core/i);
  assert.match(sql, /jsonb_set\(p_schedule, '\{client_profile_id\}', to_jsonb\(profile_id\), true\)/i);
  assert.match(sql, /revoke all on function public\.confirm_appointment_request_reservation_core[\s\S]*public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.confirm_appointment_request_reservation[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql, /disable row level security|service_role|raw_user_meta_data/i);
});

test("projeção administrativa vincula o slot protegido pela RLS sem depender da coluna não concedida", () => {
  const source = readFileSync(new URL("../../outputs/js/admin/appointment-requests.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /const FIELDS = [^\n]*appointment_slot_id/);
  assert.match(source, /from\("appointment_slots"\)\.select\(SLOT_FIELDS\)/);
  assert.match(source, /slotByRequest\.get\(row\.id\)/);
  assert.match(source, /appointment_slot_id: appointment_slot\?\.id \|\| null/);
});

/* ETAPA D: cada SQLSTATE pede uma acao diferente de quem opera. Um 22023 e
   validacao de dados, nao concorrencia: traduzi-lo como "recarregue" faria o
   administrador repetir uma tentativa que falharia pelo mesmo motivo. */
test("cada SQLSTATE vira uma orientacao propria, sem vazar a mensagem do banco", () => {
  const sigiloso = "coluna op_records.document detalhe interno do servidor";
  const esperado = [
    ["PT409", "APPOINTMENT_CONFLICT", /Recarregue antes de confirmar/],
    ["PT422", "APPOINTMENT_CLIENT_LINK", /cadastro operacional/],
    ["42501", "APPOINTMENT_FORBIDDEN", /não permite confirmar/],
    ["P0002", "APPOINTMENT_MISSING", /não está mais acessível/],
    ["23514", "APPOINTMENT_UNAVAILABLE", /não está disponível/],
    ["23503", "APPOINTMENT_LINK_LOCKED", /não pode ser alterado/],
    ["55000", "APPOINTMENT_NOT_READY", /não está inicializada/],
    ["22023", "APPOINTMENT_INVALID", /Revise os dados/],
    ["PGRST301", "APPOINTMENT_SESSION", /sessão expirou/],
    ["XX000", "APPOINTMENT_FAILED", /Tente novamente/],
  ];
  for (const [sqlstate, codigo, frase] of esperado) {
    const erro = traduzirErroDaConfirmacao({ code: sqlstate, message: sigiloso });
    assert.equal(erro.code, codigo, `SQLSTATE ${sqlstate}`);
    assert.match(erro.message, frase);
    assert.doesNotMatch(erro.message, /op_records|interno do servidor|SQLSTATE/i);
  }
});

test("22023 nao e tratado como concorrencia e 401 vira sessao expirada", () => {
  const validacao = traduzirErroDaConfirmacao({ code: "22023", message: "x" });
  assert.equal(validacao.code, "APPOINTMENT_INVALID");
  assert.doesNotMatch(validacao.message, /Recarregue|mudou/i);
  assert.equal(traduzirErroDaConfirmacao({ status: 401 }).code, "APPOINTMENT_SESSION");
  assert.equal(traduzirErroDaConfirmacao({}).code, "APPOINTMENT_FAILED");
  assert.equal(traduzirErroDaConfirmacao(null).code, "APPOINTMENT_FAILED");
});

test("o painel mostra uma orientacao distinta por tipo de falha", async () => {
  const casos = [
    ["APPOINTMENT_FORBIDDEN", /não permite confirmar/],
    ["APPOINTMENT_SESSION", /sessão expirou/],
    ["APPOINTMENT_UNAVAILABLE", /não está disponível/],
    ["APPOINTMENT_INVALID", /Revise os dados/],
  ];
  const row = { id: requestId, service: "Reiki", modality: "online", requester_name: "Pessoa", contact_type: "email", contact: "x@example.invalid", preferred_date: "2026-11-10", preferred_period: "tarde", status: "recebida", offering_id: "o1", professional_profile_id: "p1", created_at: updatedAt, updated_at: updatedAt };
  for (const [codigo, frase] of casos) {
    const target = { innerHTML: "", querySelector: () => ({ focus() {} }) };
    const root = { querySelector: () => target, addEventListener() {}, removeEventListener() {} };
    const client = { from() { const query = { select() { return query; }, order() { return query; }, limit: async () => ({ data: [row], error: null }) }; return query; } };
    const painel = createAppointmentPanel({
      root, client, enabled: true, reservationsEnabled: true,
      access: async () => ({ state: "authorized" }),
      confirmReservation: async () => { throw Object.assign(new Error("detalhe privado do banco"), { code: codigo }); },
    });
    await painel.reload();
    await painel.confirm(requestId, { start: "2026-11-10T14:00", end: "2026-11-10T15:00" });
    assert.match(target.innerHTML, frase, codigo);
    assert.doesNotMatch(target.innerHTML, /detalhe privado do banco/);
  }
});
