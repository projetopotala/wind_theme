/*
 * P1D | Teste de CONCORRÊNCIA com PostgreSQL real (várias conexões ao mesmo tempo).
 *
 * O PGlite tem uma conexão só; aqui duas ou mais sessões psql disputam a mesma
 * turma de verdade. Sobe um cluster TEMPORÁRIO e isolado (initdb numa pasta
 * temporária, porta própria, só 127.0.0.1), aplica as migrations reais
 * (operação, guarda e P1D), roda os cenários, para o servidor e apaga a pasta.
 * Não toca em nenhum serviço PostgreSQL existente nem em Supabase.
 *
 * Uso: node scripts/p1d-concorrencia-postgres.mjs [pasta-bin-do-postgres]
 *   (padrão: C:/Program Files/PostgreSQL/17/bin)
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = process.argv[2] || "C:/Program Files/PostgreSQL/17/bin";
const PORTA = 55417;
const raiz = new URL("../", import.meta.url);
const mig = (n) => readFileSync(new URL(`supabase/migrations/${n}`, raiz), "utf8");
const exe = (n) => join(BIN, process.platform === "win32" ? `${n}.exe` : n);
const pasta = mkdtempSync(join(tmpdir(), "p1d-pg-"));
const dados = join(pasta, "dados");
const OWNER = "00000000-0000-0000-0000-0000000000a1";

function executar(prog, args, opcoes = {}) {
  const r = spawnSync(exe(prog), args, { encoding: "utf8", ...opcoes });
  if (r.status !== 0) throw new Error(`${prog} falhou: ${r.stderr || r.stdout}`);
  return r.stdout;
}
const psqlArgs = ["-h", "127.0.0.1", "-p", String(PORTA), "-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At"];
const sql = (texto) => executar("psql", [...psqlArgs, "-c", texto]).trim();
function arquivo(texto) { const f = join(pasta, `s${Math.random().toString(16).slice(2)}.sql`); writeFileSync(f, texto); executar("psql", [...psqlArgs, "-f", f]); }

/* Uma sessão em paralelo: devolve { ok, erro, ms }. */
function sessao(texto, atrasoMs = 0) {
  return new Promise((resolver) => {
    setTimeout(() => {
      const inicio = Date.now();
      const p = spawn(exe("psql"), [...psqlArgs, "-c", texto]);
      let erro = "";
      p.stderr.on("data", (d) => { erro += d; });
      p.on("close", (codigo) => resolver({ ok: codigo === 0, erro: erro.trim().split("\n")[0].replace(/^psql:[^E]*/, ""), ms: Date.now() - inicio }));
    }, atrasoMs);
  });
}
const contar = (filtro) => Number(sql(`select count(*) from public.op_records where collection = 'enrollments' and ${filtro}`));
const insc = (id, pessoa, turma, situacao = "active") => `insert into public.op_records(collection, id, document) values ('enrollments', '${id}', '{"id":"${id}","profile_id":"${pessoa}","offering_id":"${turma}","status":"${situacao}"}')`;
const muda = (id, situacao) => `update public.op_records set document = jsonb_set(document, '{status}', '"${situacao}"') where collection = 'enrollments' and id = '${id}'`;
const turma = (id, capacidade) => `insert into public.op_records(collection, id, document) values ('activity_offerings', '${id}', '{"id":"${id}","title":"TESTE INTERNO ${id}","definition_id":"def","mode":"online","capacity":${capacidade}}')`;

const resultados = [];
function registrar(nome, esperado, obtido, detalhe) {
  const ok = esperado === obtido;
  resultados.push({ ok, nome, esperado, obtido, detalhe });
  console.log(`${ok ? "✔" : "✖"} ${nome} — esperado: ${esperado}; obtido: ${obtido}${detalhe ? ` (${detalhe})` : ""}`);
}

