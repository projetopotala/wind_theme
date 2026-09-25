import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/*
 * BUILD DA ILHA DOS BLOCOS DAS CENAS.
 *
 *   npm run build:blocos
 *
 * Como vite.home.config.mjs: compila só ilhas/cenas-blocos/ para arquivos de
 * nome fixo em outputs/js/cenas-blocos/, que atendimentos-conceito.html
 * referencia diretamente.
 */

const raiz = fileURLToPath(new URL(".", import.meta.url));
const ilha = `${raiz}ilhas/cenas-blocos`;

export default defineConfig({
  root: ilha,
  base: "./",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: `${raiz}outputs/js/cenas-blocos`,
    emptyOutDir: true,
    target: "es2022",
    cssCodeSplit: false,
    rolldownOptions: {
      input: `${ilha}/main.jsx`,
      output: {
        entryFileNames: "blocos.js",
        chunkFileNames: "[name].js",
        assetFileNames: "blocos[extname]",
      },
    },
  },
});
