// Servidor de TESTE da pagina da sala com SDK Supabase falso por cenario (?cenario=open|too_early|expired|closed|cancelled|not_confirmed|denied|rede|erro403|chat|perda|encerra|pro|tokenfail|sem_daily).
// Uso: node d4-sala-servidor-de-teste.mjs <caminho-de-outputs>  ->  http://127.0.0.1:4173/sala-atendimento.html?pedido=<uuid>&cenario=open
// Nao entra em npm run test:portal; nao fala com o Supabase nem com o Daily.
// Servidor de TESTE local (fora do repo): serve outputs/ e troca o SDK do Supabase por um falso com cenÃ¡rios.
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.argv[2];
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml" };

const FAKE = `
(() => {
  const p = new URLSearchParams(location.search); const c = p.get("cenario") || "open"; let listagens = 0; const msgs = []; let nid = 0;
  const agora = Date.now(), iso = (m) => new Date(agora + m * 60000).toISOString();
  const ctx = {
    open: { state: "open", role: "client", service: "Reiki", opens_at: iso(-20), closes_at: iso(60) },
    pro: { state: "open", role: "professional", service: "Reiki", requester_name: "Cliente Sintetico" },
    too_early: { state: "too_early", role: "client", opens_at: iso(120) },
    expired: { state: "expired", role: "client" }, closed: { state: "closed", role: "client" }, cancelled: { state: "cancelled", role: "client" },
    not_confirmed: { state: "not_confirmed", role: "client" }, denied: { state: "denied" },
  };
  const rede = () => Promise.reject(Object.assign(new Error("network"), { code: "network" }));
  window.__sala = { chamadas: [] };
  const real = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    if (String(url).includes("/functions/v1/issue-appointment-room-token")) {
      window.__sala.chamadas.push({ url: String(url), auth: init?.headers?.Authorization, body: init?.body });
      if (c === "tokenfail") return new Response(JSON.stringify({ code: "42501", message: "x" }), { status: 403 });
      if (c === "sem_daily") return new Response(JSON.stringify({ message: "x" }), { status: 503 });
      return new Response(JSON.stringify({ url: "https://teste.daily.co/potala-" + "a".repeat(32), token: "tok-falso", expires_at: iso(60), role: ctx[c]?.role || "client" }), { status: 200 });
    }
    return real(url, init);
  };
  window.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: c === "sem_sessao" ? null : { access_token: "fake" } } }) },
    rpc: async (nome, args) => {
      window.__sala.chamadas.push({ rpc: nome, args });
      if (nome === "appointment_room_context") {
        if (c === "rede") { if (!window.__sala.tentou) { window.__sala.tentou = 1; return rede(); } return { data: ctx.open, error: null }; }
        if (c === "erro403") return { data: null, error: { code: "42501", message: "x" }, status: 403 };
        return { data: ctx[c === "chat" || c === "perda" || c === "encerra" || c === "tokenfail" || c === "sem_daily" || c === "sem_sessao" ? "open" : c] ?? ctx.denied, error: null };
      }
      if (nome === "list_appointment_room_messages") {
        listagens++;
        if (c === "perda" && listagens >= 2 && listagens <= 3) return rede();
        if (c === "encerra" && listagens >= 3) return { data: null, error: { code: "P0001", message: "closed" }, status: 400 };
        const depois = args.p_after || 0; return { data: msgs.filter((m) => m.id > depois), error: null };
      }
      if (nome === "post_appointment_room_message") { msgs.push({ id: ++nid, role: "client", mine: true, body: args.p_body }); return { data: { id: nid }, error: null }; }
      if (nome === "close_appointment_room_session") return { data: { closed: true }, error: null };
      return { data: null, error: { code: "x" } };
    },
  }) };
  if (c === "chat" || c === "perda") { msgs.push({ id: ++nid, role: "professional", mine: false, body: "<img src=x onerror=\\"window.__xss=1\\"><b>negrito</b>" }); }
})();`;

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let p = decodeURIComponent(url.pathname);
  if (p === "/js/vendor/supabase.js") { res.writeHead(200, { "Content-Type": TIPOS[".js"] }); return res.end(FAKE); }
  let f = join(ROOT, p);
  if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": TIPOS[extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(readFileSync(f));
}).listen(4173, "127.0.0.1", () => console.log("ok 4173"));
