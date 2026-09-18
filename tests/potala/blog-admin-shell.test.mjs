import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const ler = (caminho) => readFileSync(new URL(`../../outputs/${caminho}`, import.meta.url), "utf8");
const html = ler("blog-admin.html");
const css = ler("css/blog-admin.css");
const entry = ler("js/blog-admin/blog-admin-entry.js");
const editor = ler("js/blog-admin/blog-editor.js");
const homeAdmin = ler("admin.html");

test("a mesa do Blog reutiliza autenticação e cliente Supabase existentes", () => {
  assert.match(entry, /createAdminAuth/);
  assert.match(entry, /getSupabaseClient/);
  assert.ok(!/signUp|createUser/.test(entry));
  assert.match(html, /data-admin-auth-form/);
  assert.equal((html.match(/data-admin-sign-out/g) || []).length, 1, "um botão de sair só: é nele que a autenticação escuta");
});

test("a casca tem as quatro áreas, o editor e as peças comuns", () => {
  for (const tela of ["visao", "posts", "comentarios", "configuracoes", "editor"]) {
    assert.match(html, new RegExp(`data-mesa-view="${tela}"`), `faltou a tela ${tela}`);
  }
  for (const destino of ["visao", "posts", "comentarios", "configuracoes"]) {
    assert.match(html, new RegExp(`href="#/${destino}" data-mesa-nav="${destino}"`), `faltou o link ${destino}`);
  }
  for (const peca of ["data-mesa-avisos", "data-mesa-confirmar", "data-mesa-paleta", "data-mesa-biblioteca", "data-mesa-menu", "data-mesa-gaveta"]) {
    assert.match(html, new RegExp(peca), `faltou ${peca}`);
  }
  assert.match(html, /href="#\/novo"/);
  assert.ok(!html.includes("data-layout-position"));
});

test("o layout muda no tablet e vira gaveta no celular", () => {
  assert.match(css, /grid-template-columns/);
  assert.match(css, /@media \(max-width: 1100px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /\[data-gaveta="aberta"\] \.mesa-trilho/);
  assert.match(css, /prefers-reduced-motion/);
});

test("os dois painéis se conectam", () => {
  assert.match(homeAdmin, /href="\/blog(#\/[a-z]+)?"/);
  assert.match(html, /data-blog-teste/);
  assert.match(entry, /criarMesa/);
  assert.doesNotMatch(entry, /acesso"\) === "teste"/);
});

test("a prévia usa a página pública do artigo, no computador e no celular", () => {
  assert.match(editor, /artigo\.html\?preview=1/);
  assert.match(editor, /data-previa-aparelho="desktop"/);
  assert.match(editor, /data-previa-aparelho="mobile"/);
  assert.match(editor, /data-previa-nova-aba/);
});

test("nenhum ícone da mesa fica fora do sprite", async () => {
  const { ICONES } = await import("../../outputs/js/admin/icones.js");
  const nomes = new Set(ICONES);
  const fontes = ["blog-admin.html", ...["mesa-app", "mesa-blocos", "mesa-midia", "mesa-modelo", "mesa-ui", "mesa-visoes", "blog-editor"].map((nome) => `js/blog-admin/${nome}.js`)];
  for (const fonte of fontes) {
    const texto = ler(fonte);
    const usados = [
      ...[...texto.matchAll(/icones-admin\.svg#([a-z0-9-]+)/g)].map((m) => m[1]),
      ...[...texto.matchAll(/\bi(?:cone)?\("([a-z0-9-]+)"/g)].map((m) => m[1]),
      ...[...texto.matchAll(/icone: "([a-z0-9-]+)"/g)].map((m) => m[1]),
    ];
    for (const nome of usados) assert.ok(nomes.has(nome), `${fonte} usa o ícone ${nome}, que não está no sprite`);
  }
});
