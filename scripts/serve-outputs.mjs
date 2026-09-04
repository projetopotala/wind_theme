import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve("outputs");
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function resolveRequestPath(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.split("?", 1)[0]);
  } catch {
    return null;
  }
  const segments = pathname.replaceAll("\\", "/").split("/");
  if (segments.includes("..")) return null;
  const relative = pathname === "/" ? "transcender.html" : pathname.replace(/^[/\\]+/, "");
  const target = resolve(root, relative);
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

export function createPreviewServer() {
  return createServer(async (request, response) => {
    const target = resolveRequestPath(request.url || "/");
    if (!target) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    try {
      const info = await stat(target);
      if (!info.isFile()) throw new Error("not-file");
      const tipo = types[extname(target).toLowerCase()] || "application/octet-stream";

      /*
       * PEDIDOS DE TRECHO, sem os quais nenhum vídeo é rebobinável.
       *
       * O fundo da jornada anda com a rolagem: cada rolagem escreve
       * `currentTime`, e para isso o navegador busca dentro do arquivo. Buscar é
       * pedir um trecho. Respondendo sempre 200 com o arquivo inteiro, o
       * servidor está dizendo que não sabe recortar — e o navegador conclui que
       * o vídeo não é buscável.
       *
       * O sintoma não é um erro: o vídeo carrega, `readyState` chega a 4, e
       * `seekable` fica VAZIO. Escrever em `currentTime` é descartado em
       * silêncio e o fundo trava no primeiro quadro. Custou uma investigação até
       * o servidor virar suspeito, porque tudo parecia certo do lado da página.
       */
      const faixa = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || "");
      if (faixa) {
        const inicio = faixa[1] ? Number(faixa[1]) : 0;
        const fim = faixa[2] ? Math.min(Number(faixa[2]), info.size - 1) : info.size - 1;

        if (!(inicio >= 0) || inicio > fim || inicio >= info.size) {
          /* Fora do arquivo: a resposta certa é 416, e ela precisa dizer o
             tamanho real para o navegador se corrigir. */
          response.writeHead(416, { "Content-Range": `bytes */${info.size}` });
          response.end();
          return;
        }

        response.writeHead(206, {
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
          "Content-Type": tipo,
          "Content-Length": fim - inicio + 1,
          "Content-Range": `bytes ${inicio}-${fim}/${info.size}`,
        });
        /* Em fluxo, e não `readFile`: um trecho de cem bytes não deve custar a
           leitura de sete megabytes. */
        createReadStream(target, { start: inicio, end: fim }).pipe(response);
        return;
      }

      response.writeHead(200, {
        /* Anunciado mesmo na resposta inteira: é assim que o navegador descobre
           que PODE pedir trechos depois. */
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Type": tipo,
        "Content-Length": info.size,
      });
      response.end(await readFile(target));
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
}

const isEntryPoint = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isEntryPoint) {
  const port = Number(process.env.POTALA_PREVIEW_PORT || 4173);
  createPreviewServer().listen(port, "127.0.0.1", () => {
    console.log("Portal Potala: http://127.0.0.1:" + port + "/");
  });
}
