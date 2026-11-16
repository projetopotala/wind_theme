/* Teste isolado da PR #78 em PostgreSQL real, com conexoes independentes. */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = process.argv[2] || "C:/Program Files/PostgreSQL/17/bin";
const PORT = 55478;
const root = new URL("../", import.meta.url);
const dir = new URL("supabase/migrations/", root);
const temp = mkdtempSync(join(tmpdir(), "potala-pr78-pg-"));
const data = join(temp, "data");
const exe = (name) => join(BIN, `${name}.exe`);
const args = ["-h", "127.0.0.1", "-p", String(PORT), "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-At"];

function run(name, argv, options = {}) {
  const result = spawnSync(exe(name), argv, { encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(`${name}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function sql(text) { return run("psql", [...args, "-c", text]); }
function file(text) {
  const path = join(temp, `migration-${Math.random().toString(16).slice(2)}.sql`);
  writeFileSync(path, text);
  run("psql", [...args, "-f", path]);
}
function session(text, delay = 0) {
  return new Promise((resolve) => setTimeout(() => {
    const child = spawn(exe("psql"), [...args, "-c", text]);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ ok: code === 0, stderr }));
  }, delay));
}

const OWNER = "00000000-0000-0000-0000-0000000000a1";
const A1 = "00000000-0000-0000-0000-0000000000c1";
const A2 = "00000000-0000-0000-0000-0000000000c2";

try {
  run("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"]);
  const start = spawnSync(exe("pg_ctl"), ["-D", data, "-o", `-p ${PORT} -c listen_addresses=127.0.0.1`, "-l", join(temp, "postgres.log"), "-w", "start"], { stdio: "ignore" });
  if (start.status !== 0) throw new Error("PostgreSQL temporario nao iniciou");
  file(`
    create extension pgcrypto;
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create schema extensions; create schema storage;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz default now(), deleted_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
    create table storage.buckets(id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text, metadata jsonb);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
  `);
  for (const name of readdirSync(dir).sort()) file(readFileSync(new URL(name, dir), "utf8"));
  file(`
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    insert into auth.users(id,email) values ('${OWNER}','owner@potala.test'),('${A1}','a1@potala.test'),('${A2}','a2@potala.test');
    insert into public.users(id,role,name,email) values ('${OWNER}','owner','Owner','owner@potala.test');
    insert into public.op_records(collection,id,document) values
      ('profiles','prof','{"id":"prof","display_name":"TESTE INTERNO Profissional","roles":["professional"],"active":true}'),
      ('profiles','manual','{"id":"manual","display_name":"TESTE INTERNO Manual","roles":["student"],"active":true}'),
      ('activity_definitions','curso','{"id":"curso","title":"TESTE INTERNO Curso","kind":"course","summary":"Teste","published":true,"price_cents":0}'),
      ('activity_offerings','turma','{"id":"turma","title":"TESTE INTERNO Turma","definition_id":"curso","professional_id":"prof","mode":"online","capacity":1,"summary":"Teste","published":true,"price_cents":0}'),
      ('schedule_items','aula','{"id":"aula","title":"TESTE INTERNO Aula","kind":"course","offering_id":"turma","mode":"online","professional_id":"prof","starts_at":"2036-01-01T10:00:00Z","ends_at":"2036-01-01T11:00:00Z","status":"booked"}');
  `);

  const request = (uid, key) => `set test.uid='${uid}'; set role authenticated; begin; select public.request_course_enrollment('${key}'::uuid,'turma'); select pg_sleep(1); commit;`;
  const [r1, r2] = await Promise.all([
    session(request(A1, "11111111-0000-4000-8000-000000000001")),
    session(request(A2, "22222222-0000-4000-8000-000000000002"), 100),
  ]);
  const requests = Number(sql("select count(*) from public.course_enrollment_requests where offering_id='turma' and status in ('solicitada','aguardando_pagamento','pagamento_confirmado','matriculada')"));
  if ([r1, r2].filter((x) => x.ok).length !== 1 || requests !== 1) throw new Error(`aluno x aluno falhou: sucessos=${[r1, r2].filter((x) => x.ok).length}, vagas=${requests}; ${r1.stderr}; ${r2.stderr}`);
  console.log("PASS aluno x aluno: uma unica solicitacao ocupou a ultima vaga");

  sql("truncate public.course_enrollment_request_events, public.course_enrollment_requests restart identity cascade");
  const revision = Number(sql("select revision from public.op_meta where id=1"));
  const manual = `set test.uid='${OWNER}'; set role authenticated; begin; select public.op_apply(${revision},'pr78-manual','enrollment.save','{}'::jsonb,null,'[{"table":"enrollments","id":"manual-1","after":{"id":"manual-1","profile_id":"manual","offering_id":"turma","status":"active"}}]'::jsonb); select pg_sleep(1); commit;`;
  const [student, owner] = await Promise.all([
    session(request(A1, "33333333-0000-4000-8000-000000000003")),
    session(manual, 100),
  ]);
  const occupied = Number(sql("select (select count(*) from public.course_enrollment_requests where offering_id='turma' and status in ('solicitada','aguardando_pagamento','pagamento_confirmado','matriculada')) + (select count(*) from public.op_records where collection='enrollments' and document->>'offering_id'='turma' and document->>'status' in ('active','completed'))"));
  if ([student, owner].filter((x) => x.ok).length !== 1 || occupied !== 1) throw new Error(`aluno x Owner falhou: sucessos=${[student, owner].filter((x) => x.ok).length}, ocupadas=${occupied}; ${student.stderr}; ${owner.stderr}`);
  console.log("PASS aluno x Owner: capacidade total permaneceu em uma vaga");
} finally {
  spawnSync(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore" });
  rmSync(temp, { recursive: true, force: true });
}
