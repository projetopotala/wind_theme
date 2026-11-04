import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ErroDeAmbiente, HOSTS_OFICIAIS, PROJETO_PRODUCAO, classificarOrigem, escolherAmbiente, refDaUrl, validarPerfil,
} from "../../outputs/js/supabase/ambiente.js";
import { criarAutenticacaoSupabase } from "../../outputs/js/conta/adaptadores/supabase.js";
import {
  ARQUIVO_LAB, ARQUIVO_LOCAL, PROJETOS_BLOQUEADOS_EM_PRODUCAO, conferirDecisao, lerDadosLab, modoAutomatico, prepararLab, varrerSaida, verificar,
} from "../../scripts/ambiente-supabase.mjs";

const RAIZ = new URL("../../", import.meta.url);
const RAIZ_FS = fileURLToPath(RAIZ);
const REF_LAB = "abcdefghij0123456789"; // fictício: o teste não depende do projeto LAB real
const REF_DEV = "zyxwvutsrq9876543210";
const LAB = Object.freeze({ projectRef: REF_LAB, url: `https://${REF_LAB}.supabase.co`, publishableKey: "sb_publishable_chave_de_teste" });
const LOCAL = Object.freeze({ projectRef: REF_DEV, url: `https://${REF_DEV}.supabase.co`, publishableKey: "sb_publishable_chave_local" });
const OFICIAL = `https://${HOSTS_OFICIAIS[0]}`;
const LAB_ALIAS = "https://wind-theme-m2-lab-preview.vercel.app";
const LAB_DEPLOY = "https://wind-theme-m2-lab-preview-ab12cd-potala.vercel.app";
const bloqueia = (origem, extra = {}) => assert.throws(() => escolherAmbiente({ origem, ...extra }), ErroDeAmbiente, origem);

test("host oficial usa exclusivamente a produção, com retorno no próprio host", () => {
  for (const host of HOSTS_OFICIAIS) {
    const c = escolherAmbiente({ origem: `https://${host}`, overlayLab: LAB, overlayLocal: LOCAL });
    assert.equal(c.ambiente, "producao");
    assert.equal(c.projectRef, PROJETO_PRODUCAO);
    assert.equal(c.url, `https://${PROJETO_PRODUCAO}.supabase.co`);
    assert.equal(c.siteUrl, `https://${host}`);
  }
});

test("a Preview LAB usa exclusivamente o LAB e devolve o login para a própria Preview", () => {
  for (const origem of [LAB_ALIAS, LAB_DEPLOY]) {
    const c = escolherAmbiente({ origem, overlayLab: LAB });
    assert.equal(c.ambiente, "lab");
    assert.equal(c.projectRef, REF_LAB);
    assert.notEqual(c.projectRef, PROJETO_PRODUCAO);
    assert.equal(c.siteUrl, origem);
  }
});

test("Preview desconhecida, outro domínio e origens parecidas NÃO recebem a produção", () => {
  for (const origem of [
    "https://wind-theme-abc123-potala.vercel.app", "https://outro.exemplo.com", "https://wind-theme.vercel.app.evil.com",
    "https://evil-wind-theme.vercel.app", "http://wind-theme.vercel.app", "https://wind-theme.vercel.app:8443",
    "https://user:senha@wind-theme.vercel.app", "https://WIND-THEME.vercel.app.", "null", "file:///C:/portal/index.html", "",
  ]) {
    bloqueia(origem, { overlayLab: LAB, overlayLocal: LOCAL });
  }
  for (const origem of [`${LAB_ALIAS}.evil.com`, "https://evil-wind-theme-m2-lab-preview.vercel.app", "https://wind-theme-m2-lab-previewx.vercel.app", "http://wind-theme-m2-lab-preview.vercel.app", "https://wind-theme-m2-lab-preview-ab12-evil.vercel.app"]) {
    bloqueia(origem, { overlayLab: LAB });
  }
  assert.throws(() => escolherAmbiente(), ErroDeAmbiente);
});

