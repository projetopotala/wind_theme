/*
 * P1 INSCRIÇÕES — TESTES ESTÁTICOS E DE CONTRATO DOS RASCUNHOS SQL.
 *
 * ATENÇÃO: isto é análise de TEXTO. Passar aqui não prova que o SQL é seguro
 * nem que roda no Supabase. O comportamento (RLS, gatilhos, permissões) é
 * exercitado em PostgreSQL isolado por scripts/p1-inscricoes-pglite.mjs, que
 * fica fora do test:portal por depender de um pacote não instalado no projeto.
 *
 * O que estes testes travam: que os rascunhos continuem rascunhos, que as
 * duas partes continuem separadas, e que as correções da revisão P1.1 não
 * sejam desfeitas sem alguém perceber.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const PASTA = new URL("../../supabase/drafts/p1-inscricoes/", import.meta.url);
const ler = async (nome) => (await readFile(new URL(nome, PASTA), "utf8")).replace(/\r\n/g, "\n");
const semComentarios = (sql) => sql.replace(/--.*$/gm, "");

const estrutura = await ler("01_estrutura.RASCUNHO.sql");
const projecao = await ler("02_projecao.RASCUNHO.sql");
const revProjecao = await ler("90_reversao_projecao.RASCUNHO.sql");
const revEstrutura = await ler("91_reversao_estrutura.RASCUNHO.sql");
const prechecagem = await ler("00_prechecagem_somente_leitura.sql");

/* Variáveis locais e CTEs das funções, que não são tabelas (para a checagem de esquema). */
const NAO_TABELAS = new Set(["new", "old", "set", "pedido", "inscricao", "turma", "professor", "conta", "copia", "situacao", "titulo",
  "chave_curso", "alvo", "ultima_falha", "falhas_novas", "painel", "visiveis"]);

function funcoes(sql) {
  return [...semComentarios(sql).matchAll(/create or replace function (public\.[a-z_]+)\(([^)]*)\)([\s\S]*?)\$\$;/g)]
    .map(([, nome, args, corpo]) => ({ nome, args, corpo }));
}

test("rascunhos ficam fora de supabase/migrations", async () => {
  const migrations = await readdir(new URL("../../supabase/migrations/", import.meta.url));
  assert.ok(!migrations.some((nome) => /p1|inscric|op_profile_accounts/i.test(nome)), "nenhuma migration da P1 pode estar na pasta aplicável");
  for (const nome of await readdir(PASTA)) {
    if (!nome.endsWith(".sql") || nome.startsWith("00_")) continue;
    assert.match(nome, /\.RASCUNHO\.sql$/, `${nome} precisa se identificar como rascunho`);
  }
});

test("cada script de escrita se recusa a rodar sem a autorização da sessão", () => {
  for (const [nome, sql, chave] of [
    ["estrutura", estrutura, "estrutura"], ["projeção", projecao, "projecao"],
    ["reversão da projeção", revProjecao, "reverter-projecao"], ["reversão da estrutura", revEstrutura, "reverter-estrutura"],
  ]) {
    const corpo = semComentarios(sql).trim();
    assert.ok(corpo.startsWith("do $trava$"), `${nome}: a trava precisa ser a primeira instrução`);
    assert.ok(corpo.includes(`current_setting('potala.p1_aprovado', true), '') <> '${chave}'`), `${nome}: chave ${chave}`);
    assert.ok(corpo.indexOf("$trava$;") < corpo.indexOf("begin;"), `${nome}: a trava roda antes da transação`);
  }
});

test("PARTE 1 e PARTE 2 são fisicamente separadas: a estrutura não instala cópia", () => {
  const s = semComentarios(estrutura);
  for (const proibido of ["op_projetar_inscricao", "op_records_projetar", "op_profile_accounts_projetar", "insert into public.enrollments", "enrollment_projection_issues"]) {
    assert.ok(!s.includes(proibido), `a PARTE 1 não pode conter ${proibido}`);
  }
  assert.ok(semComentarios(projecao).includes("A PARTE 1 (estrutura) não está aplicada"));
  assert.equal((s.match(/^begin;$/gm) || []).length, 1);
  assert.equal((s.match(/^commit;$/gm) || []).length, 1);
});

test("identidade do pedido: só a sessão define user_id", () => {
  const s = semComentarios(estrutura);
  assert.doesNotMatch(s, /grant[^;]*\(\s*[^)]*user_id[^)]*\)[^;]*site_interests/i, "user_id não pode entrar no grant de site_interests");
  assert.doesNotMatch(s, /grant\s+insert\s+on\s+(table\s+)?public\.site_interests/i, "nenhum grant de insert em nível de tabela");
  assert.doesNotMatch(s, /default auth\.uid\(\)/, "default não é proteção: tem de ser o gatilho");
  assert.match(s, /new\.user_id := \(select auth\.uid\(\)\);/);
  assert.match(s, /before insert on public\.site_interests/);
  assert.match(s, /user_id is not distinct from \(select auth\.uid\(\)\)/);
  assert.match(s, /kind in \('curso', 'experiencia-cultural', 'retorno-recepcao'\)/, "formulários públicos continuam aceitos");
});

test("vínculo: só por pedido de curso de uma conta, sem user_id nem 'codigo' vindos do cliente", () => {
  const s = semComentarios(estrutura);
  assert.match(s, /grant insert \(op_profile_id, interest_id\) on table public\.op_profile_accounts to authenticated;/);
  assert.doesNotMatch(s, /grant[^;]*\b(user_id|source|linked_by)\b[^;]*op_profile_accounts/);
  assert.match(s, /source text not null default 'pedido' check \(source = 'pedido'\)/);
  assert.doesNotMatch(s, /'codigo'/);
  const validar = funcoes(estrutura).find((f) => f.nome === "public.op_profile_accounts_validar").corpo;
  for (const regra of [/public\.is_portal_admin\(\)/, /pedido\.kind <> 'curso'/, /pedido\.user_id is null/, /collection = 'profiles'/,
    /new\.user_id := pedido\.user_id/, /new\.linked_by := \(select auth\.uid\(\)\)/, /from public\.op_meta as meta where meta\.id = 1 for update/]) {
    assert.match(validar, regra, `validação sem ${regra}`);
  }
  assert.match(s, /user_id uuid not null unique references auth\.users/);
});

