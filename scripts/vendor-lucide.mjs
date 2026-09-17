/*
 * Gera outputs/media/icones-admin.svg com os ícones Lucide listados em
 * outputs/js/admin/icones.js.
 *
 *   npm run vendor:lucide
 *
 * Baixa cada ícone do pacote `lucide-static` na versão fixada abaixo e grava um
 * sprite de <symbol>s. Os atributos de traço ficam FORA dos símbolos de
 * propósito: assim o CSS do painel (`.admin-icone`) decide cor e espessura, e o
 * mesmo ícone serve na navegação e na agenda.
 */
import { writeFile } from "node:fs/promises";
import { ICONES } from "../outputs/js/admin/icones.js";

const VERSAO = "1.46.0";
const destino = new URL("../outputs/media/icones-admin.svg", import.meta.url);

async function baixar(nome) {
  const url = `https://cdn.jsdelivr.net/npm/lucide-static@${VERSAO}/icons/${nome}.svg`;
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Não foi possível baixar ${nome} (${resposta.status}).`);
  const svg = await resposta.text();
  const miolo = /<svg[^>]*>([\s\S]*?)<\/svg>/.exec(svg)?.[1];
  if (!miolo) throw new Error(`SVG inesperado para ${nome}.`);
  const formas = miolo.replace(/\s*\n\s*/g, "").trim();
  return `<symbol id="${nome}" viewBox="0 0 24 24">${formas}</symbol>`;
}

const simbolos = [];
for (const nome of ICONES) simbolos.push(await baixar(nome));

const sprite = `<svg xmlns="http://www.w3.org/2000/svg">
<!-- Lucide ${VERSAO} (lucide-static) — ISC License, Copyright (c) Lucide Icons and Contributors. https://lucide.dev -->
${simbolos.join("\n")}
</svg>
`;

await writeFile(destino, sprite);
console.log(`icones-admin.svg: ${simbolos.length} ícones (Lucide ${VERSAO}).`);
