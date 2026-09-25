import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/*
 * BUILD DA ILHA DA HOME EDITORIAL.
 *
 *   npm run build:home
 *
 * Separado do vite.config.ts da raiz, que serve ao app vinext: aqui só se
 * compila ilhas/home-editorial/ para arquivos de nome fixo em
 * outputs/js/home-editorial/, que a página estática referencia diretamente.
 *
 * O three.js fica de fora do bundle: a página já o recebe do vendor por
 * importmap, o mesmo arquivo que a Travessia usa (e que o navegador já tem em
 * cache).
 */

const raiz = fileURLToPath(new URL(".", import.meta.url));
const ilha = `${raiz}ilhas/home-editorial`;

export default defineConfig({
  root: ilha,
  base: "./",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: `${raiz}outputs/js/home-editorial`,
    emptyOutDir: true,
    target: "es2022",
    cssCodeSplit: false,
    rolldownOptions: {
      input: `${ilha}/main.jsx`,
      external: ["three"],
      output: {
        entryFileNames: "home.js",
        chunkFileNames: "[name].js",
        assetFileNames: "home[extname]",
      },
    },
  },
});
