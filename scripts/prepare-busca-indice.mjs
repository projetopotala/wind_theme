import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LIMITE_POR_PAGINA,
  PAGINAS_INDEXADAS,
  extrairTextoDaPagina,
  recortar,
} from "../outputs/js/home/busca-indice.js";

/*
 * GERA O ÍNDICE DE BUSCA DAS SEÇÕES.
 *
 *   node scripts/prepare-busca-indice.mjs
 *
 * NÃO roda no build. O resultado é um arquivo versionado, e um teste da suíte
 * regenera e compara — se alguém editar uma seção e esquecer de rodar isto, o
 * teste falha dizendo o que fazer. Índice velho deixa de ser surpresa.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, "outputs", "busca-indice.json");

export async function montarIndice(lerArquivo = readFile) {
  const paginas = {};
  for (const pagina of PAGINAS_INDEXADAS) {
    const html = await lerArquivo(path.join(raiz, "outputs", pagina), "utf8").catch(() => null);
    /*
     * Uma página que ainda não existe simplesmente não entra.
     *
     * A lista inclui seções que podem ser criadas depois; abortar por causa de
     * uma faltando faria o índice inteiro deixar de ser gerado por causa de uma
     * página que ninguém ainda escreveu.
     */
    if (html === null) continue;
    paginas[pagina] = recortar(extrairTextoDaPagina(html));
  }
  return paginas;
}

/* Só escreve quando chamado direto, para o teste poder usar `montarIndice`
   sem gravar nada em disco. */
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const indice = await montarIndice();
  await writeFile(destino, `${JSON.stringify(indice, null, 2)}\n`, "utf8");
  const total = Object.values(indice).reduce((soma, texto) => soma + texto.length, 0);
  console.log(
    `busca-indice.json — ${Object.keys(indice).length} páginas, `
    + `${(total / 1024).toFixed(1)} KB de texto (teto de ${LIMITE_POR_PAGINA} por página)`,
  );
}
