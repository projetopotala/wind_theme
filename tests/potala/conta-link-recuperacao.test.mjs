/*
 * P0.5 — LINK DE RECUPERAÇÃO EXPIRADO OU JÁ USADO.
 *
 * O Supabase devolve a pessoa a /meu-potala/configuracoes com #error=... e sem
 * sessão. A tela precisa dizer o que houve, em vez de cair calada no visitante.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { avisoDoLinkDeAcesso } from "../../outputs/js/conta/spa/app.js";

const BASE = "https://wind-theme.vercel.app/meu-potala/configuracoes";

test("link expirado (no fragmento) vira aviso de link expirado", () => {
  const html = avisoDoLinkDeAcesso(`${BASE}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  assert.match(html, /role="alert"/);
  assert.match(html, /expirou ou já foi usado/);
  assert.match(html, /Esqueci minha senha/);
});

test("erro na busca (fluxo PKCE) também é reconhecido", () => {
  assert.match(avisoDoLinkDeAcesso(`${BASE}?error=access_denied&error_code=otp_expired`), /expirou/);
});

test("outro erro do Auth vira aviso genérico, sem repetir o texto vindo da URL", () => {
  const html = avisoDoLinkDeAcesso(`${BASE}#error=server_error&error_description=%3Cscript%3Ealert(1)%3C%2Fscript%3E`);
  assert.match(html, /Não foi possível validar/);
  assert.doesNotMatch(html, /<script/);
});

test("sem erro na URL, nenhum aviso (inclusive com o link válido de recuperação)", () => {
  assert.equal(avisoDoLinkDeAcesso(BASE), "");
  assert.equal(avisoDoLinkDeAcesso(`${BASE}#access_token=x&type=recovery`), "");
  assert.equal(avisoDoLinkDeAcesso(`${BASE}?code=abc`), "");
});

test("app.js limpa a URL antes de abrir a conta e mostra o aviso na tela de visitante", async () => {
  const fonte = (await readFile(new URL("../../outputs/js/conta/spa/app.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const lerAviso = fonte.indexOf("const avisoDoLink = avisoDoLinkDeAcesso(janela.location.href);");
  const limpar = fonte.indexOf('if (avisoDoLink) janela.history?.replaceState?.(null, "", janela.location.pathname);');
  const abrirConta = fonte.indexOf("const conta = await montarConta({ documento, janela });");
  assert.ok(lerAviso > 0 && limpar > lerAviso && abrirConta > limpar, "a falha precisa ser lida e a URL limpa antes de o SDK abrir");
  assert.match(fonte, /return trocar\(`\$\{avisoDoLink\}\$\{renderizarVisitante\(estado\)\}`, \{ origem \}\);/);
});