test("nenhuma linha de public.enrollments é apagada pela cópia", () => {
  const p = semComentarios(projecao);
  assert.doesNotMatch(p, /delete\s+from\s+public\.enrollments/i);
  assert.doesNotMatch(semComentarios(revProjecao), /delete\s+from\s+public\.enrollments/i);
  assert.match(p, /hidden_at = now\(\)/);
  assert.match(p, /where e\.op_enrollment_id is not null/, "nunca sobrescreve linha de outra origem");
  assert.match(semComentarios(estrutura), /using \(\(select auth\.uid\(\)\) = user_id and hidden_at is null\)/);
});

test("reversão da estrutura recusa perder dados", () => {
  const r = semComentarios(revEstrutura);
  for (const guarda of [/op_projetar_inscricao/, /op_enrollment_id is not null or hidden_at is not null/, /from public\.op_profile_accounts/, /site_interests where user_id is not null/]) {
    assert.match(r, guarda);
  }
  assert.ok(r.indexOf("$seguranca$;") < r.indexOf("drop "), "as checagens rodam antes de qualquer drop");
});

test("SECURITY DEFINER: search_path vazio, nomes qualificados e EXECUTE revogado de PUBLIC", () => {
  for (const sql of [estrutura, projecao]) {
    const texto = semComentarios(sql);
    for (const f of funcoes(sql)) {
      assert.match(f.corpo, /set search_path = ''/, `${f.nome}: search_path`);
      const assinatura = f.args.replace(/\s+default\s+[^,]+/g, "").split(",").map((a) => a.trim().split(/\s+/).pop()).filter(Boolean).join(", ");
      const revoke = `revoke all on function ${f.nome}(${assinatura}) from public, anon, authenticated;`;
      assert.ok(texto.includes(revoke), `${f.nome}: falta "${revoke}"`);
      const tabelas = [...f.corpo.matchAll(/\b(?:from|join|update|into)\s+([a-z_]+)(?:\s|$)/g)].map((m) => m[1]).filter((nome) => !NAO_TABELAS.has(nome));
      assert.deepEqual(tabelas, [], `${f.nome}: tabela sem esquema: ${tabelas.join(", ")}`);
    }
    /* Só as duas funções de administração são executáveis, e ambas checam a administração por dentro. */
    const expostas = [...texto.matchAll(/grant execute on function (public\.[a-z_]+)\(\) to ([a-z, ]+);/g)];
    for (const [, nome, papeis] of expostas) {
      assert.ok(["public.op_inscricoes_divergentes", "public.op_reconciliar_inscricoes"].includes(nome), `${nome} não deveria ser executável`);
      assert.equal(papeis.trim(), "authenticated", `${nome}: só authenticated`);
      const corpo = funcoes(sql).find((f) => f.nome === nome).corpo;
      assert.match(corpo, /if not public\.is_portal_admin\(\) then\s+raise exception[^;]+errcode = '42501'/, `${nome}: precisa recusar quem não é administração`);
    }
    assert.equal((texto.match(/grant execute/gi) || []).length, expostas.length, "grant execute fora do padrão");
  }
});

test("reconciliação e ocultação (P1.2)", () => {
  const p = semComentarios(projecao);
  const reconciliar = funcoes(projecao).find((f) => f.nome === "public.op_reconciliar_inscricoes").corpo;
  assert.match(reconciliar, /from public\.op_meta as meta where meta\.id = 1 for update/, "reconciliação entra na fila do op_apply");
  assert.doesNotMatch(reconciliar, /delete\s+from/i, "reconciliação não apaga nada");
  assert.match(p, /before update of hidden_at on public\.enrollments/, "ocultar tira a cópia da chave do curso");
  assert.match(p, /new\.course_ref := 'oculta:' \|\| new\.id::text;/);
  const projetar = funcoes(projecao).find((f) => f.nome === "public.op_projetar_inscricao").corpo;
  assert.match(projetar, /e\.op_enrollment_id = p_op_enrollment_id\s+and e\.user_id = conta\s+and e\.op_course_ref = chave_curso/,
    "só reaproveita a linha da MESMA inscrição, conta e turma");
  assert.doesNotMatch(projetar, /on conflict/i, "sem upsert genérico que poderia reaproveitar linha alheia");
});

test("nada novo é concedido a anon e nenhuma política é aberta", () => {
  const grants = [...semComentarios(estrutura + projecao).matchAll(/grant [^;]*;/gi)].map((m) => m[0]);
  assert.ok(grants.every((g) => !/\banon\b/.test(g)), grants.join(" | "));
  assert.doesNotMatch(semComentarios(estrutura + projecao), /using \(true\)|with check \(true\)/);
});

test("pré-checagem é um único SELECT, sem escrita e sem dados pessoais", () => {
  const s = semComentarios(prechecagem).trim();
  assert.match(s, /^with /);
  assert.equal((s.match(/;/g) || []).length, 1);
  assert.doesNotMatch(s, /\b(insert|update|delete|alter|create|drop|grant|revoke|truncate)\b/i);
  assert.doesNotMatch(s, /'email'|display_name|details|\bsubject\b/, "não lê nome, e-mail nem conteúdo de pedido");
});
