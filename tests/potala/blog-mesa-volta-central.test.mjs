import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { permissoesDaSessao } from "../../outputs/js/blog-admin/mesa-modelo.js";
import { secaoDoHash } from "../../outputs/js/admin/admin-rotas.js";

const html = readFileSync(new URL("../../outputs/blog-admin.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../../outputs/js/blog-admin/mesa-app.js", import.meta.url), "utf8");
const sprite = readFileSync(new URL("../../outputs/media/icones-admin.svg", import.meta.url), "utf8");

test("a trilha da Mesa tem um caminho de volta à Central, escondido até saber quem entrou", () => {
  const link = html.match(/<a [^>]*data-mesa-central[^>]*>/)?.[0];
  assert.ok(link, "o link existe");
  assert.match(link, /href="\/admin\/#\/inicio"/);
  assert.match(link, /\bhidden\b/);
  assert.match(link, /title="Voltar à Central operacional"/);
  /* O destino é uma seção que a Central sabe abrir, e o ícone existe no sprite. */
  assert.equal(secaoDoHash("#/inicio"), "inicio");
  const icone = html.match(/data-mesa-central[\s\S]*?icones-admin\.svg#([a-z0-9-]+)/)?.[1];
  assert.ok(icone && sprite.includes(`id="${icone}"`), `ícone ${icone} no sprite`);
  /* Não é um segundo "Sair" nem mexe no Sair: o logout segue único. */
  assert.equal([...html.matchAll(/data-admin-sign-out/g)].length, 1);
});

test("a Mesa mostra o link só para quem administra (Owner/Admin), não para Escritor/Editor", () => {
  assert.match(app, /querySelectorAll\("\[data-mesa-central\]"\)\) item\.hidden = ctx\.permissoes\?\.somenteProprios === true/);
  const dono = permissoesDaSessao({ role: "owner" });
  const admin = permissoesDaSessao({ role: "admin" });
  const escritor = permissoesDaSessao({ role: "blog_editor", permissions: { read: true, edit: true }, user: { id: "u1" } });
  assert.notEqual(dono.somenteProprios, true);
  assert.notEqual(admin.somenteProprios, true);
  assert.equal(escritor.somenteProprios, true);
});

test("o link novo não toca nos itens que já eram só do Owner", () => {
  assert.match(app, /querySelectorAll\("\[data-mesa-owner\]"\)\) item\.hidden = !podePublicar\(ctx\.permissoes\)/);
  assert.equal([...html.matchAll(/data-mesa-owner/g)].length, 2);
});
