import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { LEGACY_ROUTE_ASSETS, legacyAssetForPath } from "../worker/legacy-compatibility";

const legacyFiles = [...new Set([...Object.values(LEGACY_ROUTE_ASSETS), "secoes.css", "secoes.js"])];

const publish = async (root: string, file: string) => {
  const source = await readFile(resolve(root, file));
  return file.endsWith(".html")
    ? source.toString().replaceAll('href="secoes.css"', 'href="/_legacy/secoes.css"').replaceAll('src="secoes.js"', 'src="/_legacy/secoes.js"')
    : source;
};

export function legacyAssets(): Plugin {
  const root = resolve(process.cwd(), "outputs");
  return {
    name: "potala-legacy-assets",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        const file = legacyAssetForPath(pathname);
        if (!file) return next();
        try { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(await publish(root, file)); }
        catch { next(); }
      });
      server.middlewares.use("/_legacy", async (request, response, next) => {
        const file = request.url?.replace(/^\//, "") ?? "";
        if (!legacyFiles.includes(file)) return next();
        try { response.setHeader("content-type", file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8"); response.end(await publish(root, file)); }
        catch { next(); }
      });
    },
    async generateBundle() {
      for (const file of legacyFiles) this.emitFile({ type: "asset", fileName: `_legacy/${file}`, source: await publish(root, file) });
    },
  };
}
