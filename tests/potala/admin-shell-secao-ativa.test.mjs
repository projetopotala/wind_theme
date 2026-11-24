import assert from "node:assert/strict";
import test from "node:test";

import { createAdminShell } from "../../outputs/js/admin/admin-shell.js";

/* Nós falsos, como em admin-shell.test.mjs. */
function no(atributos = {}) {
  const mapa = new Map(Object.entries(atributos).map(([k, v]) => [k, String(v)]));
  return {
    hidden: false,
    textContent: "",
    setAttribute(n, v) { mapa.set(n, String(v)); },
    getAttribute(n) { return mapa.get(n) ?? null; },
    removeAttribute(n) { mapa.delete(n); },
    addEventListener() {},
    removeEventListener() {},
  };
}

function montar() {
  const secoes = {
    inicio: no({ "data-section": "inicio", "aria-current": "page", "data-dica": "Visão geral" }),
    atendimentos: no({ "data-section": "atendimentos", "data-dica": "Atendimentos" }),
    "editar-site": no({ "data-section": "editar-site", "data-dica": "Editar site" }),
    blog: no({ "data-section": "blog", "data-dica": "Blog" }),
  };
  const paineis = Object.fromEntries(["inicio", "atendimentos", "editar-site", "blog"].map((s) => [s, Object.assign(no({ "data-admin-workspace": s }), { hidden: s !== "inicio" })]));
  const nav = Object.assign(no(), { querySelectorAll: () => Object.values(secoes) });
  const titulo = no();
  titulo.textContent = "Visão geral";
  const raiz = {
    dataset: {},
    querySelector(sel) {
      if (sel === "[data-admin-nav]") return nav;
      if (sel === "[data-admin-secao-atual]") return titulo;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === "[data-admin-workspace]") return Object.values(paineis);
      if (sel === "[data-admin-so-owner]") return [comentarios];
      return [];
    },
    addEventListener() {}, removeEventListener() {},
  };
  const comentarios = Object.assign(no(), { hidden: true });
  const shell = createAdminShell({ root: raiz });
  return { shell, secoes, paineis, titulo, raiz, comentarios };
}

const visiveis = (paineis) => Object.entries(paineis).filter(([, p]) => !p.hidden).map(([s]) => s);

test("conta só-Blog: a marca, o painel e o título da barra superior dizem 'Blog' (antes diziam 'Visão geral')", () => {
  const { shell, secoes, paineis, titulo } = montar();
  shell.setUser({ name: "Escritora Teste", role: "Escritor", accessRole: "blog_editor", blogNivel: "escritor" });
  assert.deepEqual(visiveis(paineis), ["blog"]);
  assert.equal(secoes.blog.getAttribute("aria-current"), "page");
  /* A "Visão geral" está escondida para esta conta e não pode continuar marcada como atual. */
  assert.equal(secoes.inicio.getAttribute("aria-current"), null);
  assert.equal(secoes.inicio.hidden, true);
  assert.equal(titulo.textContent, "Blog");
});

test("owner/admin continuam entrando na Visão geral, com a marca onde estava", () => {
  const { shell, secoes, paineis, titulo } = montar();
  shell.setUser({ name: "Dona", role: "Owner", accessRole: "owner", blogNivel: "total" });
  assert.deepEqual(visiveis(paineis), ["inicio"]);
  assert.equal(secoes.inicio.getAttribute("aria-current"), "page");
  assert.equal(titulo.textContent, "Visão geral");
  assert.equal(secoes["editar-site"].hidden, false);
});

test("só o Owner vê 'Editar site'; admin não", () => {
  const { shell, secoes } = montar();
  shell.setUser({ name: "Admin", role: "Administração", accessRole: "admin", blogNivel: "total" });
  assert.equal(secoes["editar-site"].hidden, true);
});

test("'Ver comentários' no cartão do Blog é só do Owner: para Admin, Escritor e Editor a Mesa recusaria a rota", () => {
  for (const [accessRole, esperado] of [["owner", false], ["admin", true], ["blog_editor", true]]) {
    const { shell, comentarios } = montar();
    shell.setUser({ name: "X", role: "X", accessRole, blogNivel: accessRole === "blog_editor" ? "escritor" : "total" });
    assert.equal(comentarios.hidden, esperado, accessRole);
  }
});

test("o link de comentários nasce escondido no HTML e continua apontando para a Mesa", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../../outputs/admin.html", import.meta.url), "utf8");
  const link = html.match(/<a [^>]*href="\/blog#\/comentarios"[^>]*>/)?.[0];
  assert.ok(link);
  assert.match(link, /data-admin-so-owner/);
  assert.match(link, /\bhidden\b/);
  /* Os outros dois caminhos para a Mesa seguem abertos para todas as contas com Blog. */
  assert.match(html, /<a class="admin-workspace-link" href="\/blog#\/visao">/);
  assert.match(html, /<a class="admin-workspace-link" href="\/blog#\/novo">/);
});
