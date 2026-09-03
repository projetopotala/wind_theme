import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const url = new URL(
  "../../supabase/migrations/202609030003_home_block_drafts.sql",
  import.meta.url,
);
const sql = await readFile(url, "utf8");

test("a tabela de rascunhos espelha as restrições da publicada", () => {
  assert.match(sql, /create table if not exists public\.home_block_drafts/i);
  assert.match(sql, /side text not null check \(side in \('left', 'right'\)\)/i);
  assert.match(sql, /position integer not null check \(position >= 0\)/i);
  assert.match(sql, /slug text not null unique/i);
  assert.match(sql, /updated_at timestamptz not null/i);
});

/*
 * O teste que mais importa deste arquivo.
 *
 * Rascunho é texto não publicado do instituto. Um grant para anon o entregaria
 * por uma URL do Supabase, sem login, para quem soubesse o endereço do projeto.
 *
 * A asserção é sobre a AUSÊNCIA: um grant acrescentado depois passaria intacto
 * por uma checagem que só confirmasse a presença do grant certo.
 */
test("anon não recebe nada sobre rascunhos", () => {
  const grantsParaAnon = sql.match(/grant[^;]*to anon\s*;/gi) || [];
  for (const grant of grantsParaAnon) {
    assert.doesNotMatch(grant, /home_block_drafts/i, `grant indevido: ${grant}`);
  }
  assert.match(
    sql,
    /grant select, insert, update, delete on table public\.home_block_drafts to authenticated/i,
  );
});

test("toda política de rascunho exige administrador", () => {
  const politicas = sql.match(/create policy[\s\S]*?;/gi) || [];
  const deRascunho = politicas.filter((politica) => /home_block_drafts/i.test(politica));
  assert.ok(
    deRascunho.length >= 4,
    "faltam políticas para ler, inserir, atualizar e apagar",
  );
  for (const politica of deRascunho) {
    assert.match(politica, /public\.is_portal_admin\(\)/i, `política sem guarda: ${politica}`);
  }
});

test("a tabela de rascunhos tem RLS ligada", () => {
  assert.match(sql, /alter table public\.home_block_drafts enable row level security/i);
});

test("publicar é uma transação só", () => {
  assert.match(sql, /create or replace function public\.publish_home_block_drafts\(\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /portal_admin_required/i);
  assert.match(sql, /insert into public\.home_blocks/i);
  assert.match(sql, /on conflict \(id\) do update/i);
  assert.match(sql, /delete from public\.home_block_drafts where true/i);
});

test("as três colunas novas existem nas duas tabelas", () => {
  for (const coluna of ["title_scale", "allow_panel", "meta_description"]) {
    const ocorrencias = sql.match(new RegExp(coluna, "gi")) || [];
    assert.ok(
      ocorrencias.length >= 2,
      `${coluna} precisa existir na tabela publicada e na de rascunhos`,
    );
  }
});

/* O safe-update das conexões da API recusa um DELETE sem predicado antes de
   rodar. Foi o defeito que a migração 0002 veio consertar; não pode voltar. */
test("a limpeza da tabela de rascunhos continua qualificada", () => {
  assert.doesNotMatch(sql, /delete\s+from\s+public\.home_block_drafts\s*;/i);
});
