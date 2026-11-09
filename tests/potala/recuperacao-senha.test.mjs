import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { destinoDaRaiz, sinalDoLink, temLinkDeAcesso } from "../../outputs/js/conta/link-recuperacao.js";
import { salvarNovaSenha, validarSenhas, verificarLink } from "../../outputs/js/conta/redefinir-senha.js";

const lerTexto = (caminho) => readFile(new URL(`../../${caminho}`, import.meta.url), "utf8");
const RAIZ = "https://wind-theme.vercel.app/";
const LINK_DO_PAINEL = `${RAIZ}#access_token=segredo&refresh_token=outro&expires_in=3600&token_type=bearer&type=recovery`;

test("o link do painel do Supabase na raiz segue para a página de senha sem perder o token", () => {
  assert.equal(temLinkDeAcesso(LINK_DO_PAINEL), true);
  assert.equal(sinalDoLink(LINK_DO_PAINEL).recuperacao, true);
  const destino = destinoDaRaiz(LINK_DO_PAINEL);
  assert.equal(destino, "/redefinir-senha#access_token=segredo&refresh_token=outro&expires_in=3600&token_type=bearer&type=recovery");
});

test("link com código ou com erro também vai para a página de senha, e a busca é preservada", () => {
  assert.equal(destinoDaRaiz(`${RAIZ}?code=abc123`), "/redefinir-senha?code=abc123");
  const expirado = `${RAIZ}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`;
  assert.match(destinoDaRaiz(expirado), /^\/redefinir-senha#error=access_denied/);
});

test("a raiz sem link continua levando à chegada, agora preservando o que veio no endereço", () => {
  assert.equal(destinoDaRaiz(RAIZ), "/transcender.html");
  assert.equal(destinoDaRaiz(`${RAIZ}?ref=newsletter#topo`), "/transcender.html?ref=newsletter#topo");
  assert.equal(temLinkDeAcesso(`${RAIZ}#type=signup`), false);
});

const clienteCom = ({ sessao = null, falha = null } = {}) => ({
  auth: {
    async getSession() { if (falha) throw falha; return { data: { session: sessao }, error: null }; },
    async exchangeCodeForSession() { return { error: { code: "otp_expired", message: "expired" } }; },
  },
});

test("link expirado ou sem sinal de recuperação nunca mostra o formulário", async () => {
  const sessao = { user: { id: "u1" } };
  const expirado = `${RAIZ}redefinir-senha#error=access_denied&error_code=otp_expired&error_description=expired`;
  assert.equal((await verificarLink({ client: clienteCom({ sessao }), href: expirado })).status, "expirado");
  /* Sessão comum, sem link de recuperação: não habilita a troca de senha. */
  assert.equal((await verificarLink({ client: clienteCom({ sessao }), href: `${RAIZ}redefinir-senha` })).status, "invalido");
});

test("com link de recuperação, o formulário só abre se o Supabase abriu uma sessão", async () => {
  const href = `${RAIZ}redefinir-senha#access_token=x&type=recovery`;
  assert.equal((await verificarLink({ client: clienteCom({ sessao: { user: { id: "u1" } } }), href })).status, "pronto");
  assert.equal((await verificarLink({ client: clienteCom({ sessao: null }), href })).status, "invalido");
  assert.equal((await verificarLink({ client: clienteCom({ falha: new Error("rede") }), href })).status, "erro");
  assert.equal((await verificarLink({ client: clienteCom(), href: `${RAIZ}redefinir-senha?code=velho` })).status, "expirado");
});

test("senhas curtas ou diferentes são recusadas antes de falar com o Supabase", async () => {
  assert.match(validarSenhas("curta", "curta"), /pelo menos 8/);
  assert.match(validarSenhas("senha-longa-1", "senha-longa-2"), /não são iguais/);
  assert.equal(validarSenhas("senha-longa-1", "senha-longa-1"), "");

  let chamadas = 0;
  const client = { auth: { async updateUser() { chamadas += 1; return { error: null }; }, async signOut() {} } };
  const resultado = await salvarNovaSenha({ client, senha: "senha-longa-1", confirmacao: "outra-coisa-9" });
  assert.equal(resultado.ok, false);
  assert.equal(chamadas, 0);
});

test("a nova senha é gravada por updateUser e só a sessão local de recuperação é encerrada", async () => {
  const chamadas = [];
  const client = {
    auth: {
      async updateUser(dados) { chamadas.push(["updateUser", Object.keys(dados)]); return { error: null }; },
      async signOut(opcoes) { chamadas.push(["signOut", opcoes]); },
    },
  };
  const resultado = await salvarNovaSenha({ client, senha: "senha-longa-1", confirmacao: "senha-longa-1" });
  assert.equal(resultado.ok, true);
  assert.deepEqual(chamadas, [["updateUser", ["password"]], ["signOut", { scope: "local" }]]);
});

test("falhas do Supabase viram mensagens claras, sem devolver o texto técnico", async () => {
  const falhar = (erro) => salvarNovaSenha({
    client: { auth: { async updateUser() { return { error: erro }; }, async signOut() {} } },
    senha: "senha-longa-1",
    confirmacao: "senha-longa-1",
  });
  assert.match((await falhar({ code: "same_password", message: "New password should be different from the old password." })).mensagem, /diferente da anterior/);
  assert.match((await falhar({ code: "session_not_found", message: "Auth session missing!" })).mensagem, /expirou/);
  const generica = await falhar({ code: "x", message: "internal detail 0xDEAD" });
  assert.doesNotMatch(generica.mensagem, /0xDEAD/);
});

test("o portal pede o link de recuperação para a página dedicada e a raiz preserva o token", async () => {
  const adaptador = await lerTexto("outputs/js/conta/adaptadores/supabase.js");
  assert.match(adaptador, /resetPasswordForEmail\(email, \{ redirectTo: retorno\("redefinir-senha"\) \}\)/);
  const raiz = await lerTexto("outputs/index.html");
  assert.match(raiz, /destinoDaRaiz\(window\.location\.href\)/);
  assert.doesNotMatch(raiz, /http-equiv="refresh"(?![^<]*<\/noscript>)/);
  const chegada = await lerTexto("outputs/transcender.html");
  assert.match(chegada, /js\/conta\/redirecionar-link\.js/);
});

test("a página de nova senha é uma rota pública dedicada, sem chave privada nem SQL de senha", async () => {
  const html = await lerTexto("outputs/redefinir-senha.html");
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /autocomplete="new-password"/);
  assert.match(html, /\/js\/conta\/redefinir-senha\.js/);
  const vercel = JSON.parse(await lerTexto("outputs/vercel.json"));
  const regras = vercel.rewrites.map((regra) => `${regra.source} -> ${regra.destination}`);
  assert.ok(regras.includes("/redefinir-senha -> /redefinir-senha.html"));
  assert.match(await lerTexto("scripts/serve-outputs.mjs"), /"redefinir-senha": "redefinir-senha\.html"/);
  for (const arquivo of ["outputs/js/conta/redefinir-senha.js", "outputs/js/conta/link-recuperacao.js", "outputs/js/conta/redirecionar-link.js", "outputs/redefinir-senha.html"]) {
    const texto = await lerTexto(arquivo);
    assert.doesNotMatch(texto, /service_role|\.rpc\(|encrypted_password|auth\.users|admin\.updateUserById/i, arquivo);
  }
  assert.match(await lerTexto("outputs/js/conta/redefinir-senha.js"), /auth\.updateUser\(\{ password: senha \}\)/);
});
