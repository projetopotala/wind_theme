import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const VENDOR = new URL("../../outputs/vendor/", import.meta.url);

/**
 * Toda importação relativa de um arquivo servido tem de existir ao lado dele.
 *
 * O bundle do Three.js não é um arquivo só: `three.module.min.js` é uma casca
 * que importa `./three.core.min.js`. Copiar só a casca serve o módulo com 200 e
 * mesmo assim derruba a página — o navegador busca o irmão, recebe 404, e o
 * erro no console aponta para o módulo de ENTRADA, não para o arquivo que
 * faltou. Na Home isso apareceu como "Failed to fetch dynamically imported
 * module: home-controller.js", que não tem nada a ver com o defeito.
 *
 * Nenhum teste de unidade pega isso, porque em Node o `import "three"` resolve
 * por `node_modules` e nunca passa pela pasta servida.
 */
test("os módulos publicados em vendor/ não pedem arquivo que não foi copiado", async () => {
  const arquivos = (await readdir(VENDOR)).filter((nome) => nome.endsWith(".js"));
  assert.ok(arquivos.length > 0, "vendor/ está vazio — o Three.js não foi copiado");

  const presentes = new Set(arquivos);
  const faltando = [];

  for (const nome of arquivos) {
    const codigo = await readFile(new URL(nome, VENDOR), "utf8");
    const alvos = new Set([
      ...[...codigo.matchAll(/from\s*["']\.\/([^"']+)["']/g)].map((m) => m[1]),
      ...[...codigo.matchAll(/import\s*["']\.\/([^"']+)["']/g)].map((m) => m[1]),
    ]);
    for (const alvo of alvos) {
      if (!presentes.has(alvo)) faltando.push(`${nome} pede ./${alvo}`);
    }
  }

  assert.deepEqual(faltando, [], `importações sem arquivo em vendor/: ${faltando.join("; ")}`);
});

test("o import map da Home aponta para um arquivo que existe", async () => {
  const html = await readFile(new URL("../../outputs/transcendido.html", import.meta.url), "utf8");
  const mapa = html.match(/<script type="importmap">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(mapa, "a Home precisa do import map do Three.js");

  const { imports } = JSON.parse(mapa[1]);
  assert.equal(typeof imports.three, "string", "o especificador 'three' precisa estar mapeado");

  const alvo = new URL(imports.three.replace(/^\.\//, ""), new URL("../../outputs/", import.meta.url));
  await readFile(alvo, "utf8");
});
