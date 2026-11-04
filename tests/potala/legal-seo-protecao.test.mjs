import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gerar, mesclarVercelJson, resolverOrigem, ORIGEM_CANONICA_PROVISORIA } from "../../scripts/build-legal-seo.mjs";

const vercelReal = async () => JSON.parse(await readFile(new URL("../../outputs/vercel.json", import.meta.url), "utf8"));
const HEAD = (extra = "") => `<!doctype html><html><head><meta charset="utf-8"><title>T</title>${extra}</head><body></body></html>`;

async function fixture(vercel) {
  const dir = await mkdtemp(path.join(tmpdir(), "potala-legal-seo-"));
  await mkdir(path.join(dir, "css"), { recursive: true });
  await writeFile(path.join(dir, "index.html"), HEAD());
  await writeFile(path.join(dir, "quem-somos.html"), HEAD('<link rel="canonical" href="https://www.institutopotala.com/quem-somos">'));
  await writeFile(path.join(dir, "admin.html"), HEAD('<meta name="robots" content="noindex, nofollow">'));
  await writeFile(path.join(dir, "vercel.json"), `${JSON.stringify(vercel, null, 2)}\n`);
  return dir;
}

test("vercel.json versionado mantém a guarda de ambiente da PR-0 e os rewrites originais", async () => {
  const config = await vercelReal();
  assert.equal(config.buildCommand, "node ../scripts/ambiente-supabase.mjs producao");
  assert.equal(config.outputDirectory, ".");
  const origem = config.rewrites.slice(0, 8).map(item => `${item.source}=>${item.destination}`);
  assert.deepEqual(origem, [
    "/admin=>/admin.html", "/admin/=>/admin.html",
    "/blog=>/blog-admin.html", "/blog/=>/blog-admin.html",
    "/confirmar-conta=>/confirmar-conta.html", "/confirmar-conta/=>/confirmar-conta.html",
    "/meu-potala=>/meu-potala.html", "/meu-potala/:path*=>/meu-potala.html",
  ]);
  assert.ok(!("headers" in config));
});

