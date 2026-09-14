import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { STATUS_DE_INSCRICAO, TIPOS_DE_ITEM, TIPOS_DE_NOTIFICACAO } from "../../outputs/js/conta/modelos.js";

const sql = await readFile(new URL("../../supabase/migrations/202609140001_conta_visitante.sql", import.meta.url), "utf8");

const TABELAS = [
  "profiles",
  "saved_items",
  "history_items",
  "followed_items",
  "enrollments",
  "course_progress",
  "schedule_items",
  "notifications",
  "notification_preferences",
];

function blocoDaTabela(tabela) {
  const inicio = sql.indexOf(`create table if not exists public.${tabela} (`);
  assert.ok(inicio >= 0, `a tabela ${tabela} nao foi criada`);
  return sql.slice(inicio, sql.indexOf("\n);", inicio));
}

function listaDoCheck(bloco, coluna) {
  const achado = new RegExp(`check \\(${coluna} in \\(([^)]*)\\)\\)`).exec(bloco);
  assert.ok(achado, `sem check de ${coluna}`);
  return achado[1].split(",").map((valor) => valor.trim().replace(/^'|'$/g, ""));
}

function concessoes(tabela) {
  return [...sql.matchAll(new RegExp(`grant ([^;]+) on table public\\.${tabela} to authenticated;`, "g"))].map((achado) => achado[1]);
}

test("toda tabela pessoal tem RLS ligada e nada liberado ao anonimo", () => {
  for (const tabela of TABELAS) {
    assert.match(sql, new RegExp(`alter table public\\.${tabela} enable row level security;`), `${tabela} sem RLS`);
    assert.match(sql, new RegExp(`revoke all on table public\\.${tabela} from anon, authenticated;`), `${tabela} sem revoke`);
  }
  assert.doesNotMatch(sql, /grant [^;]* to anon/, "algo foi concedido ao anonimo");
});

test("toda politica compara com (select auth.uid())", () => {
  /*
   * O select em volta de auth.uid() e a forma recomendada: avaliado uma vez por
   * consulta, e nao uma vez por linha. E sem ele, nenhuma politica prende a
   * linha a pessoa.
   */
  const politicas = [...sql.matchAll(/create policy "[^"]+"[\s\S]*?;/g)].map((achado) => achado[0]);
  assert.ok(politicas.length >= 20, `so ${politicas.length} politicas`);
  for (const politica of politicas) {
    assert.match(politica, /\(select auth\.uid\(\)\)/, politica.split("\n")[0]);
    assert.match(politica, /to authenticated/, politica.split("\n")[0]);
  }
});

test("inscricoes e progresso sao so leitura para o navegador", () => {
  /* Deixar a pessoa marcar a propria inscricao como concluida seria confiar no frontend. */
  assert.deepEqual(concessoes("enrollments"), ["select"]);
  assert.deepEqual(concessoes("course_progress"), ["select"]);
  assert.doesNotMatch(sql, /create policy "[^"]+" on public\.(enrollments|course_progress)\s+for (insert|update|delete)/);
});

test("avisos nascem no servidor; o navegador so marca como lido", () => {
  assert.deepEqual(concessoes("notifications"), ["select", "update (read_at)"]);
  assert.doesNotMatch(sql, /on public\.notifications\s+for insert/);
});

test("a agenda do Instituto nao pode ser criada nem alterada pelo navegador", () => {
  for (const nome of ["visitante cria compromisso pessoal", "visitante altera compromisso pessoal", "visitante apaga compromisso pessoal"]) {
    const politica = new RegExp(`create policy "${nome}"[\\s\\S]*?;`).exec(sql)?.[0] || "";
    assert.match(politica, /origin = 'pessoal'/, nome);
  }
});

test("o gatilho do perfil nao vira RPC publico nem sequestravel", () => {
  const funcao = /create or replace function public\.handle_new_visitor\(\)[\s\S]*?\$\$;/.exec(sql)?.[0] || "";
  assert.match(funcao, /security definer/);
  assert.match(funcao, /set search_path = ''/);
  assert.match(sql, /revoke execute on function public\.handle_new_visitor\(\) from public, anon, authenticated;/);
  assert.match(sql, /after insert on auth\.users/);
});

test("nenhuma senha passa por estas tabelas", () => {
  /* Quem guarda a senha e o Supabase Auth. Uma coluna de hash aqui repetiria o erro do painel. */
  assert.doesNotMatch(sql, /password|senha_hash|crypt\(/i);
});

test("os enderecos gravados precisam ser do Portal ou https", () => {
  for (const tabela of ["saved_items", "history_items"]) {
    assert.ok(blocoDaTabela(tabela).includes("check (href ~ '^(/[^/\\\\]|/$|https://)')"), `${tabela} aceita qualquer href`);
  }
});

test("as listas do banco batem com as dos modelos", () => {
  /*
   * Um tipo novo acrescentado so no JavaScript passaria nos testes de tela e
   * seria recusado pelo banco na primeira gravacao — com a pessoa ja tendo
   * clicado em Salvar.
   */
  const tiposDeItem = Object.keys(TIPOS_DE_ITEM).sort();
  assert.deepEqual(listaDoCheck(blocoDaTabela("saved_items"), "item_type").sort(), tiposDeItem);
  assert.deepEqual(listaDoCheck(blocoDaTabela("history_items"), "item_type").sort(), tiposDeItem);
  assert.deepEqual(listaDoCheck(blocoDaTabela("enrollments"), "status").sort(), Object.keys(STATUS_DE_INSCRICAO).sort());

  const avisos = TIPOS_DE_NOTIFICACAO.map((tipo) => tipo.id).sort();
  assert.deepEqual(listaDoCheck(blocoDaTabela("notifications"), "kind").sort(), avisos);
  assert.deepEqual(listaDoCheck(blocoDaTabela("notification_preferences"), "kind").sort(), avisos);
});
