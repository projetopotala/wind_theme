/*
 * Gera ilhas/cenas-blocos/icones.js com os ícones Lucide usados pelos blocos
 * das cenas da Home (ilhas/cenas-blocos/blocos.js).
 *
 *   npm run vendor:lucide-blocos
 *
 * Mesma fonte e versão de scripts/vendor-lucide.mjs (o sprite do admin), mas
 * a saída é um módulo: cada ícone vira a lista das suas formas
 * ([tag, atributos]), que o React desenha como <path>, <circle>... — assim o
 * traço de cada forma pode ser animado (o ícone se redesenha no hover).
 */
import { writeFile } from "node:fs/promises";
import { ICONES_DOS_BLOCOS } from "../ilhas/cenas-blocos/blocos.js";

const VERSAO = "1.46.0";
const destino = new URL("../ilhas/cenas-blocos/icones.js", import.meta.url);
const FORMAS = new Set(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"]);

async function baixar(nome) {
  const url = `https://cdn.jsdelivr.net/npm/lucide-static@${VERSAO}/icons/${nome}.svg`;
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Não foi possível baixar ${nome} (${resposta.status}).`);
  const svg = await resposta.text();
  const miolo = /<svg[^>]*>([\s\S]*?)<\/svg>/.exec(svg)?.[1];
  if (!miolo) throw new Error(`SVG inesperado para ${nome}.`);
  const formas = [...miolo.matchAll(/<([a-z]+)\s([^>]*?)\/?>/g)].map(([, tag, atributos]) => {
    if (!FORMAS.has(tag)) throw new Error(`${nome}: forma inesperada <${tag}>.`);
    return [tag, Object.fromEntries([...atributos.matchAll(/([a-z0-9-]+)="([^"]*)"/g)].map(([, chave, valor]) => [chave, valor]))];
  });
  if (!formas.length) throw new Error(`${nome}: nenhuma forma.`);
  return [nome, formas];
}

const icones = [];
for (const nome of ICONES_DOS_BLOCOS) icones.push(await baixar(nome));

const modulo = `/* Gerado por scripts/vendor-lucide-blocos.mjs — não edite à mão.
   Lucide ${VERSAO} (lucide-static) — ISC License, Copyright (c) Lucide Icons and Contributors. https://lucide.dev */

export const ICONES = ${JSON.stringify(Object.fromEntries(icones), null, 1)};
`;

await writeFile(destino, modulo);
console.log(`icones.js: ${icones.length} ícones (Lucide ${VERSAO}).`);
