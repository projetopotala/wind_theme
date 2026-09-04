import { spawnSync } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * O MODELO 3D QUE É A PAISAGEM DA JORNADA.
 *
 * Como a receita do vídeo, este script existe para os passos não se perderem.
 * Aqui isso importa ainda mais: o arquivo que veio do banco de modelos não
 * carrega no three.js, e o motivo não dá erro — dá um modelo cinza.
 *
 * NÃO roda no build. `gltf-transform` não é dependência do projeto, e o
 * resultado é um binário versionado: só se roda de novo quando o modelo de
 * origem muda.
 *
 *   node scripts/prepare-home-travessia-modelo.mjs
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origem = path.join(raiz, "assets-source", "home-travessia", "home-travessia-modelo-source.glb");
const destino = path.join(raiz, "outputs", "media", "home-travessia.glb");

/*
 * A ordem dos passos não é arbitrária.
 *
 * `metalrough` PRECISA vir primeiro, e é o passo sem o qual nada mais importa.
 * O modelo veio com `KHR_materials_pbrSpecularGlossiness`, uma extensão que o
 * glTF depreciou e que o three.js REMOVEU — conferido no loader da versão que o
 * projeto usa: zero ocorrências. Carregado como veio, ele não dá erro nenhum:
 * simplesmente ignora os materiais e desenha o modelo cinza, sem textura. É o
 * tipo de defeito que se perde uma tarde procurando no lugar errado.
 *
 * `dedup` e `prune` antes de comprimir, porque comprimir o que vai ser jogado
 * fora é trabalho perdido — juntos tiraram 18 MB.
 *
 * `resize` antes de `webp`: reduzir depois de recomprimir é recomprimir duas
 * vezes. As texturas vinham em 4096×4096 e até 2048×4096 com 16 MB numa só;
 * para um fundo que fica atrás dos cards e recebe véu, 2048 é de sobra.
 *
 * `meshopt` por último, e é ele que faz o grosso: 31,5 MB viraram 9,8. A malha
 * não é simplificada — os 445 mil triângulos continuam todos lá. O que muda é
 * como eles são guardados.
 *
 * Medido, passo a passo: 85,4 → 88,1 (metalrough) → 72,0 (dedup) → 69,6 (prune)
 * → 41,3 (resize) → 31,5 (webp) → 9,8 MB (meshopt).
 */
const PASSOS = [
  ["metalrough"],
  ["dedup"],
  ["prune"],
  ["resize", "--width", "2048", "--height", "2048"],
  ["webp", "--quality", "82"],
  ["meshopt"],
];

const cli = process.env.GLTF_TRANSFORM || "npx";
const prefixo = process.env.GLTF_TRANSFORM ? [] : ["--yes", "@gltf-transform/cli@latest"];

await mkdir(path.dirname(destino), { recursive: true });
await stat(origem);

const temporarios = [];
let atual = origem;

try {
  for (const [indice, passo] of PASSOS.entries()) {
    const saida = indice === PASSOS.length - 1
      ? destino
      : path.join(path.dirname(destino), `.modelo-passo-${indice}.glb`);
    if (saida !== destino) temporarios.push(saida);

    const resultado = spawnSync(cli, [...prefixo, ...passo, atual, saida], { stdio: "inherit" });
    if (resultado.error) {
      throw new Error(
        `não consegui rodar o gltf-transform (${resultado.error.message}). `
        + "Ele não é dependência do projeto; use npx ou aponte GLTF_TRANSFORM para o binário.",
      );
    }
    if (resultado.status !== 0) throw new Error(`o passo \`${passo[0]}\` terminou com código ${resultado.status}`);
    atual = saida;
  }
} finally {
  for (const arquivo of temporarios) await rm(arquivo, { force: true });
}

const { size } = await stat(destino);
console.log(`home-travessia.glb — ${(size / 1048576).toFixed(1)} MB`);
