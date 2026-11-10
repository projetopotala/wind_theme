import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assinaturaDaSessao, entradaAoAutorizar, permissoesDaMesa, permissoesDaSessao, podePublicar,
} from "../../outputs/js/blog-admin/mesa-modelo.js";
import { itensDoMenu } from "../../outputs/js/blog-admin/mesa-visoes.js";

/* Acessos como o login devolve: Escritor e Editor sao blog_editor com concessao ativa; Owner/admin nao dependem dela. */
const escritor = { role: "blog_editor", user: { id: "u-escritor" }, permissions: { read: true, edit: true, publish: false } };
const editor = { role: "blog_editor", user: { id: "u-editor" }, permissions: { read: true, edit: true, publish: true } };
const owner = { role: "owner", user: { id: "u-owner" }, permissions: { read: true, edit: true, publish: true } };
const admin = { role: "admin", user: { id: "u-admin" } };

test("permissoes por perfil refletem a sessao: Escritor nao publica, Editor e Owner publicam", () => {
  const e = permissoesDaSessao(escritor);
  assert.deepEqual(e, { ler: true, editar: true, publicar: false, somenteProprios: true, usuarioId: "u-escritor" });
  assert.equal(podePublicar(e), false);
  const ed = permissoesDaSessao(editor);
  assert.equal(ed.publicar, true);
  assert.equal(ed.somenteProprios, false);
  assert.equal(podePublicar(ed), true);
  assert.deepEqual(permissoesDaSessao(owner), { ler: true, editar: true, publicar: true });
  assert.deepEqual(permissoesDaSessao(admin), { ler: true, editar: true, publicar: true });
});

test("concessao ausente ou inativa nao libera nada para blog_editor", () => {
  const sem = permissoesDaSessao({ role: "blog_editor", user: { id: "x" }, permissions: { read: false, edit: false, publish: false } });
  assert.equal(sem.ler, false);
  assert.equal(sem.editar, false);
  assert.equal(sem.publicar, false);
  assert.equal(permissoesDaSessao({ role: "blog_editor", user: { id: "x" } }).publicar, false);
});

test("troca Escritor -> Editor -> Owner -> Escritor: cada sessao vale por si, sem herdar da anterior", () => {
  /* O que a Mesa faz em entrar(): substitui, nunca mistura com a sessao anterior. */
  let ctx = permissoesDaMesa(permissoesDaSessao(escritor));
  assert.equal(podePublicar(ctx), false);
  assert.equal(ctx.somenteProprios, true);

  ctx = permissoesDaMesa(permissoesDaSessao(editor));
  assert.equal(podePublicar(ctx), true);
  assert.equal(ctx.somenteProprios, false, "Editor nao pode herdar somenteProprios do Escritor");
  assert.equal(ctx.usuarioId, "u-editor");

  ctx = permissoesDaMesa(permissoesDaSessao(owner));
  assert.equal(podePublicar(ctx), true);
  assert.equal(ctx.somenteProprios, undefined);
  assert.equal(ctx.usuarioId, undefined, "Owner nao pode herdar usuarioId do Editor");

  ctx = permissoesDaMesa(permissoesDaSessao(escritor));
  assert.equal(podePublicar(ctx), false);
  assert.equal(ctx.somenteProprios, true);
});

test("menu da Mesa acompanha a troca: Escritor sem itens de publicacao, Editor/Owner com", () => {
  const rotulos = (p) => JSON.stringify(itensDoMenu({ id: "x", status: "published", post: {} }, p).filter((i) => i !== "separador").map((i) => i.id));
  assert.notEqual(rotulos(permissoesDaMesa(permissoesDaSessao(escritor))), rotulos(permissoesDaMesa(permissoesDaSessao(editor))));
  assert.equal(rotulos(permissoesDaMesa(permissoesDaSessao(editor))), rotulos(permissoesDaMesa(permissoesDaSessao(owner))));
});

test("assinatura muda com a conta e com as permissoes, nao com a renovacao do mesmo login", () => {
  assert.equal(assinaturaDaSessao(editor), assinaturaDaSessao({ ...editor }));
  assert.notEqual(assinaturaDaSessao(escritor), assinaturaDaSessao(editor));
  assert.notEqual(assinaturaDaSessao(editor), assinaturaDaSessao(owner));
  const editorRebaixado = { ...editor, permissions: { read: true, edit: true, publish: false } };
  assert.notEqual(assinaturaDaSessao(editor), assinaturaDaSessao(editorRebaixado), "mesma conta, outra permissao");
});

test("entradaAoAutorizar: login novo abre, troca de conta com a Mesa aberta reabre, renovacao nao mexe", () => {
  const a = assinaturaDaSessao(escritor);
  const b = assinaturaDaSessao(editor);
  /* login: botao Entrar */
  assert.equal(entradaAoAutorizar({ gate: "entrar", assinatura: a }), "abrir");
  /* volta com a sessao e um endereco da Mesa */
  assert.equal(entradaAoAutorizar({ gate: "login", hash: "#/editar/abc", assinatura: a }), "abrir");
  /* troca Escritor -> Editor com a Mesa aberta e sem F5 */
  assert.equal(entradaAoAutorizar({ gate: "mesa", assinaturaAnterior: a, assinatura: b }), "reabrir");
  /* renovacao do token da mesma conta: nao descarta o que esta sendo editado */
  assert.equal(entradaAoAutorizar({ gate: "mesa", assinaturaAnterior: b, assinatura: b }), "continuar");
  /* demonstracao nunca reabre por sessao real */
  assert.equal(entradaAoAutorizar({ gate: "mesa", assinaturaAnterior: a, assinatura: b, emDemo: true }), "continuar");
  /* tela de login sem endereco: so mostra o botao Continuar */
  assert.equal(entradaAoAutorizar({ gate: "login", assinatura: a }), "continuar");
});

test("fiacao: entrar() troca as permissoes, sair() limpa dados, a entrada reabre e nada de autorizacao mudou", () => {
  const app = readFileSync(new URL("../../outputs/js/blog-admin/mesa-app.js", import.meta.url), "utf8");
  assert.match(app, /async entrar\(\{ usuario = null, permissoes: sessao, identidade = null \} = \{\}\)/);
  assert.match(app, /if \(sessao\) ctx\.permissoes = permissoesDaMesa\(sessao\)/);
  const sair = app.slice(app.indexOf("    sair() {"), app.indexOf("    isolar() {"));
  assert.match(sair, /ctx\.usuario = null/);
  assert.match(sair, /return isolar\(\)/);
  /* isolar() limpa os dados carregados da sessao anterior */
  const isolar = app.slice(app.indexOf("  function isolar() {"), app.indexOf("  async function carregar()"));
  assert.match(isolar, /registros: \[\]/);
  assert.match(isolar, /comentarios: \[\]/);
  const entry = readFileSync(new URL("../../outputs/js/blog-admin/blog-admin-entry.js", import.meta.url), "utf8");
  assert.match(entry, /permissoes = permissoesDaSessao\(access\)/);
  assert.match(entry, /entradaAoAutorizar\(/);
  assert.match(entry, /mesa\.entrar\(\{ usuario: demo \? null : usuario, permissoes: demo \? \{\} : permissoes, identidade: /);
});
