/*
 * P1 INSCRIÇÕES — TESTE DE INTEGRAÇÃO EM POSTGRESQL ISOLADO (PGlite).
 *
 * Roda as migrations REAIS do repositório que a P1 toca, mais os rascunhos
 * de supabase/drafts/p1-inscricoes, num PostgreSQL 16 em memória (WASM),
 * dentro deste processo. Não usa rede, Docker nem o Supabase oficial.
 *
 * O que NÃO é igual ao Supabase: o esquema auth é um esboço (auth.users e
 * auth.uid() lendo request.jwt.claim.sub), não há PostgREST, e o dono das
 * funções é o superusuário local. Por isso este teste prova a LÓGICA das
 * regras e permissões, não a instalação no projeto oficial.
 *
 * Uso (fora do package.json, para não criar dependência do projeto):
 *   npm install --no-save @electric-sql/pglite@0.2.17
 *   node scripts/p1-inscricoes-pglite.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

for (const evento of ["uncaughtException", "unhandledRejection"]) {
  process.on(evento, (erro) => {
    console.log(`ERRO INESPERADO: ${erro?.message}${erro?.detail ? ` (${erro.detail})` : ""}`);
    process.exit(1);
  });
}

const RAIZ = process.env.P1_RAIZ || join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = [
  "202609020001_portal_home_content.sql",
  "202609080004_portal_users.sql",
  "202609140001_conta_visitante.sql",
  "202609170001_operacao_do_instituto.sql",
  "202609170002_blog_e_participacao.sql",
  "202610230001_restore_operational_guard.sql",
];
const RASCUNHOS = join(RAIZ, "supabase", "drafts", "p1-inscricoes");

/*
 * O PGlite vem de uma instalação TEMPORÁRIA (P1_PGLITE_DIR), nunca das
 * dependências do projeto. scripts/p1-inscricoes-pglite-executar.mjs cria essa
 * instalação com a versão fixa e chama este arquivo.
 */
const VERSAO_PGLITE = "0.2.17";
let PGlite;
try {
  const pasta = process.env.P1_PGLITE_DIR;
  if (!pasta) throw new Error("P1_PGLITE_DIR não definido");
  const { createRequire } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const exigir = createRequire(join(pasta, "package.json"));
  const versao = JSON.parse(readFileSync(join(pasta, "node_modules", "@electric-sql", "pglite", "package.json"), "utf8")).version;
  if (versao !== VERSAO_PGLITE) throw new Error(`versão ${versao} instalada; esperada ${VERSAO_PGLITE}`);
  ({ PGlite } = await import(pathToFileURL(exigir.resolve("@electric-sql/pglite")).href));
} catch (erro) {
  console.log(`PENDENTE: PGlite ${VERSAO_PGLITE} indisponível (${erro.message}). Use: node scripts/p1-inscricoes-pglite-executar.mjs`);
  process.exit(2);
}

const ESBOCO_SUPABASE = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema extensions; create schema storage;
grant usage on schema public, auth to anon, authenticated;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated;
`;

const ADMIN = "00000000-0000-4000-8000-00000000000a";
const ALUNO_A = "00000000-0000-4000-8000-0000000000a1";
const ALUNO_B = "00000000-0000-4000-8000-0000000000b1";

const db = new PGlite();
const resultados = [];
function registrar(nome, ok, detalhe = "") {
  resultados.push({ nome, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${detalhe ? `  — ${detalhe}` : ""}`);
}

async function como(papel, sub, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub || ""}', false); set role ${papel};`);
  try { return await fn(); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
}
async function falha(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}
async function aplicarRascunho(arquivo, chave) {
  await db.exec(`select set_config('potala.p1_aprovado', '${chave}', false);`);
  try { await db.exec(readFileSync(join(RASCUNHOS, arquivo), "utf8")); }
  catch (erro) { await db.exec("rollback"); throw erro; }
  finally { await db.exec("select set_config('potala.p1_aprovado', '', false);"); }
}
let chaveOp = 0;
async function opApply(changes) {
  const revisao = (await db.query("select revision from public.op_meta where id = 1")).rows[0].revision;
  return como("authenticated", ADMIN, () =>
    db.query("select public.op_apply($1, $2, 'teste', '{}'::jsonb, '{}'::jsonb, $3::jsonb) as r",
      [Number(revisao), `teste-${++chaveOp}`, JSON.stringify(changes)]));
}
const revisaoAtual = async () => Number((await db.query("select revision from public.op_meta where id = 1")).rows[0].revision);
const inscricao = (id, profile, offering, status) => ({ table: "enrollments", id, after: { id, profile_id: profile, offering_id: offering, status } });
async function copiasDe(user) {
  return (await db.query("select coalesce(op_course_ref, course_ref) as course_ref, course_ref as chave, status, op_enrollment_id, hidden_reason from public.enrollments where user_id = $1 order by 1, op_enrollment_id", [user])).rows;
}
async function oQueOAlunoVe(user) {
  return como("authenticated", user, async () => (await db.query("select course_ref, status, course_title from public.enrollments order by course_ref")).rows);
}

// ---------------------------------------------------------------- preparação
await db.exec(ESBOCO_SUPABASE);
for (const m of MIGRATIONS) await db.exec(readFileSync(join(RAIZ, "supabase", "migrations", m), "utf8"));
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values
    ('${ADMIN}', 'admin@teste.invalid', now()), ('${ALUNO_A}', 'a@teste.invalid', now()), ('${ALUNO_B}', 'b@teste.invalid', now());
  insert into public.users (id, email, role, active) values ('${ADMIN}', 'admin@teste.invalid', 'admin', true);
