import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { criarDadosSupabase } from "../../outputs/js/conta/adaptadores/supabase.js";
import { createAppointmentSlot } from "../../outputs/js/admin/appointment-slots.js";
import atendimentos from "../../outputs/js/conta/spa/vistas/atendimentos.js";

const migrationUrl = new URL("../../supabase/migrations/202610290004_real_appointment_slots.sql", import.meta.url);

test("migration reutiliza profissionais, ofertas, solicitações e agenda existentes", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const dependency of ["appointment_requests", "op_records", "submit_authenticated_appointment_request", "confirm_appointment_request_reservation"]) {
    assert.match(sql, new RegExp(`to_reg(?:class|procedure)\\('public\\.${dependency}`));
  }
  assert.doesNotMatch(sql, /create table public\.(profiles|activity_offerings|schedule_items)/i);
  assert.match(sql, /create table public\.appointment_slots/i);
  assert.match(sql, /create unique index appointment_requests_active_slot_uidx/i);
});

test("solicitação de horário é serializada e idempotente no banco", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /from public\.appointment_slots where id = p_slot_id for update/i);
  assert.match(sql, /where idempotency_key = p_idempotency_key/i);
  assert.match(sql, /requester_user_id is distinct from actor[\s\S]*appointment_slot_id is distinct from p_slot_id/i);
  assert.match(sql, /exception when unique_violation[\s\S]*PT409/i);
  assert.match(sql, /status = 'held', held_by_request_id = request_id/i);
});

test("RLS fecha tabelas e expõe somente RPCs autenticadas intencionais", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /alter table public\.appointment_slots enable row level security/i);
  assert.match(sql, /revoke all on table public\.appointment_slots from public, anon, authenticated/i);
  assert.match(sql, /revoke all on table public\.appointment_request_events from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.submit_appointment_slot_request\(uuid,uuid\) to authenticated/i);
  assert.doesNotMatch(sql, /grant execute on function public\.submit_appointment_slot_request\([^;]+to anon/i);
});

test("profissional desativado ou não publicado não oferece nem recebe horário", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /p\.document ->> 'active'[\s\S]*p\.document ->> 'published'/i);
  assert.match(sql, /raise exception 'Profissional indisponível.'/i);
});

test("horários presenciais respeitam sala e agenda operacional antes de serem publicados", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /Selecione uma sala para o atendimento presencial/);
  assert.match(sql, /Sala indisponível/);
  assert.match(sql, /Horário fora do funcionamento da sala/);
  assert.match(sql, /schedule\.collection='schedule_items'[\s\S]*O horário conflita com a agenda operacional/);
});

test("cliente só cancela o próprio pedido ainda não confirmado", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /r\.requester_user_id is distinct from \(select auth\.uid\(\)\)/i);
  assert.match(sql, /r\.status not in \('recebida','em_contato'\)[\s\S]*r\.reservation_schedule_id is not null/i);
  assert.match(sql, /status='available', held_by_request_id=null/i);
});

test("histórico não duplica o cancelamento iniciado pelo próprio cliente", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /if \(select public\.is_portal_admin\(\)\) then[\s\S]*'rejected'/i);
  assert.match(sql, /'cancelled',r\.status,'cancelada'/i);
});

test("adaptador usa a RPC atômica e valida recibo", async () => {
  const calls = [];
  const client = { from() {}, async rpc(name, args) { calls.push([name, args]); return { data: { id: "30000000-0000-4000-8000-000000000003", status: "recebida" }, error: null }; } };
  const data = criarDadosSupabase({ client });
  const result = await data.solicitarHorarioAtendimento({ idempotencia: "20000000-0000-4000-8000-000000000002", horarioId: "10000000-0000-4000-8000-000000000001" });
  assert.equal(result.status, "recebida");
  assert.deepEqual(calls, [["submit_appointment_slot_request", { p_idempotency_key: "20000000-0000-4000-8000-000000000002", p_slot_id: "10000000-0000-4000-8000-000000000001" }]]);
});

test("Mesa cria horário somente após recibo do backend", async () => {
  const calls = [];
  const client = { async rpc(name, args) { calls.push([name, args]); return { data: { id: "slot-1", status: "available" }, error: null }; } };
  const saved = await createAppointmentSlot(client, { offeringId: "offer-1", professionalProfileId: "prof-1", startsAt: "2027-01-12T14:00", endsAt: "2027-01-12T15:00" });
  assert.equal(saved.id, "slot-1");
  assert.equal(calls[0][0], "create_appointment_slot");
});

test("Meu Potala mostra apenas horários reais ligados a ofertas", () => {
  const html = atendimentos.renderizar({ atendimentoDisponivel: true,
    opcoesAtendimento: [{ id: "offer-1", service: "Reiki", professional: "Ana" }],
    horariosAtendimento: [{ id: "slot-1", offering_id: "offer-1", starts_at: "2027-01-12T17:00:00Z" }, { id: "slot-x", offering_id: "other", starts_at: "2027-01-12T18:00:00Z" }] });
  assert.match(html, /value="slot-1"/);
  assert.doesNotMatch(html, /slot-x/);
  assert.match(html, /ainda não é uma consulta confirmada|só entra na Agenda depois da confirmação/);
});
