import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/*
 * Regressao do hotfix pos-#110: na Vercel, "/meu-potala/" (com barra final e sem
 * subcaminho) devolve 404, enquanto "/meu-potala" responde 200. A regra
 * "/meu-potala/:path*" nao cobre a barra final sozinha.
 * Regra geral aqui: um link interno "/segmento/" so e valido se existir uma regra
 * de rewrite com exatamente essa origem (como "/admin/") ou uma pasta com index.html.
 */
const raiz = new URL("../../outputs/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const rewrites = JSON.parse(readFileSync(join(raiz, "vercel.json"), "utf8")).rewrites.map((r) => r.source);

function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (nome === "node_modules" || nome.startsWith("_")) return [];
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

test("o link de Minha area profissional na Central nao usa barra final", () => {
  const html = readFileSync(join(raiz, "admin.html"), "utf8");
  const link = html.match(/<a[^>]*data-admin-minha-area[^>]*>/);
  assert.ok(link, "o link de Minha area profissional existe");
  assert.match(link[0], /href="\/meu-potala"/);
  assert.doesNotMatch(link[0], /href="\/meu-potala\/"/);
});

test("a Vercel cobre /meu-potala e seus subcaminhos, mas nao a barra final isolada", () => {
  assert.ok(rewrites.includes("/meu-potala"));
  assert.ok(rewrites.includes("/meu-potala/:path*"));
  assert.ok(!rewrites.includes("/meu-potala/"));
});

test("nenhum link interno usa '/segmento/' sem rewrite exato ou index.html", () => {
  const achados = [];
  for (const arquivo of arquivos(raiz).filter((f) => /\.(html|js)$/.test(f))) {
    const texto = readFileSync(arquivo, "utf8");
    for (const m of texto.matchAll(/href=["'`](\/[a-z0-9-]+)\/["'`?#]/gi)) {
      const origem = `${m[1]}/`;
      const coberto = rewrites.includes(origem) || existsSync(join(raiz, m[1].slice(1), "index.html"));
      if (!coberto) achados.push(`${relative(raiz, arquivo)}: ${origem}`);
    }
  }
  assert.deepEqual(achados, []);
});
