import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DESTINOS_SEM_CONTEUDO, PAGINAS_DO_ASSISTENTE, extrairPagina } from "../outputs/js/assistente/conhecimento.js";

/*
 * GERA A BASE DE CONHECIMENTO PÚBLICA DO ASSISTENTE (IA-01).
 *
 *   node scripts/prepare-ia-conhecimento.mjs
 *
 * Mesma lógica do índice de busca: arquivo versionado e servido como estático
 * (outputs/ia/conhecimento.json). O backend do assistente lê este arquivo do
 * próprio site; editar uma página e esquecer de regenerar faz um teste falhar.
 */
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, "outputs", "ia", "conhecimento.json");

export async function montarConhecimento(lerArquivo = readFile) {
  const paginas = [];
  for (const url of PAGINAS_DO_ASSISTENTE) {
    const html = await lerArquivo(path.join(raiz, "outputs", url), "utf8").catch(() => null);
    if (html !== null) paginas.push(extrairPagina(url, html));
  }
  const destinos = Object.entries(DESTINOS_SEM_CONTEUDO).map(([url, d]) => ({ url, titulo: d.titulo, descricao: d.descricao, texto: "" }));
  return { versao: 1, paginas: [...paginas, ...destinos] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const base = await montarConhecimento();
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, `${JSON.stringify(base, null, 1)}\n`, "utf8");
  const total = base.paginas.reduce((s, p) => s + p.texto.length, 0);
  console.log(`conhecimento.json - ${base.paginas.length} páginas, ${(total / 1024).toFixed(1)} KB de texto`);
}