test("localhost não usa produção automaticamente: exige configuração local explícita", () => {
  for (const origem of ["http://localhost:3000", "http://127.0.0.1:4173", "http://[::1]:3000", "http://portal.localhost:3000"]) {
    assert.equal(classificarOrigem(origem), "local", origem);
    assert.throws(() => escolherAmbiente({ origem }), /ambiente-local\.js/, origem);
    const c = escolherAmbiente({ origem, overlayLocal: LOCAL });
    assert.equal(c.ambiente, "local");
    assert.notEqual(c.projectRef, PROJETO_PRODUCAO);
    assert.equal(c.siteUrl, new URL(origem).origin);
  }
  // Nem a configuração explícita pode apontar o uso local para a produção.
  assert.throws(() => escolherAmbiente({ origem: "http://localhost:3000", overlayLocal: { projectRef: PROJETO_PRODUCAO, url: `https://${PROJETO_PRODUCAO}.supabase.co`, publishableKey: "sb_publishable_x" } }), /nunca aponta para a produção/);
  // O arquivo de configuração local não vale em outra origem.
  bloqueia("https://outro.exemplo.com", { overlayLocal: LOCAL });
  assert.equal(escolherAmbiente({ origem: OFICIAL, overlayLocal: LOCAL }).projectRef, PROJETO_PRODUCAO);
});

test("Preview LAB sem configuração falha e nunca cai na produção", () => {
  for (const origem of [LAB_ALIAS, LAB_DEPLOY]) {
    assert.throws(() => escolherAmbiente({ origem }), /sem os dados de configuração \(ambiente-lab\.js\)/);
    assert.throws(() => escolherAmbiente({ origem, overlayLab: {} }), /inválido/);
  }
  // O arquivo do LAB não vale no domínio oficial.
  assert.equal(escolherAmbiente({ origem: OFICIAL, overlayLab: LAB }).ambiente, "producao");
});

test("chave secreta ou configuração perigosa no navegador é rejeitada", () => {
  const origem = LAB_ALIAS;
  assert.throws(() => escolherAmbiente({ origem, overlayLab: { ...LAB, projectRef: PROJETO_PRODUCAO, url: `https://${PROJETO_PRODUCAO}.supabase.co` } }), /LAB inconsistente/);
  assert.throws(() => escolherAmbiente({ origem, overlayLab: { ...LAB, url: "https://outroprojeto0123456789.supabase.co" } }), /não corresponde/);
  assert.throws(() => escolherAmbiente({ origem, overlayLab: { ...LAB, url: `http://${REF_LAB}.supabase.co` } }), /não corresponde/);
  for (const publishableKey of ["sb_secret_abc", "eyJhbGciOi.service_role.x", "sb_publishable_service_role"]) {
    assert.throws(() => escolherAmbiente({ origem, overlayLab: { ...LAB, publishableKey } }), /chave publicável/);
    assert.throws(() => escolherAmbiente({ origem: "http://localhost:3000", overlayLocal: { ...LOCAL, publishableKey } }), /chave publicável/);
  }
  assert.throws(() => escolherAmbiente({ origem, overlayLab: { ...LAB, projectRef: "curto" } }), /inválido/);
  const base = escolherAmbiente({ origem: OFICIAL });
  for (const siteUrl of ["http://wind-theme.vercel.app", "https://wind-theme.vercel.app/caminho", "https://wind-theme.vercel.app/?x=1", "https://outro.exemplo.com"]) {
    assert.throws(() => validarPerfil({ ...base, siteUrl }), TypeError, siteUrl);
  }
  assert.equal(refDaUrl("https://abc.supabase.co.evil.com"), null);
});

