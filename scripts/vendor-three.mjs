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
const vendorDir = path.join(root, "outputs", "vendor");

const ENTRADA = "three.module.min.js";

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

console.log(`Three.js copiado para outputs/vendor/: ${[...copiados].sort().join(", ")}.`);
