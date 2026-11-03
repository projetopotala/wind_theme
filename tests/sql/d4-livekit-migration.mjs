// Migration incremental do LiveKit em Postgres real (PGlite, em memória; não toca o Supabase).
// Uso: instalar @electric-sql/pglite fora do repo e rodar:
//   node d4-livekit-migration.mjs <202611020001...sql> <202611030001...sql>
// Fora de npm run test:portal para não exigir a dependência.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const [BASE, LIVEKIT] = process.argv.slice(2);
const db = new PGlite();
const out = [];
const ok = (nome, cond, extra = "") => out.push([cond ? "PASS" : "FAIL", nome, extra]);
const falha = async (sql, params = []) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };

await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon, service_role; grant usage on schema public to authenticated, anon, service_role;
create table public.op_records (collection text, id text, document jsonb default '{}', primary key (collection, id));
create function public.is_portal_admin() returns boolean language sql stable as $$ select false $$;
create table public.appointment_requests (id uuid primary key default gen_random_uuid(), service text, modality text, requester_name text,
  status text default 'recebida', requester_user_id uuid, professional_profile_id text, reservation_schedule_id text, appointment_slot_id uuid);
create table public.appointment_slots (id uuid primary key default gen_random_uuid(), starts_at timestamptz, ends_at timestamptz, status text);
create table public.appointment_profile_accounts (user_id uuid primary key, profile_id text unique, active boolean default true);
create function public.is_appointment_professional(p text) returns boolean language sql stable as $$ select false $$;
`);
await db.exec(readFileSync(BASE, "utf8"));

const CLI = "00000000-0000-4000-8000-0000000000a1";
await db.query("insert into auth.users values ($1)", [CLI]);
async function pedido(inicioMin, fimMin, status = "encerrada") {
  const s = await db.query(`insert into public.appointment_slots(starts_at,ends_at,status) values (now() + ($1||' minutes')::interval, now() + ($2||' minutes')::interval, 'booked') returning id`, [inicioMin, fimMin]);
  const r = await db.query(`insert into public.appointment_requests(service,modality,requester_name,status,requester_user_id,professional_profile_id,reservation_schedule_id,appointment_slot_id) values ('Reiki','online','C',$1,$2,'P1','S1',$3) returning id`, [status, CLI, s.rows[0].id]);
  return r.rows[0].id;
}
const sessao = async (reqId, provider, nome, fechada = false) =>
  (await db.query(`insert into public.appointment_room_sessions(request_id, provider, provider_room_name, closed_at) values ($1,$2,$3, ${fechada ? "now()" : "null"}) returning id`, [reqId, provider, nome])).rows[0].id;

// Histórico Daily anterior à migration.
const rDaily = await pedido(-30, 30);
const sDaily = await sessao(rDaily, "daily", "potala-" + "d".repeat(32));
ok("pré: sessão Daily existe e 'livekit' ainda é recusado", (await falha("insert into public.appointment_room_sessions(request_id, provider, provider_room_name) values ($1,'livekit',$2)", [await pedido(-30, 30), "potala-" + "e".repeat(32)])) !== null);

await db.exec(readFileSync(LIVEKIT, "utf8"));

ok("histórico Daily preservado e legível", (await db.query("select provider, revoked_at from public.appointment_room_sessions where id=$1", [sDaily])).rows[0].provider === "daily");
const rLk = await pedido(-30, 30);
const sLk = await sessao(rLk, "livekit", "potala-" + "1".repeat(32));
ok("'livekit' aceito", !!sLk);
ok("provedor desconhecido recusado", (await falha("insert into public.appointment_room_sessions(request_id, provider, provider_room_name) values ($1,'zoom',$2)", [await pedido(-30, 30), "potala-" + "2".repeat(32)])) !== null);
ok("nome de sala continua restrito", (await falha("insert into public.appointment_room_sessions(request_id, provider, provider_room_name) values ($1,'livekit','sala-qualquer')", [await pedido(-30, 30)])) !== null);
const sPadrao = (await db.query("insert into public.appointment_room_sessions(request_id, provider_room_name) values ($1,$2) returning provider", [await pedido(-30, 30), "potala-" + "3".repeat(32)])).rows[0].provider;
ok("novas sessões nascem 'livekit' por padrão", sPadrao === "livekit");
ok("revoked_at nasce nulo", (await db.query("select revoked_at from public.appointment_room_sessions where id=$1", [sLk])).rows[0].revoked_at === null);

// Fila de revogação: encerrada, vencida, cancelada; aberta e Daily ficam de fora.
const rFech = await pedido(-30, 30); const sFech = await sessao(rFech, "livekit", "potala-" + "4".repeat(32), true);
const rVenc = await pedido(-200, -100); const sVenc = await sessao(rVenc, "livekit", "potala-" + "5".repeat(32));
const rCanc = await pedido(-30, 30, "cancelada"); const sCanc = await sessao(rCanc, "livekit", "potala-" + "6".repeat(32));
const rDailyFech = await pedido(-30, 30); await sessao(rDailyFech, "daily", "potala-" + "7".repeat(32), true);
const fila = async () => (await db.query("select session_id from public.appointment_rooms_pending_revocation(50)")).rows.map((r) => r.session_id);
let f = await fila();
ok("fila: encerrada, vencida e cancelada entram", [sFech, sVenc, sCanc].every((s) => f.includes(s)));
ok("fila: sala aberta (dentro da janela) NÃO entra", !f.includes(sLk) && !f.includes(sPadrao));
ok("fila: histórico Daily não entra", !f.includes(sDaily));
ok("mark: sala aberta não pode ser marcada como revogada", (await db.query("select public.mark_appointment_room_revoked($1) as r", [sLk])).rows[0].r === false);
ok("mark: encerrada é marcada e sai da fila", (await db.query("select public.mark_appointment_room_revoked($1) as r", [sFech])).rows[0].r === true && !(await fila()).includes(sFech));
ok("mark: idempotente (mantém o primeiro instante)", await (async () => {
  const a = (await db.query("select revoked_at from public.appointment_room_sessions where id=$1", [sFech])).rows[0].revoked_at;
  await db.query("select public.mark_appointment_room_revoked($1)", [sFech]);
  return +a === +(await db.query("select revoked_at from public.appointment_room_sessions where id=$1", [sFech])).rows[0].revoked_at;
})());
ok("fila respeita o limite", (await db.query("select count(*)::int n from public.appointment_rooms_pending_revocation(1)")).rows[0].n === 1);

// Privilégios.
for (const papel of ["anon", "authenticated"]) {
  await db.exec(`set role ${papel}`);
  ok(`${papel}: não executa a fila`, (await falha("select * from public.appointment_rooms_pending_revocation(5)")) !== null);
  ok(`${papel}: não marca revogação`, (await falha("select public.mark_appointment_room_revoked($1)", [sLk])) !== null);
  await db.exec("reset role");
}
await db.exec("set role service_role");
ok("service_role executa a fila e a marcação", (await falha("select * from public.appointment_rooms_pending_revocation(5)")) === null && (await falha("select public.mark_appointment_room_revoked($1)", [sVenc])) === null);
await db.exec("reset role");

// A emissão passa a criar sessão LiveKit.
await db.exec(`insert into public.op_records values ('profiles','P1','{}')`);
const rEmit = await pedido(-5, 40);
await db.exec(`set request.jwt.claim.sub = '${CLI}'`);
await db.exec("set role authenticated");
const emitido = await db.query("select public.issue_appointment_room_access($1) as r", [rEmit]).catch((e) => ({ erro: e.message }));
await db.exec("reset role");
ok("emissão cria sessão com provider 'livekit' e devolve participante", emitido.rows?.[0]?.r?.provider === "livekit" && emitido.rows[0].r.participant_id === CLI, emitido.erro ?? "");

for (const [estado, nome, extra] of out) console.log(estado, nome, extra);
console.log(`\nTOTAL ${out.length} | PASS ${out.filter((r) => r[0] === "PASS").length} | FAIL ${out.filter((r) => r[0] === "FAIL").length}`);
