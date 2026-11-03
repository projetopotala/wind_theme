// Matriz de seguranca da D4 em Postgres real (PGlite, em memoria; nao toca o Supabase).
// Uso: instalar @electric-sql/pglite fora do repo e rodar: node d4-rooms-matrix.mjs <migration.sql>
// Nao faz parte de npm run test:portal para nao exigir a dependencia.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const MIG = process.argv[2];
const db = new PGlite();
const out = [];
const ok = (nome, cond, extra = "") => { out.push([cond ? "PASS" : "FAIL", nome, extra]); };

await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant usage on schema public to authenticated, anon;
create table public.op_records (collection text, id text, document jsonb default '{}', primary key (collection, id));
create function public.is_portal_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true), '') = auth.uid()::text $$;
create table public.appointment_requests (
  id uuid primary key default gen_random_uuid(), service text, modality text, requester_name text,
  status text default 'recebida', requester_user_id uuid, professional_profile_id text,
  reservation_schedule_id text, appointment_slot_id uuid);
create table public.appointment_slots (id uuid primary key default gen_random_uuid(), starts_at timestamptz, ends_at timestamptz, status text);
create table public.appointment_profile_accounts (user_id uuid primary key, profile_id text unique, active boolean default true);
create function public.is_appointment_professional(p_profile_id text) returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (select 1 from public.appointment_profile_accounts c join public.op_records p on p.collection='profiles' and p.id=c.profile_id
   where c.user_id=(select auth.uid()) and c.profile_id=p_profile_id and c.active and coalesce(p.document->'roles','[]'::jsonb) ? 'professional') $$;
`);
await db.exec(readFileSync(MIG, "utf8"));

const U = { cli: "00000000-0000-4000-8000-0000000000a1", pro: "00000000-0000-4000-8000-0000000000b2",
  intruso: "00000000-0000-4000-8000-0000000000c3", outroPro: "00000000-0000-4000-8000-0000000000d4", admin: "00000000-0000-4000-8000-0000000000e5" };
for (const id of Object.values(U)) await db.query("insert into auth.users values ($1)", [id]);
await db.exec(`insert into public.op_records values ('profiles','P1','{"roles":["professional"]}'),('profiles','P2','{"roles":["professional"]}')`);
await db.query("insert into public.appointment_profile_accounts values ($1,'P1'),($2,'P2')", [U.pro, U.outroPro]);

async function req({ inicioMin, fimMin, status = "encerrada", slot = "booked", modality = "online", reserva = "S1", prof = "P1", cliente = U.cli }) {
  const s = await db.query(`insert into public.appointment_slots(starts_at,ends_at,status) values (now() + ($1||' minutes')::interval, now() + ($2||' minutes')::interval, $3) returning id`, [inicioMin, fimMin, slot]);
  const r = await db.query(`insert into public.appointment_requests(service,modality,requester_name,status,requester_user_id,professional_profile_id,reservation_schedule_id,appointment_slot_id) values ('Reiki',$1,'Cliente Sintetico',$2,$3,$4,$5,$6) returning id`, [modality, status, cliente, prof, reserva, s.rows[0].id]);
  return r.rows[0].id;
}
async function como(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role authenticated;`);
  try { const r = await db.query(sql, params); await db.exec("reset role"); return { ok: true, v: r.rows[0] && Object.values(r.rows[0])[0] }; }
  catch (e) { await db.exec("reset role"); return { ok: false, code: e.code, msg: e.message }; }
}
const ctx = (uid, id) => como(uid, "select public.appointment_room_context($1) as c", [id]);
const emitir = (uid, id) => como(uid, "select public.issue_appointment_room_access($1) as c", [id]);
const postar = (uid, id, t) => como(uid, "select public.post_appointment_room_message($1,$2) as c", [id, t]);
const listar = (uid, id, a = 0) => como(uid, "select public.list_appointment_room_messages($1,$2) as c", [id, a]);
const fechar = (uid, id) => como(uid, "select public.close_appointment_room_session($1) as c", [id]);

