import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SUPABASE_CONFIG } from "../../outputs/js/supabase/config.js";
import { confirmarConta, erroDaUrl } from "../../outputs/js/conta/confirmar-conta.js";

test("a configuracao publica nunca aponta confirmacoes para um endereco local", () => {
  const url = new URL(SUPABASE_CONFIG.siteUrl);
  assert.equal(url.protocol, "https:");
  assert.doesNotMatch(url.hostname, /^(localhost|127(?:\.\d+){3})$/);
});

test("a tela traduz o erro devolvido pelo Supabase sem expor dados tecnicos", () => {
  const erro = erroDaUrl("https://portal.exemplo.com/confirmar-conta?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  assert.equal(erro.codigo, "otp_expired");
  assert.match(erro.mensagem, /expirou/i);
  assert.doesNotMatch(erro.mensagem, /access_denied|otp_expired/i);
});

test("uma sessao confirmada exibe sucesso e remove tokens da barra de endereco", async () => {
  const estados = [];
  const historico = [];
  const resultado = await confirmarConta({
    client: { auth: { async getSession() { return { data: { session: { user: { id: "u1" } } }, error: null }; } } },
    href: "https://portal.exemplo.com/confirmar-conta#access_token=segredo&type=signup",
    render: (estado) => estados.push(estado),
    limparUrl: (url) => historico.push(url),
  });

  assert.equal(resultado.status, "sucesso");
  assert.deepEqual(estados.map(({ status }) => status), ["carregando", "sucesso"]);
  assert.deepEqual(historico, ["/confirmar-conta"]);
});

test("sem sessao e sem erro a tela nao finge que a conta foi confirmada", async () => {
  const resultado = await confirmarConta({
    client: { auth: { async getSession() { return { data: { session: null }, error: null }; } } },
    href: "https://portal.exemplo.com/confirmar-conta",
    render() {},
    limparUrl() {},
  });
  assert.equal(resultado.status, "invalido");
});

test("a pagina de confirmacao e uma rota publica acessivel e dedicada", async () => {
  const html = await readFile(new URL("../../outputs/confirmar-conta.html", import.meta.url), "utf8");
  const vercel = JSON.parse(await readFile(new URL("../../outputs/vercel.json", import.meta.url), "utf8"));
  const regras = vercel.rewrites.map((regra) => `${regra.source} -> ${regra.destination}`);

  assert.match(html, /<title>Confirmação de conta — Instituto Potala<\/title>/);
  assert.match(html, /data-confirmacao-status/);
  assert.match(html, /\/vendor\/supabase\.js/);
  assert.match(html, /\/js\/conta\/confirmar-conta\.js/);
  assert.ok(regras.includes("/confirmar-conta -> /confirmar-conta.html"));
});
