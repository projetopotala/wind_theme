import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

/*
 * COMPILA E PRÉ-RENDERIZA A HOME EDITORIAL.
 *
 *   npm run build:home
 *
 * 1. Build do cliente: outputs/js/home-editorial/home.js e home.css.
 * 2. Build de servidor da mesma ilha, em .tmp/, só para gerar o HTML.
 * 3. O HTML de <Home/> é gravado em outputs/transcendido.html entre os
 *    marcadores <!--home-editorial--> e <!--/home-editorial-->.
 *
 * Por que pré-renderizar: sem JavaScript a página precisa continuar legível,
 * com textos e imagens em ordem. E o React, no navegador, só assume a
 * marcação que já está lá (hydrateRoot) — sem piscar conteúdo novo.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configFile = path.join(raiz, "vite.home.config.mjs");
const entradaServidor = path.join(raiz, "ilhas", "home-editorial", "entrada-servidor.jsx");
const saidaServidor = path.join(raiz, ".tmp", "home-editorial-ssr");
const pagina = path.join(raiz, "outputs", "transcendido.html");

export const INICIO = "<!--home-editorial-->";
export const FIM = "<!--/home-editorial-->";

export function injetar(html, marcacao) {
  const inicio = html.indexOf(INICIO);
  const fim = html.indexOf(FIM);
  if (inicio < 0 || fim < inicio) throw new Error("transcendido.html sem os marcadores da ilha");
  return html.slice(0, inicio + INICIO.length) + marcacao + html.slice(fim);
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
  const { renderizar } = await import(`${modulo}?v=${Date.now()}`);
  const html = await readFile(pagina, "utf8");
  await writeFile(pagina, injetar(html, renderizar()));
  console.log("Home editorial compilada e pré-renderizada em outputs/transcendido.html");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await compilar();
}