test("redirects de autenticação usam somente a origem validada de cada ambiente", async () => {
  const casos = [
    [OFICIAL, escolherAmbiente({ origem: OFICIAL })],
    [LAB_DEPLOY, escolherAmbiente({ origem: LAB_DEPLOY, overlayLab: LAB })],
    ["http://localhost:3000", escolherAmbiente({ origem: "http://localhost:3000", overlayLocal: LOCAL })],
  ];
  for (const [origem, config] of casos) {
    const chamadas = [];
    const auth = {
      signUp: async (a) => { chamadas.push(a.options.emailRedirectTo); return { data: {}, error: null }; },
      resetPasswordForEmail: async (_e, o) => { chamadas.push(o.redirectTo); return { error: null }; },
      signInWithOAuth: async (a) => { chamadas.push(a.options.redirectTo); return { error: null }; },
    };
    // `origem` do aparelho aponta para outro lugar de propósito: só config.siteUrl deve valer.
    const conta = criarAutenticacaoSupabase({ client: { auth }, config, origem: "https://intruso.exemplo.com" });
    await conta.criarConta({ nome: "A", email: "a@example.test", senha: "x" });
    await conta.recuperarSenha("a@example.test");
    await conta.entrarComGoogle();
    assert.equal(chamadas.length, 3);
    for (const alvo of chamadas) assert.equal(new URL(alvo).origin, origem, alvo);
  }
});

test("config.js carrega a produção só quando a origem é declarada e falha controlado sem ela", () => {
  const codigo = `import(${JSON.stringify(new URL("outputs/js/supabase/config.js", RAIZ).href)}).then((m) => console.log(JSON.stringify({ a: m.AMBIENTE_SUPABASE, r: m.SUPABASE_CONFIG.projectRef, f: Object.isFrozen(m.SUPABASE_CONFIG) })), (e) => { console.log(JSON.stringify({ erro: e.name, codigo: e.codigo })); });`;
  const rodar = (origem) => {
    const env = { ...process.env };
    delete env.POTALA_AMBIENTE_ORIGEM;
    if (origem !== undefined) env.POTALA_AMBIENTE_ORIGEM = origem;
    return JSON.parse(spawnSync(process.execPath, ["-e", codigo], { env, encoding: "utf8" }).stdout.trim());
  };
  assert.deepEqual(rodar(OFICIAL), { a: "producao", r: PROJETO_PRODUCAO, f: true });
  assert.deepEqual(rodar(undefined), { erro: "ErroDeAmbiente", codigo: "origem-desconhecida" });
  assert.deepEqual(rodar("https://qualquer.exemplo.com"), { erro: "ErroDeAmbiente", codigo: "origem-desconhecida" });
  assert.deepEqual(rodar("http://localhost:3000"), { erro: "ErroDeAmbiente", codigo: "local-sem-configuracao" });
  assert.deepEqual(rodar(LAB_ALIAS), { erro: "ErroDeAmbiente", codigo: "lab-sem-configuracao" });
});

