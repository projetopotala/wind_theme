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
