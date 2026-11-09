import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { nivelDoBlog, rotuloDoPapel } from "../../outputs/js/admin/admin-auth.js";

const ler = (caminho) => readFile(new URL(`../../outputs/${caminho}`, import.meta.url), "utf8");

test("o rótulo do painel vem das permissões reais, não só do papel global", () => {
  assert.equal(rotuloDoPapel({ role: "owner", permissions: { publish: true } }), "Administração");
  assert.equal(rotuloDoPapel({ role: "blog_editor", permissions: { read: true, edit: true, publish: true } }), "Editor do Blog");
  assert.equal(rotuloDoPapel({ role: "blog_editor", permissions: { read: true, edit: true, publish: false } }), "Escritor do Blog");
  assert.equal(rotuloDoPapel({ role: "blog_editor", permissions: { read: true, edit: false, publish: false } }), "Leitor do Blog");
  assert.equal(rotuloDoPapel({ role: "blog_editor" }), "Leitor do Blog");
  assert.equal(nivelDoBlog({ role: "owner" }), "total");
  assert.equal(rotuloDoPapel({ role: "admin" }), "Equipe administrativa");
});

test("a entrada usa o rótulo por permissão e informa o nível ao painel", async () => {
  const entrada = await ler("js/admin/admin-entry.js");
  assert.match(entrada, /rotuloDoPapel\(access\)/);
  assert.match(entrada, /blogNivel:/);
  assert.doesNotMatch(entrada, /"blog_editor" \? "Editor do Blog"/);
});

test("o cartão do Blog do Escritor não promete publicar", async () => {
  const shell = await ler("js/admin/admin-shell.js");
  assert.match(shell, /blogNivel === "escritor"/);
  assert.match(shell, /blogNivel === "leitor"/);
  assert.match(shell, /enviar textos para revis/);
  const html = await ler("admin.html");
  assert.match(html, /data-blog-titulo/);
  assert.match(html, /data-blog-texto/);
});

test("os atalhos do Blog têm espaçamento próprio e quebram de linha", async () => {
  const html = await ler("admin.html");
  assert.match(html, /admin-workspace-toolbar admin-workspace-toolbar--links/);
  assert.doesNotMatch(html, /\$1/);
  const barra = html.match(/admin-workspace-toolbar--links">([\s\S]*?)<\/div>/)[1];
  assert.equal((barra.match(/<a class="admin-workspace-link"/g) || []).length, 3);
  assert.match(barra, /^\s*<a class="admin-workspace-link" href="\/blog#\/visao">Abrir a mesa do Blog<\/a>/);
  const css = await ler("css/admin.css");
  assert.match(css, /\.admin-workspace-toolbar--links\s*\{[^}]*flex-wrap:\s*wrap;[^}]*gap:/);
  assert.match(css, /\.admin-workspace-toolbar--links \.admin-workspace-link\s*\{[^}]*min-height:\s*44px/);
});
