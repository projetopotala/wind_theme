/**
 * Manifesto das imagens disponíveis para os blocos da jornada.
 *
 * O painel é uma página estática: ele não consegue listar um diretório. Este
 * arquivo é o índice que a grade de "Trocar imagem" lê.
 *
 *   node scripts/build-media-manifest.mjs
 */
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const EXTENSOES = new Set([".webp", ".png", ".jpg", ".jpeg"]);

/**
 * Os nomes que entram no manifesto, filtrados e em ordem.
 *
 * Separado do resto para poder ser conferido: `readdir` já devolve ordenado em
 * alguns sistemas de arquivos e não em outros, então um teste que olhasse só a
 * saída do script passaria aqui e falharia na máquina de outra pessoa — ou,
 * pior, o contrário.
 *
 * A ordem estável importa porque sem ela duas execuções produzem arquivos
 * diferentes com o mesmo conteúdo, e cada build vira um diff no git sem
 * nenhuma mudança real. O filtro importa porque `manifest.json` mora na mesma
 * pasta, e mandá-lo para o sharp derruba o script inteiro.
 */
export function manifestEntries(nomes = []) {
  return nomes
    .filter((nome) => EXTENSOES.has(path.extname(nome).toLowerCase()))
    .sort();
}

/* O bloco abaixo só roda quando o arquivo é chamado direto, e não quando o
   teste o importa para conferir `manifestEntries`. */
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const raiz = path.resolve(import.meta.dirname, "..");
  const midia = path.join(raiz, "outputs", "media");
  const arquivos = manifestEntries(await readdir(midia));

  const imagens = [];
  for (const arquivo of arquivos) {
    const caminho = path.join(midia, arquivo);
    const { size } = await stat(caminho);
    const { width, height } = await sharp(caminho).metadata();
    imagens.push({ arquivo, largura: width, altura: height, bytes: size });
  }

  await writeFile(
    path.join(midia, "manifest.json"),
    `${JSON.stringify({ geradoEm: new Date().toISOString(), imagens }, null, 2)}\n`,
  );

  console.log(`Manifesto com ${imagens.length} imagens.`);
}