`);

// O rascunho se recusa a rodar sem a trava liberada.
{
  const e = await falha(() => db.exec(readFileSync(join(RASCUNHOS, "01_estrutura.RASCUNHO.sql"), "utf8")));
  registrar("trava: PARTE 1 não roda sem autorização explícita na sessão", Boolean(e && /não autorizada/.test(e.message)));
  const e2 = await falha(() => db.exec(readFileSync(join(RASCUNHOS, "02_projecao.RASCUNHO.sql"), "utf8")));
  registrar("trava: PARTE 2 não roda sem autorização explícita na sessão", Boolean(e2 && /não autorizada/.test(e2.message)));
}

// Dados do painel ANTES da P1 (pessoas, turmas).
await opApply([
  { table: "profiles", id: "p-a", after: { id: "p-a", display_name: "Aluna A", email: "a@teste.invalid", roles: ["student"] } },
  { table: "profiles", id: "p-b", after: { id: "p-b", display_name: "Aluno B", email: "b@teste.invalid", roles: ["student"] } },
  { table: "profiles", id: "p-prof", after: { id: "p-prof", display_name: "Prof. Teste", roles: ["professional"] } },
  { table: "activity_offerings", id: "t-1", after: { id: "t-1", title: "Meditação — Turma 1", mode: "presencial", professional_id: "p-prof" } },
  { table: "activity_offerings", id: "t-2", after: { id: "t-2", title: "Meditação — Turma 2", mode: "online" } },
]);

// Pré-checagem: roda, é um único SELECT e não acusa problemas nestes dados.
{
  const { rows } = await db.query(readFileSync(join(RASCUNHOS, "00_prechecagem_somente_leitura.sql"), "utf8"));
  const problema = rows.filter((r) => /^[A-D]\./.test(r.verificacao) && r.quantidade !== "0");
  registrar("pré-checagem roda e não acusa problemas no cenário de teste", rows.length === 10 && problema.length === 0, JSON.stringify(problema));
  await db.exec("begin");
  await db.query(`insert into public.op_records (collection, id, document) values
    ('enrollments', 'dup-1', '{"id":"dup-1","profile_id":"p-a","offering_id":"t-1","status":"active"}'),
    ('enrollments', 'dup-2', '{"id":"dup-2","profile_id":"p-a","offering_id":"t-1","status":"bogus"}')`);
  const { rows: r2 } = await db.query(readFileSync(join(RASCUNHOS, "00_prechecagem_somente_leitura.sql"), "utf8"));
  const porLetra = Object.fromEntries(r2.map((r) => [r.verificacao[0], r.quantidade]));
  registrar("pré-checagem acusa duplicidade (C) e situação desconhecida (B)", porLetra.C === "1" && porLetra.B === "1", JSON.stringify(porLetra));
  await db.exec("select set_config('potala.p1_aprovado', 'estrutura', false)");
  await db.exec("savepoint s");
  const e = await falha(() => db.exec(readFileSync(join(RASCUNHOS, "01_estrutura.RASCUNHO.sql"), "utf8").replace(/^begin;$/m, "").replace(/^commit;$/m, "")));
  registrar("PARTE 1 para com mensagem clara se houver duplicidade", Boolean(e && /duplicadas/.test(e.message)), e?.message);
  await db.exec("rollback");
  await db.exec("select set_config('potala.p1_aprovado', '', false)");
}

// ------------------------------------------------------------- PARTE 1
await aplicarRascunho("01_estrutura.RASCUNHO.sql", "estrutura");
{
  const { rows } = await db.query("select count(*)::int n from pg_trigger where tgname in ('op_records_projetar','op_profile_accounts_projetar')");
  registrar("PARTE 1 não instala nenhum gatilho de cópia", rows[0].n === 0);
}

// Identidade do pedido
await como("anon", "", () => db.query("insert into public.site_interests (kind, subject, details, page) values ('curso', 'Anônimo', '{}', '/cursos.html')"));
registrar("anônimo continua enviando interesse (user_id nulo)",
  (await db.query("select user_id from public.site_interests where subject = 'Anônimo'")).rows[0].user_id === null);

await como("authenticated", ALUNO_A, () => db.query("insert into public.site_interests (kind, subject, details, page) values ('curso', 'Pedido A', '{}', '/cursos.html')"));
registrar("logado: user_id vem da sessão",
  (await db.query("select user_id from public.site_interests where subject = 'Pedido A'")).rows[0].user_id === ALUNO_A);

for (const [rotulo, valor] of [["de outra conta", `'${ALUNO_B}'`], ["nulo", "null"]]) {
  const e = await falha(() => como("authenticated", ALUNO_A, () =>
    db.query(`insert into public.site_interests (kind, subject, user_id) values ('curso', 'Falso', ${valor})`)));
  registrar(`logado não consegue enviar user_id ${rotulo} (sem privilégio de coluna)`, Boolean(e && /permission denied/.test(e.message)), e?.message.slice(0, 60));
}
{
  const e = await falha(() => como("anon", "", () => db.query(`insert into public.site_interests (kind, subject, user_id) values ('curso', 'Falso', '${ALUNO_A}')`)));
  registrar("anônimo não consegue se passar por uma conta", Boolean(e && /permission denied/.test(e.message)));
}
// Defesa em profundidade: mesmo se alguém conceder a coluna por engano, o gatilho manda.
await db.exec("grant insert (user_id) on public.site_interests to authenticated");
await como("authenticated", ALUNO_B, () => db.query(`insert into public.site_interests (kind, subject, details, page, user_id) values ('curso', 'Forçado', '{}', '/', '${ALUNO_A}')`));
registrar("com a coluna concedida por engano, o gatilho ainda grava a conta da sessão",
  (await db.query("select user_id from public.site_interests where subject = 'Forçado'")).rows[0].user_id === ALUNO_B);
await db.exec("revoke insert (user_id) on public.site_interests from authenticated");

await como("authenticated", ALUNO_B, () => db.query("insert into public.site_interests (kind, subject, details, page) values ('curso', 'Pedido B', '{}', '/cursos.html')"));
await como("authenticated", ALUNO_A, () => db.query("insert into public.site_interests (kind, subject, details, page) values ('experiencia-cultural', 'Cultura A', '{}', '/')"));
const pedido = async (assunto) => (await db.query("select id from public.site_interests where subject = $1", [assunto])).rows[0].id;
const [pedA, pedB, pedAnon, pedCultura] = [await pedido("Pedido A"), await pedido("Pedido B"), await pedido("Anônimo"), await pedido("Cultura A")];

// Vínculo
const vincular = (papel, sub, perfil, pedidoId) => como(papel, sub, () =>
  db.query("insert into public.op_profile_accounts (op_profile_id, interest_id) values ($1, $2)", [perfil, pedidoId]));
{
  let e = await falha(() => vincular("authenticated", ALUNO_A, "p-a", pedA));
  registrar("aluno não consegue se vincular sozinho", Boolean(e && /42501|administração|row-level/i.test(`${e.code} ${e.message}`)), e?.message.slice(0, 60));
  e = await falha(() => vincular("anon", "", "p-a", pedA));
  registrar("anônimo não consegue vincular", Boolean(e && /permission denied/.test(e.message)));
  e = await falha(() => vincular("authenticated", ADMIN, "p-a", pedAnon));
  registrar("pedido anônimo não serve para vínculo", Boolean(e && /sem conta/.test(e.message)));
  e = await falha(() => vincular("authenticated", ADMIN, "p-a", pedCultura));
  registrar("pedido que não é de curso não serve para vínculo", Boolean(e && /pedidos de curso/.test(e.message)));
  e = await falha(() => vincular("authenticated", ADMIN, "p-inexistente", pedA));
  registrar("pessoa inexistente no painel é recusada", Boolean(e && /Pessoa inexistente/.test(e.message)));
  e = await falha(() => como("authenticated", ADMIN, () => db.query("insert into public.op_profile_accounts (op_profile_id, interest_id, user_id) values ('p-a', $1, $2)", [pedA, ALUNO_B])));
  registrar("administração não consegue informar user_id arbitrário", Boolean(e && /permission denied/.test(e.message)));
  e = await falha(() => como("authenticated", ADMIN, () => db.query("insert into public.op_profile_accounts (op_profile_id, interest_id, source) values ('p-a', $1, 'codigo')", [pedA])));
  registrar("source='codigo' não existe nesta versão", Boolean(e && /permission denied/.test(e.message)));
  e = await falha(() => como("authenticated", ADMIN, () => db.query("insert into public.op_profile_accounts (op_profile_id) values ('p-a')")));
  registrar("vínculo sem pedido é recusado", Boolean(e && /partir de um pedido/.test(e.message)));
}

// ------------------------------------------------------------- PARTE 2
await aplicarRascunho("02_projecao.RASCUNHO.sql", "projecao");

// Ordem 1: inscrição ANTES do vínculo (inscrição administrativa anterior)
await opApply([inscricao("i-1", "p-a", "t-1", "active")]);
registrar("sem vínculo, nada aparece para ninguém", (await copiasDe(ALUNO_A)).length === 0);
await vincular("authenticated", ADMIN, "p-a", pedA);
{
  const ve = await oQueOAlunoVe(ALUNO_A);
  registrar("ao vincular, a inscrição anterior aparece para A", ve.length === 1 && ve[0].status === "inscrito" && ve[0].course_title === "Meditação — Turma 1", JSON.stringify(ve));
  const vinc = (await db.query("select user_id, linked_by, source from public.op_profile_accounts where op_profile_id = 'p-a'")).rows[0];
  registrar("vínculo grava conta do pedido, autor e origem pelo banco", vinc.user_id === ALUNO_A && vinc.linked_by === ADMIN && vinc.source === "pedido");
  registrar("B não vê nada de A", (await oQueOAlunoVe(ALUNO_B)).length === 0);
}
{
  const e = await falha(() => vincular("authenticated", ADMIN, "p-b", pedA));
  registrar("a mesma conta não pode ser ligada a duas pessoas", Boolean(e && /duplicate key|unique/i.test(e.message)));
  const e2 = await falha(() => como("authenticated", ALUNO_B, () => db.query("insert into public.enrollments (user_id, course_ref, course_title, status) values ($1, 'x', 'x', 'inscrito')", [ALUNO_B])));
  registrar("aluno não grava em public.enrollments", Boolean(e2 && /permission denied/.test(e2.message)));
  for (const papel of ["anon", "authenticated"]) {
    const e3 = await falha(() => como(papel, ALUNO_A, () => db.query("select public.op_projetar_inscricao('i-1')")));
    registrar(`${papel} não chama a função de cópia diretamente`, Boolean(e3 && /permission denied/.test(e3.message)));
  }
  const e4 = await falha(() => como("authenticated", ALUNO_A, () => db.query("select * from public.enrollment_projection_issues")));
  const linhas = e4 ? -1 : (await como("authenticated", ALUNO_A, () => db.query("select * from public.enrollment_projection_issues"))).rows.length;
  registrar("aluno não lê o registro de falhas", linhas === 0 || linhas === -1);
}

// Ordem 2: vínculo ANTES da inscrição
await vincular("authenticated", ADMIN, "p-b", pedB);
await opApply([inscricao("i-2", "p-b", "t-1", "waitlist")]);
registrar("lista de espera aparece como aguardando_turma", (await oQueOAlunoVe(ALUNO_B))[0]?.status === "aguardando_turma");

// Duplicidade (banco) e atomicidade do op_apply
{
  const antes = await revisaoAtual();
  const e = await falha(() => opApply([inscricao("i-dup", "p-a", "t-1", "active")]));
  registrar("segunda inscrição da mesma pessoa na mesma turma é recusada pelo banco", Boolean(e && /duplicate key|unique/i.test(e.message)));
  registrar("operação recusada não avança a revisão do painel", (await revisaoAtual()) === antes);
}

// Progresso preservado no cancelamento
const idCopiaA = (await db.query("select id from public.enrollments where op_enrollment_id = 'i-1'")).rows[0].id;
await db.query("insert into public.course_progress (enrollment_id, lessons_total, lessons_done) values ($1, 10, 4)", [idCopiaA]);
await opApply([inscricao("i-1", "p-a", "t-1", "cancelled")]);
{
  registrar("cancelada some do Meu Potala de A", (await oQueOAlunoVe(ALUNO_A)).length === 0);
  const prog = (await db.query("select lessons_done from public.course_progress where enrollment_id = $1", [idCopiaA])).rows;
  registrar("cancelamento NÃO apaga o progresso", prog.length === 1 && prog[0].lessons_done === 4);
  const vistoProgresso = await como("authenticated", ALUNO_A, () => db.query("select * from public.course_progress"));
  registrar("aluno não vê progresso de inscrição oculta", vistoProgresso.rows.length === 0);
}
// Reinscrição: a mesma linha volta, com o progresso
await opApply([inscricao("i-1", "p-a", "t-1", "active")]);
{
  const linha = (await db.query("select id, hidden_at from public.enrollments where op_enrollment_id = 'i-1' and hidden_at is null")).rows[0];
  registrar("reinscrição reexibe a mesma linha (progresso volta)", linha?.id === idCopiaA);
  const vistoProgresso = await como("authenticated", ALUNO_A, () => db.query("select lessons_done from public.course_progress"));
  registrar("progresso volta a aparecer para A", vistoProgresso.rows[0]?.lessons_done === 4);
}

// Troca de turma
await opApply([inscricao("i-1", "p-a", "t-2", "active")]);
{
  const ve = await oQueOAlunoVe(ALUNO_A);
  const todas = await copiasDe(ALUNO_A);
  registrar("troca de turma: A vê só a turma nova", ve.length === 1 && ve[0].course_ref === "op:t-2", JSON.stringify(ve));
  registrar("troca de turma: a cópia antiga fica oculta como 'trocada' (com progresso)",
    todas.some((c) => c.course_ref === "op:t-1" && c.hidden_reason === "trocada"));
}

// Reatribuição para outra pessoa (B já tem t-1 em espera; reatribui i-1 em t-2)
await opApply([inscricao("i-1", "p-b", "t-2", "active")]);
{
  registrar("reatribuição: A deixa de ver", (await oQueOAlunoVe(ALUNO_A)).length === 0);
  const veB = await oQueOAlunoVe(ALUNO_B);
  registrar("reatribuição: B passa a ver", veB.some((c) => c.course_ref === "op:t-2"), JSON.stringify(veB));
  registrar("reatribuição: a cópia de A fica oculta como 'reatribuida'",
    (await copiasDe(ALUNO_A)).some((c) => c.course_ref === "op:t-2" && c.hidden_reason === "reatribuida"));
}

// Alteração de turma reflete no título
await opApply([{ table: "activity_offerings", id: "t-2", after: { id: "t-2", title: "Meditação — Turma 2 (noite)", mode: "online" } }]);
registrar("título da turma alterado chega à cópia", (await oQueOAlunoVe(ALUNO_B)).some((c) => c.course_title === "Meditação — Turma 2 (noite)"));

// Exclusão da inscrição
await opApply([{ table: "enrollments", id: "i-2", after: null }]);
registrar("inscrição excluída do painel fica oculta (não apagada)",
  (await copiasDe(ALUNO_B)).some((c) => c.op_enrollment_id === "i-2" && c.hidden_reason === "removida"));

// Idempotência: mesma chave de op_apply não duplica; reprojetar não muda nada
{
  const antes = JSON.stringify(await copiasDe(ALUNO_B));
  const revisao = await revisaoAtual();
  const chave = "idem-1";
  const changes = [inscricao("i-1", "p-b", "t-2", "completed")];
  await como("authenticated", ADMIN, () => db.query("select public.op_apply($1, $2, 'teste', '{}'::jsonb, '{}'::jsonb, $3::jsonb)", [revisao, chave, JSON.stringify(changes)]));
  await como("authenticated", ADMIN, () => db.query("select public.op_apply($1, $2, 'teste', '{}'::jsonb, '{}'::jsonb, $3::jsonb)", [revisao, chave, JSON.stringify(changes)]));
  const depois = await copiasDe(ALUNO_B);
  registrar("repetição idempotente do op_apply não duplica cópias", depois.filter((c) => c.op_enrollment_id === "i-1").length === 1 && antes !== JSON.stringify(depois));
  registrar("concluída aparece como 'concluido'", (await oQueOAlunoVe(ALUNO_B)).some((c) => c.status === "concluido"));
  const r1 = JSON.stringify(await copiasDe(ALUNO_B));
  await db.query("select public.op_projetar_inscricao('i-1')");
  await db.query("select public.op_projetar_inscricao('i-1')");
  registrar("reprojeção repetida é idempotente", JSON.stringify(await copiasDe(ALUNO_B)) === r1);
}

// Falha na cópia não bloqueia o painel
await db.exec("alter table public.enrollments add constraint teste_falha check (course_title <> 'FALHA')");
{
  const e = await falha(() => opApply([
    { table: "activity_offerings", id: "t-3", after: { id: "t-3", title: "FALHA", mode: "presencial" } },
    inscricao("i-3", "p-a", "t-3", "active"),
  ]));
  registrar("falha inesperada na cópia NÃO desfaz a operação do painel", e === null, e?.message);
  const issues = (await db.query("select op_enrollment_id, sqlstate from public.enrollment_projection_issues")).rows;
  registrar("a falha fica registrada para a administração", issues.some((i) => i.op_enrollment_id === "i-3" && i.sqlstate === "23514"), JSON.stringify(issues));
}
await db.exec("alter table public.enrollments drop constraint teste_falha");

// Falha registrada → divergência visível → reconciliação recupera (P1.2)
const divergencias = () => como("authenticated", ADMIN, async () => (await db.query("select op_enrollment_id, motivo from public.op_inscricoes_divergentes() order by 1, 2")).rows);
const reconciliar = () => como("authenticated", ADMIN, async () => (await db.query("select public.op_reconciliar_inscricoes() as r")).rows[0].r);
{
  const antes = await divergencias();
  registrar("divergências mostram a falha aberta e a inscrição sem cópia",
    antes.some((d) => d.op_enrollment_id === "i-3" && d.motivo === "falha_aberta") && antes.some((d) => d.op_enrollment_id === "i-3" && d.motivo === "sem_copia"), JSON.stringify(antes));
  for (const [papel, sub] of [["anon", ""], ["authenticated", ALUNO_A]]) {
    const e1 = await falha(() => como(papel, sub, () => db.query("select public.op_reconciliar_inscricoes()")));
    const e2 = await falha(() => como(papel, sub, () => db.query("select * from public.op_inscricoes_divergentes()")));
    registrar(`${papel === "anon" ? "anônimo" : "aluno"} não reconcilia nem consulta divergências`, Boolean(e1 && e2), `${e1?.message?.slice(0, 50)} | ${e2?.message?.slice(0, 50)}`);
  }
  const r1 = await reconciliar();
  registrar("reconciliação recupera a inscrição que falhou", r1.falhas === 0 && (await oQueOAlunoVe(ALUNO_A)).some((c) => c.course_ref === "op:t-3"), JSON.stringify(r1));
  registrar("depois da reconciliação não há divergências", (await divergencias()).length === 0, JSON.stringify(await divergencias()));
  const fotografia = JSON.stringify((await db.query("select id, user_id, course_ref, status, hidden_at, hidden_reason from public.enrollments order by id")).rows);
  const r2 = await reconciliar();
  registrar("reconciliação é idempotente (segunda execução não muda nada)",
    JSON.stringify((await db.query("select id, user_id, course_ref, status, hidden_at, hidden_reason from public.enrollments order by id")).rows) === fotografia && r2.falhas === 0);
  // Cópia órfã: a inscrição some do painel sem o gatilho (ex.: gatilho desligado numa manutenção)
  await db.exec("alter table public.op_records disable trigger op_records_projetar");
  await db.exec("delete from public.op_records where collection = 'enrollments' and id = 'i-3'");
  await db.exec("alter table public.op_records enable trigger op_records_projetar");
  registrar("divergências acusam cópia órfã", (await divergencias()).some((d) => d.op_enrollment_id === "i-3" && d.motivo === "copia_orfa"));
  const r3 = await reconciliar();
  registrar("reconciliação oculta a cópia órfã sem apagar", r3.orfas_ocultadas === 1 && !(await oQueOAlunoVe(ALUNO_A)).some((c) => c.course_ref === "op:t-3")
    && (await db.query("select count(*)::int n from public.enrollments where op_enrollment_id = 'i-3'")).rows[0].n === 1);
}

// Troca da conta vinculada: a conta anterior não vê nada, nem depois (P1.2)
{
  const X1 = "00000000-0000-4000-8000-0000000000c1";
  const X2 = "00000000-0000-4000-8000-0000000000c2";
  await db.query("insert into auth.users (id, email) values ($1, 'x1@teste.invalid'), ($2, 'x2@teste.invalid')", [X1, X2]);
  for (const [conta, assunto] of [[X1, "Pedido X1"], [X2, "Pedido X2"]]) {
    await como("authenticated", conta, () => db.query("insert into public.site_interests (kind, subject, details, page) values ('curso', $1, '{}', '/cursos.html')", [assunto]));
  }
  const [pedX1, pedX2] = [await pedido("Pedido X1"), await pedido("Pedido X2")];
  await opApply([
    { table: "profiles", id: "p-x", after: { id: "p-x", display_name: "Pessoa X", roles: ["student"] } },
    { table: "profiles", id: "p-y", after: { id: "p-y", display_name: "Pessoa Y", roles: ["student"] } },
    { table: "activity_offerings", id: "t-x", after: { id: "t-x", title: "Turma X", mode: "online" } },
  ]);
  await vincular("authenticated", ADMIN, "p-x", pedX1);
  await opApply([inscricao("i-x", "p-x", "t-x", "active")]);
  const linhaX1 = (await db.query("select id from public.enrollments where user_id = $1 and op_enrollment_id = 'i-x'", [X1])).rows[0].id;
  await db.query("insert into public.course_progress (enrollment_id, lessons_total, lessons_done) values ($1, 8, 5)", [linhaX1]);

  // A secretaria percebe que ligou a pessoa X à conta errada e corrige.
  await como("authenticated", ADMIN, () => db.query("delete from public.op_profile_accounts where op_profile_id = 'p-x'"));
  await vincular("authenticated", ADMIN, "p-x", pedX2);
  const veX1 = async () => ({
    inscricoes: (await oQueOAlunoVe(X1)).length,
    progresso: (await como("authenticated", X1, () => db.query("select * from public.course_progress"))).rows.length,
    vinculos: (await como("authenticated", X1, () => db.query("select * from public.op_profile_accounts"))).rows.length,
  });
  registrar("conta anterior não vê inscrição, progresso nem vínculo", JSON.stringify(await veX1()) === JSON.stringify({ inscricoes: 0, progresso: 0, vinculos: 0 }), JSON.stringify(await veX1()));
  const veX2 = await oQueOAlunoVe(X2);
  const progX2 = (await como("authenticated", X2, () => db.query("select * from public.course_progress"))).rows.length;
  registrar("conta nova vê a inscrição, mas não o progresso da conta anterior", veX2.length === 1 && progX2 === 0, JSON.stringify(veX2));

  // Alterações posteriores não reexpõem nada à conta anterior.
  await opApply([{ table: "activity_offerings", id: "t-x", after: { id: "t-x", title: "Turma X (nova sala)", mode: "presencial" } }]);
  await opApply([inscricao("i-x", "p-x", "t-x", "waitlist")]);
  await opApply([inscricao("i-x", "p-x", "t-x", "active")]);
  await reconciliar();
  registrar("mudanças de turma, situação e reconciliação não reexpõem à conta anterior", JSON.stringify(await veX1()) === JSON.stringify({ inscricoes: 0, progresso: 0, vinculos: 0 }));

  // A conta anterior é ligada a OUTRA pessoa, inscrita na MESMA turma.
  await vincular("authenticated", ADMIN, "p-y", pedX1);
  await opApply([inscricao("i-y", "p-y", "t-x", "active")]);
  const depois = await veX1();
  const linhaNova = (await db.query("select id from public.enrollments where user_id = $1 and op_enrollment_id = 'i-y' and hidden_at is null", [X1])).rows[0]?.id;
  registrar("nova inscrição da conta anterior ganha linha própria, sem o progresso antigo",
    depois.inscricoes === 1 && depois.progresso === 0 && linhaNova && linhaNova !== linhaX1, JSON.stringify(depois));
  registrar("a linha antiga (com progresso) continua oculta e intacta",
    (await db.query("select hidden_reason from public.enrollments where id = $1", [linhaX1])).rows[0].hidden_reason === "desvinculada"
    && (await db.query("select lessons_done from public.course_progress where enrollment_id = $1", [linhaX1])).rows[0].lessons_done === 5);
}

// Capacidade das turmas (P1.2): o que o banco garante e o que não garante
{
  await opApply([{ table: "activity_offerings", id: "t-cap", after: { id: "t-cap", title: "Turma de 1 vaga", mode: "presencial", capacity: 1 } }]);
  const revisao = await revisaoAtual();
  const pedidoOp = (chave, id, pessoa) => como("authenticated", ADMIN, () =>
    db.query("select public.op_apply($1, $2, 'teste', '{}'::jsonb, '{}'::jsonb, $3::jsonb)", [revisao, chave, JSON.stringify([inscricao(id, pessoa, "t-cap", "active")])]));
  await pedidoOp("cap-1", "i-cap-1", "p-a");
  const e = await falha(() => pedidoOp("cap-2", "i-cap-2", "p-x"));
  registrar("CONSTATAÇÃO: duas gravações sobre a mesma revisão — a segunda é recusada (PT409)", Boolean(e && /atualizados em outra janela/.test(e.message)));
  const e2 = await falha(() => opApply([inscricao("i-cap-2", "p-x", "t-cap", "active")]));
  const ocupadas = (await db.query("select count(*)::int n from public.op_records where collection = 'enrollments' and document ->> 'offering_id' = 't-cap' and document ->> 'status' = 'active'")).rows[0].n;
  registrar("ANTES da proteção: o banco aceita exceder a capacidade quando o cliente não valida", e2 === null && ocupadas === 2, `ativas=${ocupadas} capacidade=1`);
}

// Proteção de capacidade (P1.3) — 05_capacidade_turmas.RASCUNHO.sql
{
  const pre = async () => Object.fromEntries((await db.query(readFileSync(join(RASCUNHOS, "00_prechecagem_somente_leitura.sql"), "utf8"))).rows.map((r) => [r.verificacao[0], r.quantidade]));
  registrar("pré-checagem acusa a turma acima da capacidade (I)", (await pre()).I === "1");
  const e0 = await falha(() => aplicarRascunho("05_capacidade_turmas.RASCUNHO.sql", "capacidade"));
  registrar("proteção se recusa a instalar sobre turma já acima da capacidade", Boolean(e0 && /acima da capacidade/.test(e0.message)), e0?.message);
  registrar("a recusa não deixou nada instalado",
    (await db.query("select count(*)::int n from pg_trigger where tgname = 'op_records_capacidade'")).rows[0].n === 0);
  await opApply([inscricao("i-cap-2", "p-x", "t-cap", "cancelled")]);
  registrar("depois de a secretaria resolver, a pré-checagem fica limpa (I e J)", (await pre()).I === "0" && (await pre()).J === "0");
  await aplicarRascunho("05_capacidade_turmas.RASCUNHO.sql", "capacidade");

  await opApply([
    { table: "profiles", id: "q-1", after: { id: "q-1", display_name: "Q1", roles: ["student"] } },
    { table: "profiles", id: "q-2", after: { id: "q-2", display_name: "Q2", roles: ["student"] } },
    { table: "profiles", id: "q-3", after: { id: "q-3", display_name: "Q3", roles: ["student"] } },
    { table: "profiles", id: "q-4", after: { id: "q-4", display_name: "Q4", roles: ["student"] } },
    { table: "activity_offerings", id: "c-2", after: { id: "c-2", title: "Turma de 2 vagas", mode: "presencial", capacity: 2 } },
    { table: "activity_offerings", id: "c-1", after: { id: "c-1", title: "Turma de 1 vaga", mode: "presencial", capacity: 1 } },
    { table: "activity_offerings", id: "c-livre", after: { id: "c-livre", title: "Turma sem limite", mode: "online", capacity: null } },
  ]);
  const estado = async () => JSON.stringify({
    revisao: await revisaoAtual(),
    registros: (await db.query("select count(*)::int n from public.op_records")).rows[0].n,
  });
  const recusada = async (rotulo, changes, padrao = /Capacidade da oferta esgotada/) => {
    const antes = await estado();
    const e = await falha(() => opApply(changes));
    registrar(rotulo, Boolean(e && padrao.test(e.message)) && (await estado()) === antes, e?.message ?? "aceita");
  };
  const aceita = async (rotulo, changes) => {
    const e = await falha(() => opApply(changes));
    registrar(rotulo, e === null, e?.message);
  };

  await aceita("dentro da capacidade: aceita", [inscricao("c2-a", "q-1", "c-2", "active")]);
  await aceita("segunda vaga: aceita", [inscricao("c2-b", "q-2", "c-2", "active")]);
  await recusada("acima da capacidade: recusada, sem gravação parcial (revisão e registros iguais)", [inscricao("c2-c", "q-3", "c-2", "active")]);
  await aceita("lista de espera não ocupa vaga", [inscricao("c2-c", "q-3", "c-2", "waitlist")]);
  await recusada("promoção da espera para ativa com turma cheia: recusada", [inscricao("c2-c", "q-3", "c-2", "active")]);
  await aceita("cancelamento libera a vaga", [inscricao("c2-b", "q-2", "c-2", "cancelled")]);
  await aceita("promoção da espera depois da vaga liberada: aceita", [inscricao("c2-c", "q-3", "c-2", "active")]);
  await recusada("reativar a cancelada com a turma cheia: recusada", [inscricao("c2-b", "q-2", "c-2", "active")]);
  await recusada("concluída também ocupa vaga", [inscricao("c2-b", "q-2", "c-2", "completed")]);

  await recusada("reduzir a capacidade abaixo das ativas: recusada",
    [{ table: "activity_offerings", id: "c-2", after: { id: "c-2", title: "Turma de 2 vagas", mode: "presencial", capacity: 1 } }]);
  await aceita("reduzir a capacidade e cancelar no MESMO comando: aceita (verificação no fim da transação)", [
    { table: "activity_offerings", id: "c-2", after: { id: "c-2", title: "Turma de 2 vagas", mode: "presencial", capacity: 1 } },
    inscricao("c2-c", "q-3", "c-2", "cancelled"),
  ]);

  await aceita("turma de 1 vaga recebe uma inscrição", [inscricao("c1-a", "q-2", "c-1", "active")]);
  await recusada("troca de turma para uma turma cheia: recusada", [inscricao("c2-a", "q-1", "c-1", "active")]);
  await aceita("troca de turma para turma sem limite: aceita e libera a vaga de origem", [inscricao("c2-a", "q-1", "c-livre", "active")]);
  await aceita("a vaga liberada pela troca pode ser usada", [inscricao("c2-c", "q-3", "c-2", "active")]);

  await recusada("comando com duas inscrições, a segunda excedendo: nada é gravado",
    [inscricao("c1-x", "q-4", "c-1", "waitlist"), inscricao("c2-x", "q-4", "c-2", "active")]);
  registrar("…inclusive a primeira inscrição do comando",
    (await db.query("select count(*)::int n from public.op_records where collection = 'enrollments' and id = 'c1-x'")).rows[0].n === 0);

  await recusada("mesma pessoa duas vezes na mesma turma: recusada", [inscricao("c2-dup", "q-3", "c-2", "waitlist")], /duplicate key|unique/i);
  await recusada("capacidade em formato inválido: recusada",
    [{ table: "activity_offerings", id: "c-livre", after: { id: "c-livre", title: "Turma sem limite", mode: "online", capacity: "muitas" } }], /Capacidade inválida/);
  await recusada("capacidade zero: recusada",
    [{ table: "activity_offerings", id: "c-livre", after: { id: "c-livre", title: "Turma sem limite", mode: "online", capacity: 0 } }], /Capacidade inválida/);
  await aceita("capacidade nula continua sem limite", [inscricao("cl-2", "q-2", "c-livre", "active"), inscricao("cl-3", "q-3", "c-livre", "active")]);

  const antesDireto = await estado();
  const eDireta = await falha(async () => {
    await db.exec("begin");
    try {
      await db.query(`insert into public.op_records (collection, id, document) values ('enrollments', 'direto', '{"id":"direto","profile_id":"q-4","offering_id":"c-1","status":"active"}')`);
      await db.exec("commit");
    } catch (erro) { await db.exec("rollback"); throw erro; }
  });
  registrar("gravação direta em op_records, sem op_apply, também é recusada no fim da transação",
    Boolean(eDireta && /esgotada/.test(eDireta.message)) && (await estado()) === antesDireto, eDireta?.message);
  registrar("nenhuma falha de cópia registrada para as inscrições do teste de capacidade",
    (await db.query("select count(*)::int n from public.enrollment_projection_issues where resolved_at is null and op_enrollment_id like 'c%'")).rows[0].n === 0);
}

// Linha de outra origem nunca é sobrescrita
await db.query("insert into public.enrollments (user_id, course_ref, course_title, status) values ($1, 'op:t-9', 'Manual', 'inscrito')", [ALUNO_A]);
await opApply([
  { table: "activity_offerings", id: "t-9", after: { id: "t-9", title: "Turma 9", mode: "presencial" } },
  inscricao("i-4", "p-a", "t-9", "active"),
]);
registrar("linha de outra origem não é sobrescrita (vira falha registrada)",
  (await db.query("select course_title from public.enrollments where user_id = $1 and course_ref = 'op:t-9' and op_enrollment_id is null", [ALUNO_A])).rows[0]?.course_title === "Manual"
  && (await db.query("select count(*)::int n from public.enrollment_projection_issues where op_enrollment_id = 'i-4'")).rows[0].n === 1);

// Desvincular e excluir pessoa
await como("authenticated", ADMIN, () => db.query("delete from public.op_profile_accounts where op_profile_id = 'p-b'"));
registrar("desvincular oculta tudo de B (sem apagar)", (await oQueOAlunoVe(ALUNO_B)).length === 0 && (await copiasDe(ALUNO_B)).length > 0);
await vincular("authenticated", ADMIN, "p-b", pedB);
registrar("vincular de novo reexibe", (await oQueOAlunoVe(ALUNO_B)).length > 0);
await opApply([{ table: "profiles", id: "p-b", after: null }]);
registrar("pessoa excluída no painel: vínculo some e cópias ficam ocultas",
  (await db.query("select count(*)::int n from public.op_profile_accounts where op_profile_id = 'p-b'")).rows[0].n === 0 && (await oQueOAlunoVe(ALUNO_B)).length === 0);

// Reversões
{
  const e = await falha(() => aplicarRascunho("91_reversao_estrutura.RASCUNHO.sql", "reverter-estrutura"));
  registrar("reversão da estrutura recusa rodar com a projeção instalada", Boolean(e && /PARTE 2/.test(e.message)), e?.message);
  const contar = async () => JSON.stringify((await db.query(
    "select (select count(*) from public.enrollments)::int n, (select count(*) from public.course_progress)::int p, (select count(*) from public.enrollments where hidden_at is null)::int visiveis")).rows[0]);
  const antesDaReversao = await contar();
  await aplicarRascunho("90_reversao_projecao.RASCUNHO.sql", "reverter-projecao");
  registrar("reversão da projeção não apaga nem reexibe inscrições, nem apaga progresso", (await contar()) === antesDaReversao, antesDaReversao);
  const e2 = await falha(() => aplicarRascunho("91_reversao_estrutura.RASCUNHO.sql", "reverter-estrutura"));
  registrar("reversão da estrutura recusa rodar com dados que seriam perdidos", Boolean(e2 && /decidir o destino|identificação/.test(e2.message)));
}

// Ciclo completo num banco limpo: aplicar e reverter deixa tudo como antes.
{
  const limpo = new PGlite();
  await limpo.exec(ESBOCO_SUPABASE);
  for (const m of MIGRATIONS) await limpo.exec(readFileSync(join(RAIZ, "supabase", "migrations", m), "utf8"));
  const assinatura = async () => JSON.stringify((await limpo.query(`
    select (select array_agg(column_name::text order by column_name) from information_schema.columns
             where table_schema = 'public' and table_name in ('site_interests', 'enrollments')) as colunas,
           (select array_agg(policyname::text || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') order by policyname)
              from pg_policies where tablename in ('site_interests', 'enrollments', 'course_progress')) as politicas,
           (select array_agg(tgname::text order by tgname) from pg_trigger where not tgisinternal) as gatilhos`)).rows[0]);
  const antes = await assinatura();
  for (const [arquivo, chave] of [["01_estrutura.RASCUNHO.sql", "estrutura"], ["02_projecao.RASCUNHO.sql", "projecao"],
    ["05_capacidade_turmas.RASCUNHO.sql", "capacidade"], ["92_reversao_capacidade.RASCUNHO.sql", "reverter-capacidade"],
    ["90_reversao_projecao.RASCUNHO.sql", "reverter-projecao"], ["91_reversao_estrutura.RASCUNHO.sql", "reverter-estrutura"]]) {
    await limpo.exec(`select set_config('potala.p1_aprovado', '${chave}', false);`);
    await limpo.exec(readFileSync(join(RASCUNHOS, arquivo), "utf8"));
  }
  await limpo.exec("drop table if exists public.enrollment_projection_issues");
  registrar("banco limpo: aplicar e reverter volta colunas, políticas e gatilhos ao estado original", (await assinatura()) === antes);
}

const falhas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} PASS (PostgreSQL ${(await db.query("show server_version")).rows[0].server_version}, PGlite)`);
process.exit(falhas ? 1 : 0);
