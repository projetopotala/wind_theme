import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

/*
 * COMPILA E PRÉ-RENDERIZA OS BLOCOS DAS CENAS DA HOME.
 *
 *   npm run build:blocos
 *
 * 1. Build do cliente: outputs/js/cenas-blocos/blocos.js e blocos.css.
 * 2. Build de servidor da mesma ilha, em .tmp/, só para gerar o HTML.
 * 3. Os blocos de cada cena são gravados em outputs/atendimentos-conceito.html
 *    entre <!--blocos:ID--> e <!--/blocos:ID-->.
 *
 * Pré-renderizar pelo mesmo motivo da Home editorial: sem JavaScript os
 * blocos continuam lá (são links), e a página já nasce com a altura certa —
 * a foto e a linha da jornada medem o texto das cenas logo ao carregar.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configFile = path.join(raiz, "vite.blocos.config.mjs");
const entradaServidor = path.join(raiz, "ilhas", "cenas-blocos", "entrada-servidor.jsx");
const saidaServidor = path.join(raiz, ".tmp", "cenas-blocos-ssr");
const pagina = path.join(raiz, "outputs", "atendimentos-conceito.html");

export function injetar(html, cena, marcacao) {
  const inicio = `<!--blocos:${cena}-->`;
  const fim = `<!--/blocos:${cena}-->`;
  const a = html.indexOf(inicio);
  const b = html.indexOf(fim);
  if (a < 0 || b < a) throw new Error(`atendimentos-conceito.html sem os marcadores dos blocos de ${cena}`);
  return html.slice(0, a + inicio.length) + marcacao + html.slice(b);
}

async function compilar() {
  await build({ configFile, logLevel: "warn" });
  await build({
    configFile,
    logLevel: "warn",
    ssr: { noExternal: true },
    build: {
      ssr: entradaServidor,
      outDir: saidaServidor,
      emptyOutDir: true,
      rolldownOptions: {
        input: entradaServidor,
        output: { entryFileNames: "entrada-servidor.mjs" },
      },
    },
  });

  const modulo = pathToFileURL(path.join(saidaServidor, "entrada-servidor.mjs")).href;
  const { CENAS, renderizar } = await import(`${modulo}?v=${Date.now()}`);
  let html = await readFile(pagina, "utf8");
  for (const cena of CENAS) html = injetar(html, cena, renderizar(cena));
  await writeFile(pagina, html);
  console.log(`Blocos das ${CENAS.length} cenas compilados e pré-renderizados em outputs/atendimentos-conceito.html`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await compilar();
}
