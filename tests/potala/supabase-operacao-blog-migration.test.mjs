import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { levaDoBlog } from "../../scripts/gerar-semente-blog.mjs";

const ler = (nome) => readFile(new URL(`../../supabase/migrations/${nome}`, import.meta.url), "utf8");
const operacao = await ler("202609170001_operacao_do_instituto.sql");
const blog = await ler("202609170002_blog_e_participacao.sql");
const semente = await ler("202609170003_semente_do_blog.sql");
const segundaLeva = await ler("202609180003_mais_textos_do_blog.sql");
const senha = await ler("202609170004_senha_do_painel_fora_do_alcance_anonimo.sql");
const semComentarios = (sql) => sql.replace(/--.*$/gm, "");

test("toda migração nova roda numa transação só", () => {
  for (const sql of [operacao, blog, semente, segundaLeva, senha]) {
    assert.match(sql, /^begin;$/m);
    assert.match(sql, /^commit;\s*$/m);
    /* "revoke truncate" é permissão, não apagar dados; o que não pode é o comando. */
    assert.doesNotMatch(semComentarios(sql), /\bdrop\s+table\b|^\s*truncate\b/im);
  }
});

test("as tabelas da operação não têm grant a ninguém: só as funções as alcançam", () => {
  const sql = semComentarios(operacao);
  for (const tabela of ["op_records", "op_meta", "op_requests"]) {
    assert.match(sql, new RegExp(`alter table public\\.${tabela} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${tabela} from anon, authenticated`));
    assert.doesNotMatch(sql, new RegExp(`grant [^;]* on table public\\.${tabela}`));
  }
});

test("ler e gravar a operação exige administração, e o anônimo nem executa", () => {
  const sql = semComentarios(operacao);
  assert.equal((sql.match(/if not public\.is_portal_admin\(\) then/g) || []).length, 2);
  assert.match(sql, /revoke all on function public\.op_snapshot\(\) from public, anon;/);
  assert.match(sql, /revoke all on function public\.op_apply\([^)]*\) from public, anon;/);
  assert.doesNotMatch(sql, /grant execute on function public\.op_\w+\([^)]*\) to [^;]*anon/);
  assert.match(sql, /security definer\s+set search_path = ''/);
});

test("a gravação confere revisão, repetição e autor na mesma transação", () => {
  const sql = semComentarios(operacao);
  assert.match(sql, /for update/, "a linha de revisão precisa ser travada");
  assert.match(sql, /errcode = 'PT409'/, "revisão velha responde 409");
  assert.match(sql, /Identificador reutilizado/);
  assert.match(sql, /where usuario\.id = \(select auth\.uid\(\)\)/, "o autor vem da sessão, não do navegador");
  assert.match(sql, /'audit_events'/);
  assert.match(sql, /op_records_room_code/);
  assert.match(sql, /op_records_asset_code/);
});

test("o visitante envia comentário, mas não escolhe a situação dele", () => {
  const sql = semComentarios(blog);
  assert.match(sql, /grant insert \(post_slug, author_name, body\) on table public\.blog_comments to anon, authenticated;/);
  assert.match(sql, /with check \(status = 'pending' and reviewed_at is null\)/);
  assert.match(sql, /for select to anon, authenticated using \(status = 'approved'\)/);
  assert.doesNotMatch(sql, /grant update[^;]*blog_comments to anon/);
});

test("texto do Blog só é escrito por administração; o público lê o publicado", () => {
  const sql = semComentarios(blog);
  assert.match(sql, /using \(status = 'published'\)/);
  assert.doesNotMatch(sql, /grant (insert|update)[^;]* on table public\.blog_posts/);
  assert.match(sql, /create or replace function public\.save_blog_post[\s\S]*?if not public\.is_portal_admin\(\) then/);
  assert.match(sql, /revoke all on function public\.save_blog_post\(jsonb\) from public, anon;/);
});

test("inscrição e interesses: o visitante envia e não lê o que outros enviaram", () => {
  const sql = semComentarios(blog);
  assert.doesNotMatch(sql, /grant [^;]*select[^;]* on table public\.newsletter_subscriptions to [^;]*anon/);
  assert.doesNotMatch(sql, /grant [^;]*select[^;]* on table public\.site_interests to [^;]*anon/);
  assert.match(sql, /grant insert \(kind, subject, details, page\) on table public\.site_interests to anon, authenticated;/);
  assert.match(sql, /on conflict \(\(lower\(email\)\)\) do nothing/, "repetir o e-mail não revela quem já está inscrito");
  assert.match(sql, /pg_column_size\(details\) <= 4000/);
});

test("as sementes do Blog são o acervo empacotado e nunca sobrescrevem edição", () => {
  assert.equal(semente.replace(/\r\n/g, "\n"), levaDoBlog(1), "a primeira leva já aplicada não pode mudar");
  assert.equal(segundaLeva.replace(/\r\n/g, "\n"), levaDoBlog(2), "rode npm run db:seed-blog para regenerar a segunda leva");
  for (const sql of [semente, segundaLeva]) assert.match(sql, /on conflict do nothing;/);
  assert.equal((semente.match(/, true, '/g) || []).length, 1, "um destaque só");
  assert.equal((segundaLeva.match(/, true, '/g) || []).length, 0, "o destaque continua sendo o da primeira leva");
  assert.equal((segundaLeva.match(/::jsonb/g) || []).length, 12);
});

/*
 * No Supabase, função nova em public nasce com EXECUTE para anon e
 * authenticated. Revogar só de PUBLIC não tira esse grant — foi assim que
 * set_portal_user_password ficou chamável por qualquer visitante.
 */
test("as funções de senha deixam de responder a quem visita o site", () => {
  assert.match(senha, /revoke all on function public\.set_portal_user_password\(text, text\) from public, anon, authenticated;/);
  assert.match(senha, /revoke all on function public\.verify_portal_password\(text, text\) from public, anon, authenticated;/);
  assert.match(senha, /revoke all on table public\.home_block_drafts from anon;/);
  assert.match(senha, /to_regprocedure/);
});

test("toda função nova revoga o anônimo explicitamente, não só PUBLIC", () => {
  for (const sql of [operacao, blog]) {
    for (const [, nome] of semComentarios(sql).matchAll(/create or replace function public\.(\w+)\(/g)) {
      const revoga = new RegExp(`revoke all on function public\\.${nome}\\([^)]*\\) from public(, anon)?;`).exec(sql);
      assert.ok(revoga, `${nome} sem revoke`);
      const publica = ["register_blog_view", "subscribe_newsletter"].includes(nome);
      assert.equal(Boolean(revoga[1]), !publica, publica ? `${nome} é pública de propósito` : `${nome} precisa revogar anon`);
    }
  }
});
