/**
 * Copia o Three.js para `outputs/vendor/`, com o que ele mesmo pedir.
 *
 * O bundle publicado não é um arquivo só: desde a r16x o `three.module.min.js`
 * é uma casca que importa `./three.core.min.js`. Copiar apenas a casca serve o
 * módulo com status 200 e ainda assim quebra a página — o navegador busca o
 * irmão, recebe 404 e o grafo inteiro falha com um erro que aponta para o
 * módulo de ENTRADA, não para o arquivo que faltou. Foi assim que a Home ficou
 * sem trajeto e sem blocos, acusando `home-controller.js`.
 *
 * Por isso a lista de arquivos não é escrita à mão: ela é lida das próprias
 * importações relativas do bundle, recursivamente. Uma versão futura que se
 * reparta em mais pedaços continua funcionando sem ninguém lembrar de mexer
 * aqui.
 *
 *   node scripts/vendor-three.mjs
 */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "node_modules", "three", "build");
const addonsDir = path.join(root, "node_modules", "three", "examples", "jsm");
const vendorDir = path.join(root, "outputs", "vendor");
const addonsVendorDir = path.join(vendorDir, "addons");

const ENTRADA = "three.module.min.js";

/*
 * Os ADDONS entram por uma lista, e não pelo mesmo rastreamento do bundle.
 *
 * O `three` publicado é um grafo de imports RELATIVOS, e é por isso que a
 * função abaixo dá conta dele sozinha. Os addons não: eles importam `"three"`,
 * que é um nome resolvido pelo importmap da página, não um arquivo ao lado. O
 * rastreador nunca chegaria neles partindo do bundle.
 *
 * A estrutura de PASTAS é copiada junto, e isso não é organização: o
 * `GLTFLoader` importa `../utils/BufferGeometryUtils.js`. Achatando tudo numa
 * pasta só, esse caminho vira 404 — e o erro aponta para o módulo de entrada,
 * não para o arquivo que faltou, exatamente como já acontecia com o bundle.
 */
const ADDONS = [
  "loaders/GLTFLoader.js",
  "libs/meshopt_decoder.module.js",
];

/** Importações relativas de um bundle, sem `import()` dinâmico (não há). */
function irmaosDe(codigo) {
  const encontrados = new Set();
  for (const [, alvo] of codigo.matchAll(/from\s*["']\.\/([^"']+)["']/g)) encontrados.add(alvo);
  for (const [, alvo] of codigo.matchAll(/import\s*["']\.\/([^"']+)["']/g)) encontrados.add(alvo);
  return encontrados;
}

const pendentes = [ENTRADA];
const copiados = new Set();

await mkdir(vendorDir, { recursive: true });

while (pendentes.length) {
  const arquivo = pendentes.pop();
  if (copiados.has(arquivo)) continue;
  copiados.add(arquivo);

  const origem = path.join(buildDir, arquivo);
  const codigo = await readFile(origem, "utf8");
  await copyFile(origem, path.join(vendorDir, arquivo));
  for (const irmao of irmaosDe(codigo)) pendentes.push(irmao);
}

/* Os addons também trazem quem eles pedem por caminho relativo. */
const addonsPendentes = [...ADDONS];
const addonsCopiados = new Set();

while (addonsPendentes.length) {
  const arquivo = addonsPendentes.pop();
  if (addonsCopiados.has(arquivo)) continue;
  addonsCopiados.add(arquivo);

  const origem = path.join(addonsDir, arquivo);
  const codigo = await readFile(origem, "utf8");
  const alvo = path.join(addonsVendorDir, arquivo);
  await mkdir(path.dirname(alvo), { recursive: true });
  await copyFile(origem, alvo);

  /* Aqui os relativos podem SUBIR de pasta (`../utils/...`), diferente do
     bundle, onde são todos irmãos. */
  for (const [, relativo] of codigo.matchAll(/from\s*["'](\.\.?\/[^"']+)["']/g)) {
    addonsPendentes.push(path.posix.normalize(path.posix.join(path.posix.dirname(arquivo), relativo)));
  }
}

console.log(`Three.js copiado para outputs/vendor/: ${[...copiados].sort().join(", ")}.`);
console.log(`Addons copiados para outputs/vendor/addons/: ${[...addonsCopiados].sort().join(", ")}.`);