test("config.js só busca arquivos de configuração no ambiente correspondente e eles nunca são versionados", () => {
  const codigo = readFileSync(new URL("outputs/js/supabase/config.js", RAIZ), "utf8");
  assert.match(codigo, /tipo === "lab" \? await carregar\("\.\/ambiente-lab\.js"/);
  assert.match(codigo, /tipo === "local" \? await carregar\("\.\/ambiente-local\.js"/);
  assert.doesNotMatch(codigo, /producao|gotrum/i, "o config.js não decide produção por conta própria");
  for (const arquivo of [ARQUIVO_LAB, ARQUIVO_LOCAL]) assert.equal(existsSync(new URL(`outputs/${arquivo}`, RAIZ)), false, arquivo);
  const ignorado = readFileSync(new URL(".gitignore", RAIZ), "utf8");
  for (const linha of ["outputs/js/supabase/ambiente-lab.js", "outputs/js/supabase/ambiente-local.js", "ops/lab-preview/ambiente-lab.local.json"]) {
    assert.ok(ignorado.split(/\r?\n/).includes(linha), linha);
  }
});

function pacote(arquivos) {
  const raiz = mkdtempSync(join(tmpdir(), "ambiente-"));
  for (const [rel, texto] of Object.entries(arquivos)) {
    const alvo = join(raiz, "outputs", rel);
    mkdirSync(join(alvo, ".."), { recursive: true });
    writeFileSync(alvo, texto);
  }
  return raiz;
}
const jwtServico = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.assinaturaDeTeste123`;
const jwtAnon = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.assinaturaDeTeste123`;

test("o build de produção bloqueia referências ao LAB, arquivos de configuração e segredos", () => {
  const limpo = pacote({ "index.html": "<p>ok</p>", "js/app.js": `const k="${jwtAnon}";` });
  try { assert.deepEqual(varrerSaida(join(limpo, "outputs")), []); } finally { rmSync(limpo, { recursive: true, force: true }); }
  const casos = {
    "id do LAB em js": { "js/a.js": `const u="https://${PROJETOS_BLOQUEADOS_EM_PRODUCAO[0]}.supabase.co";` },
    "id do LAB em html": { "x.html": `<script>fetch("${PROJETOS_BLOQUEADOS_EM_PRODUCAO[0]}")</script>` },
    "arquivo do LAB": { [ARQUIVO_LAB]: "export const AMBIENTE_LAB = {};" },
    "arquivo local": { [ARQUIVO_LOCAL]: "export const AMBIENTE_LOCAL = {};" },
    "chave secreta": { "js/a.js": 'const k="sb_secret_abcdefghijkl";' },
    "jwt service_role": { "js/a.js": `const k="${jwtServico}";` },
  };
  for (const [nome, arquivos] of Object.entries(casos)) {
    const raiz = pacote(arquivos);
    try { assert.notEqual(varrerSaida(join(raiz, "outputs")).length, 0, nome); } finally { rmSync(raiz, { recursive: true, force: true }); }
  }
  // O arquivo local é barrado até no pacote LAB.
  const raiz = pacote({ [ARQUIVO_LOCAL]: "x" });
  try { assert.notEqual(varrerSaida(join(raiz, "outputs"), { permitirLab: true }).length, 0); } finally { rmSync(raiz, { recursive: true, force: true }); }
});

test("o pacote LAB só passa no modo lab e o projeto Vercel LAB não roda a verificação de produção", async () => {
  const raiz = pacote({ [ARQUIVO_LAB]: `export const AMBIENTE_LAB = ${JSON.stringify(LAB)};`, "js/x.js": `const u="${PROJETOS_BLOQUEADOS_EM_PRODUCAO[0]}";` });
  try {
    assert.deepEqual(varrerSaida(join(raiz, "outputs"), { permitirLab: true }), []);
    assert.ok(varrerSaida(join(raiz, "outputs")).length >= 2);
  } finally { rmSync(raiz, { recursive: true, force: true }); }
  assert.equal(modoAutomatico({ VERCEL_PROJECT_PRODUCTION_URL: LAB_ALIAS.slice(8) }), "lab");
  assert.equal(modoAutomatico({ VERCEL_PROJECT_PRODUCTION_URL: HOSTS_OFICIAIS[0] }), "producao");
  assert.equal(modoAutomatico({}), "producao");
  const r = await verificar("producao", { env: { VERCEL_PROJECT_PRODUCTION_URL: LAB_ALIAS.slice(8) } });
  assert.ok(r.problemas.some((p) => /projeto Vercel LAB/.test(p)));
});

test("os dados do LAB vêm de variáveis de ambiente ou de JSON ignorado pelo Git, e a falta deles falha", () => {
  const raiz = mkdtempSync(join(tmpdir(), "ambiente-lab-"));
  try {
    mkdirSync(join(raiz, "outputs"), { recursive: true });
    assert.throws(() => lerDadosLab({ raiz, env: {} }), /Dados do LAB ausentes/);
    const env = { LAB_SUPABASE_PROJECT_REF: LAB.projectRef, LAB_SUPABASE_URL: LAB.url, LAB_SUPABASE_PUBLISHABLE_KEY: LAB.publishableKey };
    const destino = prepararLab({ raiz, env });
    assert.match(readFileSync(destino, "utf8"), new RegExp(REF_LAB));
    assert.throws(() => lerDadosLab({ raiz, env: { ...env, LAB_SUPABASE_PUBLISHABLE_KEY: "sb_secret_xxxxxxxxxxxx" } }), /chave publicável/);
    assert.throws(() => lerDadosLab({ raiz, env: { ...env, LAB_SUPABASE_PROJECT_REF: PROJETO_PRODUCAO, LAB_SUPABASE_URL: `https://${PROJETO_PRODUCAO}.supabase.co` } }), /LAB inconsistente/);
    mkdirSync(join(raiz, "ops/lab-preview"), { recursive: true });
    writeFileSync(join(raiz, "ops/lab-preview/ambiente-lab.local.json"), JSON.stringify(LAB));
    assert.deepEqual(lerDadosLab({ raiz, env: {} }), LAB);
  } finally { rmSync(raiz, { recursive: true, force: true }); }
});

test("a árvore atual passa na verificação de produção e a decisão efetiva é a esperada", async () => {
  const r = await verificar("producao", { raiz: RAIZ_FS, env: {} });
  assert.deepEqual(r.problemas, []);
  assert.deepEqual(await conferirDecisao(RAIZ_FS, { modo: "producao" }), []);
});

test("outputs/vercel.json roda a guarda no build da Vercel e preserva os rewrites", () => {
  const v = JSON.parse(readFileSync(new URL("outputs/vercel.json", RAIZ), "utf8"));
  // Root Directory = outputs: o comando roda ali e acha ../scripts (opção "arquivos fora do Root" ligada).
  assert.equal(v.buildCommand, "node ../scripts/ambiente-supabase.mjs producao");
  // Com Build Command definido a Vercel passa a exigir "public"; "." mantém a publicação estática de outputs/.
  assert.equal(v.outputDirectory, ".");
  // Os 8 rewrites originais seguem intactos e na frente; a PR-1A so acrescenta rotas publicas depois deles.
  assert.deepEqual(v.rewrites.slice(0, 8).map((r) => r.source), [
    "/admin", "/admin/", "/blog", "/blog/", "/confirmar-conta", "/confirmar-conta/", "/meu-potala", "/meu-potala/:path*",
  ]);
  assert.equal(v.rewrites.find((r) => r.source === "/meu-potala/:path*").destination, "/meu-potala.html");
  assert.equal(existsSync(new URL("scripts/ambiente-supabase.mjs", RAIZ)), true);
});

test("o workflow de CI roda as verificações da PR sem credenciais e mantém o rendered-html informativo", () => {
  const ci = readFileSync(new URL(".github/workflows/ci.yml", RAIZ), "utf8");
  assert.match(ci, /pull_request:\s*\n\s*branches: \[main\]/);
  for (const passo of ["npm ci", "npm run lint", "npm run test:portal", "npm run verificar:ambiente", "npm run build"]) assert.ok(ci.includes(`run: ${passo}`), passo);
  assert.match(ci, /rendered-html[^\n]*\n\s*continue-on-error: true/);
  assert.doesNotMatch(ci, /secrets\.|SUPABASE|service_role|sb_secret_/i);
  assert.match(ci, /permissions:\s*\n\s*contents: read/);
});

test("o build e o início da página chamam a verificação de ambiente", () => {
  const p = JSON.parse(readFileSync(new URL("package.json", RAIZ), "utf8"));
  assert.match(p.scripts.build, /^node scripts\/ambiente-supabase\.mjs auto && /);
  assert.equal(p.scripts["verificar:ambiente"], "node scripts/ambiente-supabase.mjs producao");
  assert.equal(p.scripts["lab:preparar"], "node scripts/ambiente-supabase.mjs preparar-lab");
  assert.match(p.scripts["test:portal"], /--import \.\/tests\/potala\/_ambiente-testes\.mjs/);
});
