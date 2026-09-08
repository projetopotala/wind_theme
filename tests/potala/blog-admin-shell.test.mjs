import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../outputs/blog-admin.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../../outputs/css/blog-admin.css", import.meta.url), "utf8");
const entry = readFileSync(new URL("../../outputs/js/blog-admin/blog-admin-entry.js", import.meta.url), "utf8");
const homeAdmin = readFileSync(new URL("../../outputs/admin.html", import.meta.url), "utf8");

test("o editor do Blog reutiliza autenticação e cliente Supabase existentes", () => {
  assert.match(entry, /createAdminAuth/);
  assert.match(entry, /getSupabaseClient/);
  assert.ok(!/signUp|createUser/.test(entry));
  assert.match(html, /data-admin-auth-form/);
  assert.match(html, /data-admin-sign-out/);
});

test("o shell tem lista, prévia e opções sem permitir layout livre", () => {
  for (const hook of ["data-blog-editor-list", "data-blog-preview", "data-blog-editor-form", "data-blog-blocks"]) {
    assert.match(html, new RegExp(hook), `faltou ${hook}`);
  }
  assert.ok(!html.includes("data-layout-position"));
  assert.match(css, /grid-template-columns/);
  assert.match(css, /@media \(max-width: 1100px\)/);
});

test("os dois painéis se conectam", () => {
  assert.match(homeAdmin, /href="\/blog"/);
  assert.match(html, /href="\/admin"/);
  assert.match(html, /acesso=teste/);
  assert.match(entry, /acesso"\) === "teste"/);
});

test("a prévia pode alternar Blog, artigo e dispositivo", () => {
  assert.match(html, /data-preview-page="blog"/);
  assert.match(html, /data-preview-page="article"/);
  assert.match(html, /data-preview-device="desktop"/);
  assert.match(html, /data-preview-device="mobile"/);
});