test("o gerador preserva buildCommand, outputDirectory e rewrites existentes ao rodar", async () => {
  const completo = await vercelReal();
  const base = { ...completo, rewrites: completo.rewrites.slice(0, 8) };
  const dir = await fixture(base);
  try {
    const resultado = await gerar({ saida: dir, origem: ORIGEM_CANONICA_PROVISORIA });
    const depois = JSON.parse(await readFile(path.join(dir, "vercel.json"), "utf8"));
    assert.equal(depois.buildCommand, base.buildCommand);
    assert.equal(depois.outputDirectory, base.outputDirectory);
    assert.deepEqual(depois.rewrites.slice(0, base.rewrites.length), base.rewrites, "rewrites existentes intactos e na mesma ordem");
    assert.ok(resultado.rewritesAdicionados >= 1);
    const sitemap = await readFile(path.join(dir, "sitemap.xml"), "utf8");
    assert.doesNotMatch(sitemap, /admin/);
    assert.doesNotMatch(sitemap, /politica-de-privacidade/, "jurídico incompleto fora do sitemap");
    assert.match(await readFile(path.join(dir, "quem-somos.html"), "utf8"), /href="https:\/\/wind-theme\.vercel\.app\/quem-somos"/, "canonical antigo trocado");
    // Rodar duas vezes não muda nada (idempotente).
    const primeira = await readFile(path.join(dir, "vercel.json"), "utf8");
    await gerar({ saida: dir, origem: ORIGEM_CANONICA_PROVISORIA });
    assert.equal(await readFile(path.join(dir, "vercel.json"), "utf8"), primeira);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("o gerador aborta sem escrever nada se faltar buildCommand ou outputDirectory", async () => {
  for (const chave of ["buildCommand", "outputDirectory"]) {
    const base = await vercelReal();
    delete base[chave];
    const dir = await fixture(base);
    try {
      await assert.rejects(() => gerar({ saida: dir, origem: ORIGEM_CANONICA_PROVISORIA }), new RegExp(chave));
      assert.deepEqual(JSON.parse(await readFile(path.join(dir, "vercel.json"), "utf8")), base, "vercel.json intocado");
      await assert.rejects(() => readFile(path.join(dir, "sitemap.xml")), "nada foi gerado");
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test("mesclarVercelJson só acrescenta e recusa rewrite conflitante", async () => {
  const base = await vercelReal();
  const mesclado = mesclarVercelJson(base, [{ source: "/novo", destination: "/novo.html" }]);
  assert.deepEqual(mesclado.rewrites.slice(0, base.rewrites.length), base.rewrites);
  assert.deepEqual(mesclado.rewrites.at(-1), { source: "/novo", destination: "/novo.html" });
  assert.throws(() => mesclarVercelJson(base, [{ source: "/admin", destination: "/outro.html" }]), /Conflito/);
});

test("a origem canônica só pode ser um host oficial aprovado", () => {
  assert.equal(resolverOrigem(), "https://wind-theme.vercel.app");
  for (const invalida of ["https://www.institutopotala.com", "http://wind-theme.vercel.app", "https://wind-theme-m2-lab-preview.vercel.app", "https://wind-theme.vercel.app/x"]) {
    assert.throws(() => resolverOrigem(invalida), undefined, invalida);
  }
});

test("a PR não traz migrations nem referências ao LAB nos arquivos publicados", async () => {
  const { readdirSync, readFileSync, existsSync } = await import("node:fs");
  const raiz = new URL("../../", import.meta.url);
  assert.ok(!existsSync(new URL("supabase/migrations/202610290001_site_interest_idempotency.sql", raiz)));
  for (const arquivo of readdirSync(new URL("outputs/", raiz)).filter(nome => /\.(html|xml|txt|json)$/.test(nome))) {
    const texto = readFileSync(new URL(`outputs/${arquivo}`, raiz), "utf8");
    assert.doesNotMatch(texto, /hmspabllgxqfzzricijv/, arquivo);
  }
});

test("blog: /blog é a administração; o blog público tem canonical próprio e nunca aponta para ela", async () => {
  const config = await vercelReal();
  const rota = origem => config.rewrites.find(item => item.source === origem)?.destination;
  assert.equal(rota("/blog"), "/blog-admin.html");
  assert.equal(rota("/blog/"), "/blog-admin.html");
  const leia = nome => readFile(new URL(`../../outputs/${nome}`, import.meta.url), "utf8");
  const publico = await leia("blog.html");
  assert.match(publico, /rel="canonical" href="https:\/\/wind-theme\.vercel\.app\/blog\.html"/);
  assert.doesNotMatch(publico, /rel="canonical" href="[^"]*\/blog"/);
  assert.match(await leia("blog-admin.html"), /name="robots"[^>]*noindex/i);
  const sitemap = await leia("sitemap.xml");
  assert.match(sitemap, /<loc>https:\/\/wind-theme\.vercel\.app\/blog\.html<\/loc>/);
  assert.doesNotMatch(sitemap, /<loc>[^<]*\/blog<\/loc>|blog-admin/);
});

test("nenhuma página pública usa como canonical uma rota que o vercel.json envia para a administração", async () => {
  const { readdirSync } = await import("node:fs");
  const config = await vercelReal();
  const privadas = new Set(config.rewrites.filter(item => /^\/(admin|blog-admin|confirmar-conta|meu-potala)\.html$/.test(item.destination)).map(item => item.source.replace(/\/$/, "").replace(/\/:path\*$/, "")));
  const dir = new URL("../../outputs/", import.meta.url);
  for (const arquivo of readdirSync(dir).filter(nome => nome.endsWith(".html") && !/^(admin|blog-admin|confirmar-conta|meu-potala)\.html$/.test(nome))) {
    const caminho = /rel="canonical" href="([^"]+)"/.exec(await readFile(new URL(arquivo, dir), "utf8"))?.[1];
    if (caminho) assert.ok(!privadas.has(new URL(caminho).pathname.replace(/\/$/, "")), `${arquivo}: canonical ${caminho} é rota administrativa`);
  }
});

test("o gerador corrige o canonical do blog público e recusa canonical apontando para a administração", async () => {
  const base = await vercelReal();
  const dir = await fixture(base);
  try {
    await writeFile(path.join(dir, "blog.html"), HEAD('<link rel="canonical" href="https://www.institutopotala.com/blog">'));
    await gerar({ saida: dir, origem: ORIGEM_CANONICA_PROVISORIA });
    assert.match(await readFile(path.join(dir, "blog.html"), "utf8"), /href="https:\/\/wind-theme\.vercel\.app\/blog\.html"/);
    assert.match(await readFile(path.join(dir, "sitemap.xml"), "utf8"), /\/blog\.html</);
    await writeFile(path.join(dir, "cultura.html"), HEAD('<link rel="canonical" href="https://wind-theme.vercel.app/admin">'));
    await assert.rejects(() => gerar({ saida: dir, origem: ORIGEM_CANONICA_PROVISORIA }), /rota administrativa/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
