import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { MIDIA_LIMITE, MIDIA_TIPOS, validarImagem } from "../../outputs/js/blog/blog-remoto.js";

const sql = await readFile(new URL("../../supabase/migrations/202609180004_mesa_do_blog.sql", import.meta.url), "utf8");
const semComentarios = sql.replace(/--.*$/gm, "");

test("a migração da mesa roda numa transação só e não apaga tabela", () => {
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;\s*$/m);
  assert.doesNotMatch(semComentarios, /\bdrop\s+table\b|^\s*truncate\b/im);
});

test("o visitante nunca lê as alterações pendentes", () => {
  assert.match(sql, /revoke select on table public\.blog_posts from anon, authenticated;/);
  const [, colunas] = /grant select \(([^)]*)\)\s*on table public\.blog_posts to anon, authenticated;/.exec(sql) || [];
  assert.ok(colunas, "a leitura pública é por coluna");
  assert.doesNotMatch(colunas, /pending_document/);
  assert.match(colunas, /\bdocument\b/);
});

test("o agendado só aparece quando a hora chega", () => {
  assert.match(sql, /using \(status = 'published' or \(status = 'scheduled' and publish_at <= now\(\)\)\)/);
  assert.match(sql, /Escolha uma data e um horário no futuro para agendar\./);
});

test("as funções da mesa conferem a administração e não respondem ao visitante", () => {
  for (const nome of ["mesa_listar_posts", "mesa_salvar_post"]) {
    const corpo = new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\$\\$;`).exec(sql)?.[0] || "";
    assert.match(corpo, /security definer/, `${nome} roda com os direitos do dono`);
    assert.match(corpo, /set search_path = ''/, `${nome} fixa o search_path`);
    assert.match(corpo, /if not public\.is_portal_admin\(\) then/, `${nome} confere a administração`);
    assert.match(sql, new RegExp(`revoke all on function public\\.${nome}\\([^)]*\\) from public, anon;`), `${nome} revoga o anônimo`);
  }
  for (const nome of ["mesa_post_json", "blog_categoria_em_uso"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${nome}\\([^)]*\\) from public, anon, authenticated;`), `${nome} é interna`);
  }
});

test("categorias: todos leem, só a administração escreve, e categoria em uso não se apaga", () => {
  assert.match(sql, /create policy "todos leem as categorias" on public\.blog_categories/);
  for (const acao of ["cria", "altera", "apaga"]) {
    assert.match(sql, new RegExp(`create policy "administracao ${acao} categorias"[^;]*is_portal_admin`));
  }
  assert.match(sql, /blog_categoria_em_uso/);
});

test("a mídia do Blog aceita só imagens de até 5 MB, e só a administração envia", () => {
  assert.match(sql, /\('blog-midia', 'blog-midia', true, 5242880, array\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/);
  for (const politica of ["lista", "envia", "troca", "remove"]) {
    assert.match(sql, new RegExp(`create policy "mesa ${politica} (?:a )?midia do blog"[^;]*bucket_id = 'blog-midia' and \\(select public\\.is_portal_admin\\(\\)\\)`));
  }
  assert.equal(MIDIA_LIMITE, 5242880, "o navegador recusa antes o que o banco recusaria");
  assert.deepEqual([...MIDIA_TIPOS], ["image/jpeg", "image/png", "image/webp"]);
  assert.match(validarImagem({ type: "image/gif", size: 10 }), /JPG, PNG ou WEBP/);
  assert.match(validarImagem({ type: "image/png", size: MIDIA_LIMITE + 1 }), /limite é 5 MB/);
  assert.equal(validarImagem({ type: "image/webp", size: 1000 }), "");
});