try {
  executar("initdb", ["-D", dados, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"]);
  /* stdio ignorado: no Windows o servidor herda a saída do pg_ctl e a manteria aberta. */
  const inicio = spawnSync(exe("pg_ctl"), ["-D", dados, "-o", `-p ${PORTA} -c listen_addresses=127.0.0.1`, "-l", join(pasta, "log.txt"), "-w", "start"], { stdio: "ignore" });
  if (inicio.status !== 0) throw new Error("pg_ctl start falhou: " + readFileSync(join(pasta, "log.txt"), "utf8").slice(-400));
  const versao = sql("show server_version");
  console.log(`PostgreSQL ${versao} temporário em 127.0.0.1:${PORTA}`);

  arquivo(`
    create extension if not exists pgcrypto;
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz default now(), deleted_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.users(id uuid primary key, role text not null, active boolean not null default true, name text, email text);
    create function public.is_portal_admin() returns boolean language sql stable security definer set search_path = '' as $$
      select (select auth.uid()) is not null and exists (select 1 from public.users where id = (select auth.uid()) and role in ('owner','admin') and active = true) $$;
    insert into public.users(id, role, name) values ('${OWNER}', 'owner', 'owner');
  `);
  arquivo(mig("202609170001_operacao_do_instituto.sql"));
  arquivo(mig("202610230001_restore_operational_guard.sql"));
  arquivo(mig("202611120001_integridade_inscricoes.sql"));
  arquivo(`grant usage on schema public, auth to authenticated; grant execute on function auth.uid() to authenticated;
    insert into public.op_records(collection, id, document) values ('activity_definitions', 'def', '{"id":"def","title":"TESTE INTERNO","kind":"course"}');
    insert into public.op_records(collection, id, document)
      select 'profiles', 'al-' || n, jsonb_build_object('id', 'al-' || n, 'display_name', 'TESTE INTERNO ' || n, 'roles', jsonb_build_array('student'), 'active', true)
      from generate_series(1, 30) n;`);

  /* A. Última vaga: duas sessões inserem ao mesmo tempo (a primeira segura a transação por 2 s). */
  sql(turma("A", 1));
  {
    const [s1, s2] = await Promise.all([sessao(`begin; ${insc("a1", "al-1", "A")}; select pg_sleep(2); commit;`), sessao(`begin; ${insc("a2", "al-2", "A")}; commit;`, 400)]);
    registrar("A. última vaga disputada (sem op_apply)", "1 grava, 1 recusa 23514", `${[s1, s2].filter((s) => s.ok).length} grava; ativas=${contar("document->>'offering_id'='A'")}`.replace(/^1 grava; ativas=1$/, "1 grava, 1 recusa 23514"), `segunda esperou ${s2.ms} ms: ${s2.erro}`);
  }

  /* B. Mesmo aluno, mesma turma, dois pedidos distintos ao mesmo tempo. */
  sql(turma("B", "null"));
  {
    const [s1, s2] = await Promise.all([sessao(`begin; ${insc("b1", "al-3", "B")}; select pg_sleep(2); commit;`), sessao(`begin; ${insc("b2", "al-3", "B", "waitlist")}; commit;`, 400)]);
    const total = contar("document->>'offering_id'='B'");
    registrar("B. mesmo aluno em dois pedidos simultâneos", "1 inscrição", `${total} inscrição${total === 1 ? "" : "ões"}`, s2.erro || s1.erro);
  }

  /* C. Promoção simultânea da lista de espera com 1 vaga livre. */
  sql(turma("C", 2)); sql(insc("c0", "al-4", "C")); sql(insc("c1", "al-5", "C", "waitlist")); sql(insc("c2", "al-6", "C", "waitlist"));
  {
    const [s1, s2] = await Promise.all([sessao(`begin; ${muda("c1", "active")}; select pg_sleep(2); commit;`), sessao(`begin; ${muda("c2", "active")}; commit;`, 400)]);
    registrar("C. promoção simultânea da espera", "ativas=2", `ativas=${contar("document->>'offering_id'='C' and document->>'status' in ('active','completed')")}`, s2.erro || s1.erro);
  }

  /* D. Cancelamento e nova inscrição ao mesmo tempo (turma de 1 vaga, ocupada). */
  sql(turma("D", 1)); sql(insc("d0", "al-7", "D"));
  {
    const [s1, s2] = await Promise.all([sessao(`begin; ${muda("d0", "cancelled")}; select pg_sleep(2); commit;`), sessao(`begin; ${insc("d1", "al-8", "D")}; commit;`, 400)]);
    registrar("D. cancelamento confirmado libera a vaga para a inscrição que esperava", "ok/ok, ativas=1", `${s1.ok ? "ok" : "erro"}/${s2.ok ? "ok" : "erro"}, ativas=${contar("document->>'offering_id'='D' and document->>'status'='active'")}`, s2.erro);
  }
  /* D2. O cancelamento é desfeito (rollback): a inscrição que esperava não pode usar a vaga. */
  sql(turma("D2", 1)); sql(insc("e0", "al-9", "D2"));
  {
    const [, s2] = await Promise.all([sessao(`begin; ${muda("e0", "cancelled")}; select pg_sleep(2); rollback;`), sessao(`begin; ${insc("e1", "al-10", "D2")}; commit;`, 400)]);
    registrar("D2. cancelamento desfeito não libera vaga", "recusa 23514, ativas=1", `${s2.ok ? "gravou" : "recusa " + (/esgotada/.test(s2.erro) ? "23514" : s2.erro)}, ativas=${contar("document->>'offering_id'='D2' and document->>'status'='active'")}`);
  }

  /* E. Redução de capacidade enquanto alguém se inscreve. */
  sql(turma("E", 2)); sql(insc("f0", "al-11", "E"));
  {
    const [s1, s2] = await Promise.all([
      sessao(`begin; ${insc("f1", "al-12", "E")}; select pg_sleep(2); commit;`),
      sessao(`begin; update public.op_records set document = jsonb_set(document, '{capacity}', '1') where collection = 'activity_offerings' and id = 'E'; commit;`, 400),
    ]);
    const cap = sql(`select document->>'capacity' from public.op_records where collection = 'activity_offerings' and id = 'E'`);
    registrar("E. redução de capacidade concorrente", "capacidade=2, ativas=2", `capacidade=${cap}, ativas=${contar("document->>'offering_id'='E' and document->>'status'='active'")}`, s2.erro || s1.erro);
  }

  /* F. Muitas sessões ao mesmo tempo pela mesma turma de 3 vagas. */
  sql(turma("F", 3));
  {
    const sessoes = await Promise.all(Array.from({ length: 12 }, (_, i) => sessao(`begin; ${insc(`g${i}`, `al-${13 + i}`, "F")}; select pg_sleep(0.3); commit;`, i * 30)));
    registrar("F. 12 sessões simultâneas para 3 vagas", "3 gravam, ativas=3", `${sessoes.filter((s) => s.ok).length} gravam, ativas=${contar("document->>'offering_id'='F'")}`);
  }

  /* G. Pelo op_apply: dois pedidos com a mesma revisão; depois o perdedor refaz com a revisão nova. */
  sql(turma("G", 1));
  {
    const rev = Number(sql("select revision from public.op_meta where id = 1"));
    const chamada = (id, pessoa, chave, r) => `set test.uid = '${OWNER}'; set role authenticated; select public.op_apply(${r}, '${chave}', 'enrollment.save', '{}'::jsonb, null, '[{"table":"enrollments","id":"${id}","after":{"id":"${id}","profile_id":"${pessoa}","offering_id":"G","status":"active"}}]'::jsonb);`;
    const [s1, s2] = await Promise.all([sessao(chamada("h1", "al-26", "chave-g1", rev)), sessao(chamada("h2", "al-27", "chave-g2", rev), 50)]);
    const perdedor = s1.ok ? s2 : s1;
    const rev2 = Number(sql("select revision from public.op_meta where id = 1"));
    const refeito = await sessao(chamada(s1.ok ? "h2" : "h1", s1.ok ? "al-27" : "al-26", "chave-g3", rev2));
    registrar("G. op_apply concorrente: revisão barra o 2º; ao refazer, a capacidade barra", "PT409 e depois 23514",
      `${/atualizados em outra janela/.test(perdedor.erro) ? "PT409" : perdedor.erro} e depois ${refeito.ok ? "gravou" : /esgotada/.test(refeito.erro) ? "23514" : refeito.erro}`);
    /* Repetição da mesma chave do vencedor: devolve o resultado, não grava de novo. */
    const vencedorChave = s1.ok ? "chave-g1" : "chave-g2";
    const repete = await sessao(chamada(s1.ok ? "h1" : "h2", s1.ok ? "al-26" : "al-27", vencedorChave, rev));
    registrar("H. repetição do mesmo identificador", "ok, ativas=1", `${repete.ok ? "ok" : repete.erro}, ativas=${contar("document->>'offering_id'='G'")}`);
  }

  /* I. Múltiplos registros e auditoria pela via normal (op_apply como Owner). */
  sql(turma("I", 3));
  {
    const op = (acao, chave, alteracoes) => `set test.uid = '${OWNER}'; set role authenticated; select public.op_apply(${sql("select revision from public.op_meta where id = 1")}, '${chave}', '${acao}', '{}'::jsonb, null, '${JSON.stringify(alteracoes)}'::jsonb);`;
    const ins = (id, pessoa, situacao = "active") => ({ table: "enrollments", id, after: { id, profile_id: pessoa, offering_id: "I", status: situacao } });
    const estado = () => sql("select (select revision from public.op_meta where id = 1) || '/' || (select count(*) from public.op_records where collection = 'audit_events') || '/' || (select count(*) from public.op_requests)");
    const lote = await sessao(op("enrollment.save", "chave-i1", [ins("i1", "al-28"), ins("i2", "al-29"), ins("i3", "al-30", "waitlist")]));
    registrar("I1. enrollment.save legítimo com 3 registros", "ok, inscrições=3", `${lote.ok ? "ok" : lote.erro}, inscrições=${contar("document->>'offering_id'='I'")}`);
    const antes = estado();
    const misto = await sessao(op("enrollment.save", "chave-i2", [ins("i4", "al-1", "waitlist"), { table: "rooms", id: "s9", after: { id: "s9", code: "S9", name: "S9", status: "unconfirmed" } }]));
    const depois = estado();
    registrar("I2. lote misto (inscrição + sala) recusado; inscrição, auditoria, chave e revisão desfeitas", "recusa escopo, nada muda", `${/fora do escopo/.test(misto.erro) ? "recusa escopo" : misto.erro}, ${antes === depois && contar("id='i4'") === 0 ? "nada muda" : "mudou " + antes + " -> " + depois}`);
    const errada = await sessao(op("person.save", "chave-i3", [ins("i5", "al-2", "waitlist")]));
    registrar("I3. ação declarada incompatível (person.save gravando inscrição)", "recusa escopo", /fora do escopo/.test(errada.erro) ? "recusa escopo" : errada.erro || "gravou");
    const turmaOk = await sessao(op("offering.save", "chave-i4", [{ table: "activity_offerings", id: "I", after: { id: "I", title: "TESTE INTERNO I", definition_id: "def", mode: "online", capacity: 5 } }]));
    registrar("I4. offering.save legítimo", "ok", turmaOk.ok ? "ok" : turmaOk.erro);
    const comum = await sessao(`set test.uid = '00000000-0000-0000-0000-0000000000b9'; set role authenticated; select public.op_apply(${sql("select revision from public.op_meta where id = 1")}, 'chave-i5', 'enrollment.save', '{}'::jsonb, null, '[]'::jsonb);`);
    registrar("I5. conta sem administração", "42501", /não permite/.test(comum.erro) ? "42501" : comum.erro || "gravou");
    const direto = await sessao(`set role authenticated; insert into public.op_records(collection, id, document) values ('enrollments', 'x', '{}');`);
    registrar("I6. escrita direta na tabela pela role da aplicação", "permission denied", /permission denied/.test(direto.erro) ? "permission denied" : direto.erro || "gravou");
  }

  /* R. Rollback numa instância descartável com a P1D aplicada e dados presentes. */
  {
    const marca = () => sql("select md5(string_agg(collection || id || document::text, '|' order by collection, id)) from public.op_records");
    const antes = marca();
    arquivo(readFileSync(new URL("supabase/rollbacks/202611120001_rollback_integridade_inscricoes.sql", raiz), "utf8"));
    const objetos = sql("select (select count(*) from pg_trigger where tgrelid = 'public.op_records'::regclass and tgname in ('op_records_validate_enrollment','op_records_protect_enrollment_refs','op_records_validate_scope')) || '/' || (select count(*) from pg_proc where proname in ('validate_op_enrollment','validate_op_scope','op_turma_capacidade')) || '/' || (to_regclass('public.op_records_enrollment_pessoa_turma') is not null)");
    registrar("R1. rollback remove só os objetos da P1D", "0/0/false", objetos);
    registrar("R2. rollback preserva os dados", "iguais", marca() === antes ? "iguais" : "diferentes");
    const guardas = sql("select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid = 'public.op_records'::regclass and not tgisinternal");
    registrar("R3. guarda anterior de Agenda/Salas continua", "op_records_validate_before_write", guardas);
    const salaOnline = await sessao(`insert into public.op_records(collection, id, document) values ('schedule_items', 'z', '{"id":"z","title":"x","mode":"online","room_id":"r","status":"booked","starts_at":"2027-01-01T10:00:00Z","ends_at":"2027-01-01T11:00:00Z","participants":1}');`);
    registrar("R4. guarda da Agenda ainda bloqueia aula online com sala", "recusa", salaOnline.ok ? "gravou" : "recusa");
    const apos = await sessao(`set test.uid = '${OWNER}'; set role authenticated; select public.op_apply(${sql("select revision from public.op_meta where id = 1")}, 'chave-r5', 'enrollment.save', '{}'::jsonb, null, '[{"table":"enrollments","id":"r5","after":{"id":"r5","profile_id":"al-28","offering_id":"A","status":"waitlist"}}]'::jsonb);`);
    registrar("R5. op_apply continua funcionando após o rollback (sem dependência quebrada)", "ok", apos.ok ? "ok" : apos.erro);
    arquivo(mig("202611120001_integridade_inscricoes.sql"));
    registrar("R6. reaplicação depois do rollback", "3 gatilhos", sql("select count(*) from pg_trigger where tgname in ('op_records_validate_enrollment','op_records_protect_enrollment_refs','op_records_validate_scope')") + " gatilhos");
  }

  /* S. Script de homologação do LAB (supabase/ops/p1d-homologacao-lab.sql) com auth.uid() no formato do Supabase. */
  {
    arquivo(`create or replace function auth.uid() returns uuid language sql stable as $f$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$;
      insert into public.users(id, role, name) values ('00000000-0000-0000-0000-0000000000e1', 'blog_editor', 'editor');`);
    const marca = () => sql("select md5(string_agg(collection || id || document::text, '|' order by collection, id)) || (select revision from public.op_meta where id = 1) from public.op_records");
    const antes = marca();
    /* -f com o arquivo do repositório: no Windows, passar o SQL pela linha de comando corromperia os acentos. */
    const saida = spawnSync(exe("psql"), [...psqlArgs, "-f", new URL("supabase/ops/p1d-homologacao-lab.sql", raiz).pathname.replace(/^\/([A-Za-z]:)/, "$1")], { encoding: "utf8", env: { ...process.env, PGCLIENTENCODING: "UTF8" } }).stderr;
    console.log(saida.replace(/^psql:[^E]*/m, "").trim());
    registrar("S1. homologação do LAB: todos os casos conforme o esperado", "Falhas: 0", (/Falhas: \d+/.exec(saida) || ["sem resumo"])[0]);
    registrar("S2. homologação do LAB não deixa nada gravado", "iguais", marca() === antes ? "iguais" : "diferentes");
  }

  const falhas = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - falhas.length} de ${resultados.length} cenários conforme o esperado.`);
  process.exitCode = falhas.length ? 1 : 0;
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  spawnSync(exe("pg_ctl"), ["-D", dados, "-m", "fast", "-w", "stop"], { stdio: "ignore" });
  rmSync(pasta, { recursive: true, force: true });
}
