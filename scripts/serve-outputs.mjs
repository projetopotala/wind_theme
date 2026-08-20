import { createServer } from "node:http";
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
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": types[extname(target).toLowerCase()] || "application/octet-stream",
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