const aberta = await req({ inicioMin: -5, fimMin: 40 });
// contexto/papÃ©is
ok("cliente vÃª papel client e estado open", (await ctx(U.cli, aberta)).v?.state === "open" && (await ctx(U.cli, aberta)).v?.role === "client");
ok("profissional vinculado vÃª papel professional", (await ctx(U.pro, aberta)).v?.role === "professional");
ok("terceiro autenticado => denied", (await ctx(U.intruso, aberta)).v?.state === "denied");
ok("outro profissional (nÃ£o vinculado) => denied", (await ctx(U.outroPro, aberta)).v?.state === "denied");
ok("admin nÃ£o participante => denied", (await ctx(U.admin, aberta)).v?.state === "denied");
ok("anÃ´nimo (sem uid) => denied", (await ctx("", aberta)).v?.state === "denied");
ok("id inexistente => denied", (await ctx(U.cli, "00000000-0000-4000-8000-00000000ffff")).v?.state === "denied");
// emissÃ£o
const e1 = await emitir(U.cli, aberta);
ok("cliente emite acesso", e1.ok && /^potala-[0-9a-f]{32}$/.test(e1.v.room_name) && e1.v.role === "client");
ok("expira no fim da janela (ends+30min)", e1.ok && Math.abs(new Date(e1.v.expires_at) - (Date.now() + 70 * 60e3)) < 120e3, e1.v?.expires_at);
ok("participant_id vem do banco (uid do chamador)", e1.v?.participant_id === U.cli);
const e2 = await emitir(U.pro, aberta);
ok("profissional recebe a MESMA sala", e2.ok && e2.v.room_name === e1.v.room_name && e2.v.role === "professional");
const n1 = await emitir(U.intruso, aberta);
ok("terceiro nÃ£o emite (42501)", !n1.ok && n1.code === "42501");
ok("anÃ´nimo nÃ£o emite (42501)", (await emitir("", aberta)).code === "42501");
// isolamento entre salas
const outra = await req({ inicioMin: -5, fimMin: 40, cliente: U.intruso, prof: "P2", reserva: "S2" });
const eo = await emitir(U.intruso, outra);
ok("salas distintas tÃªm nomes distintos", eo.ok && eo.v.room_name !== e1.v.room_name);
ok("participante de uma sala nÃ£o emite em outra (42501)", (await emitir(U.cli, outra)).code === "42501");
// estados
const cedo = await req({ inicioMin: 60, fimMin: 120, reserva: "S3" });
ok("cedo => too_early e sem emissÃ£o (P0001)", (await ctx(U.cli, cedo)).v?.state === "too_early" && (await emitir(U.cli, cedo)).code === "P0001");
const quase = await req({ inicioMin: 10, fimMin: 70, reserva: "S4" });
ok("15 min antes jÃ¡ abre", (await ctx(U.cli, quase)).v?.state === "open");
const velho = await req({ inicioMin: -200, fimMin: -100, reserva: "S5" });
ok("vencida => expired e sem emissÃ£o", (await ctx(U.cli, velho)).v?.state === "expired" && (await emitir(U.cli, velho)).code === "P0001");
const canc = await req({ inicioMin: -5, fimMin: 40, status: "cancelada", reserva: "S6" });
ok("pedido cancelado => cancelled e sem emissÃ£o", (await ctx(U.cli, canc)).v?.state === "cancelled" && (await emitir(U.cli, canc)).code === "P0001");
const rec = await req({ inicioMin: -5, fimMin: 40, status: "recebida", reserva: null });
ok("pedido nÃ£o confirmado => not_confirmed", (await emitir(U.cli, rec)).code === "P0001");
const presencial = await req({ inicioMin: -5, fimMin: 40, modality: "presencial", reserva: "S7" });
ok("presencial => sem sala", (await emitir(U.cli, presencial)).code === "P0001");
const slotCanc = await req({ inicioMin: -5, fimMin: 40, slot: "cancelled", reserva: "S8" });
ok("slot cancelado => sem sala", (await emitir(U.cli, slotCanc)).code === "P0001");
// chat
ok("terceiro nÃ£o posta (42501)", (await postar(U.intruso, aberta, "oi")).code === "42501");
ok("terceiro nÃ£o lÃª (42501)", (await listar(U.intruso, aberta)).code === "42501");
ok("cliente posta", (await postar(U.cli, aberta, "olÃ¡ <b>x</b>")).ok);
ok("profissional posta", (await postar(U.pro, aberta, "bom dia")).ok);
const l = await listar(U.pro, aberta);
ok("lista traz 2 mensagens, role correto, mine por chamador", l.ok && l.v.length === 2 && l.v[0].role === "client" && l.v[0].mine === false && l.v[1].mine === true);
ok("html Ã© guardado literal (escape Ã© da tela)", l.v?.[0].body === "olÃ¡ <b>x</b>");
ok("lista incremental (p_after)", (await listar(U.pro, aberta, l.v[0].id)).v.length === 1);
ok("chat isolado: outra sala nÃ£o vÃª as mensagens", (await listar(U.intruso, outra)).v.length === 0);
ok("mensagem vazia => 22023", (await postar(U.cli, aberta, "   ")).code === "22023");
ok("mensagem >1000 => 22023", (await postar(U.cli, aberta, "a".repeat(1001))).code === "22023");
ok("caractere de controle => 22023", (await postar(U.cli, aberta, "a\u0007b")).code === "22023");
ok("postar sem ter entrado (sem sessÃ£o) => P0001", (await postar(U.cli, quase, "oi")).code === "P0001");
ok("postar em sala cancelada => P0001", (await postar(U.cli, canc, "oi")).code === "P0001");
ok("ler chat de sala cancelada => P0001", (await listar(U.cli, canc)).code === "P0001");
// limite de taxa
let limitado = null;
for (let i = 0; i < 40 && !limitado; i++) { const r = await postar(U.cli, aberta, `m${i}`); if (!r.ok) limitado = r; }
ok("rate limit de mensagens => 54000", limitado?.code === "54000");
let lt = null;
for (let i = 0; i < 10 && !lt; i++) { const r = await emitir(U.pro, aberta); if (!r.ok) lt = r; }
ok("rate limit de token => 54000", lt?.code === "54000");
// encerramento
ok("cliente nÃ£o encerra (42501)", (await fechar(U.cli, aberta)).code === "42501");
ok("terceiro nÃ£o encerra (42501)", (await fechar(U.intruso, aberta)).code === "42501");
ok("profissional encerra", (await fechar(U.pro, aberta)).ok);
const msgs = await db.query("select count(*)::int c from public.appointment_room_messages m join public.appointment_room_sessions s on s.id=m.session_id join public.appointment_requests r on r.id=s.request_id where r.id=$1", [aberta]);
ok("encerrar apaga o chat", msgs.rows[0].c === 0);
ok("apÃ³s encerrar: closed, sem emissÃ£o e sem leitura", (await ctx(U.cli, aberta)).v?.state === "closed" && (await emitir(U.cli, aberta)).code === "P0001" && (await listar(U.cli, aberta)).code === "P0001");
// privilÃ©gios diretos
// repeticao do encerramento (recuperacao de revogacao pendente no provedor)
const de2 = await fechar(U.pro, aberta);
ok("profissional repete o encerramento numa sala ja encerrada (idempotente)", de2.ok && de2.v?.closed === true);
ok("repetir nao reabre a sala (continua closed, closed_by preservado)", (await ctx(U.pro, aberta)).v?.state === "closed" && (await db.query("select count(*)::int c from public.appointment_room_sessions where request_id=$1 and closed_at is not null and closed_by=$2", [aberta, U.pro])).rows[0].c === 1);
ok("apos fechada, cliente e terceiro continuam sem poder encerrar/emitir", (await fechar(U.cli, aberta)).code === "42501" && (await fechar(U.intruso, aberta)).code === "42501" && (await emitir(U.intruso, aberta)).code === "42501" && (await emitir(U.pro, aberta)).code === "P0001");for (const t of ["appointment_room_sessions", "appointment_room_messages", "appointment_room_access_log"]) {
  const r = await como(U.cli, `select count(*)::int c from public.${t}`);
  ok(`SELECT direto em ${t} negado`, !r.ok && r.code === "42501");
  const w = await como(U.cli, `delete from public.${t}`);
  ok(`DELETE direto em ${t} negado`, !w.ok && w.code === "42501");
}
const ins = await como(U.cli, "insert into public.appointment_room_messages(session_id,sender_id,sender_role,body) values (gen_random_uuid(),$1,'client','x')", [U.cli]);
ok("INSERT direto em mensagens negado", !ins.ok && ins.code === "42501");
await db.exec("reset role");
const anon = await db.query(`select has_function_privilege('anon','public.issue_appointment_room_access(uuid)','EXECUTE') a, has_function_privilege('anon','public.post_appointment_room_message(uuid,text)','EXECUTE') b, has_function_privilege('anon','public.appointment_room_context(uuid)','EXECUTE') c, has_function_privilege('anon','public.purge_expired_appointment_room_messages()','EXECUTE') d`);
ok("anon sem EXECUTE nas RPCs", Object.values(anon.rows[0]).every((v) => v === false));
const pur = await como(U.cli, "select public.purge_expired_appointment_room_messages() as c");
ok("purge negada a nÃ£o-admin", !pur.ok && pur.code === "42501");
await db.exec(`select set_config('test.admin','${U.admin}',false)`);
const pa = await como(U.admin, "select public.purge_expired_appointment_room_messages() as c");
ok("purge permitida a admin", pa.ok);
const sd = await db.query(`select proname, prosecdef, proconfig::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like '%appointment_room%'`);
ok("6 funÃ§Ãµes, todas SECURITY DEFINER com search_path vazio", sd.rows.length === 6 && sd.rows.every((r) => r.prosecdef && /search_path=/.test(r.proconfig) && /""/.test(r.proconfig)));
const rls = await db.query(`select relname, relrowsecurity from pg_class where relname like 'appointment_room_%' and relkind='r'`);
ok("RLS ligada nas 3 tabelas", rls.rows.length === 3 && rls.rows.every((r) => r.relrowsecurity));
const pol = await db.query(`select count(*)::int c from pg_policies where tablename like 'appointment_room_%'`);
ok("nenhuma policy (negaÃ§Ã£o por padrÃ£o)", pol.rows[0].c === 0);

for (const [s, n, x] of out) console.log(s, n, x);
const f = out.filter((o) => o[0] === "FAIL").length;
console.log(`\nTOTAL ${out.length} | PASS ${out.length - f} | FAIL ${f}`);
process.exit(f ? 1 : 0);

