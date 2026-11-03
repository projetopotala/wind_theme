import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pedidoDoEndereco, caminhoDaSala, visaoDoContexto, mensagemDeErro } from "../../outputs/js/sala/estado-sala.js";
import { urlDeSalaValida, adaptadorDaily, criarPortaDeVideo } from "../../outputs/js/sala/video-sala.js";
import { criarChat, normalizarMensagem } from "../../outputs/js/sala/chat-sala.js";
import { criarSessaoSala } from "../../outputs/js/sala/sessao-sala.js";
import { createRoomTokenHandler } from "../../supabase/functions/issue-appointment-room-token/handler.ts";

const ID = "10000000-0000-4000-8000-000000000001";
const SALA = "potala-" + "a".repeat(32);

// DOM mínimo, suficiente para provar que o texto nunca vira HTML.
function no(tag) {
  return { tag, children: [], className: "", _text: "", listeners: {},
    set textContent(v) { this._text = String(v); this.children = []; }, get textContent() { return this._text; },
    append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; },
    remove() { this.removed = true; }, setAttribute(k, v) { this[k] = v; },
    addEventListener(n, f) { this.listeners[n] = f; } };
}
const doc = { createElement: no };

test("endereço: só aceita UUID e monta caminho seguro", () => {
  assert.equal(pedidoDoEndereco(new URLSearchParams(`pedido=${ID}`)), ID);
  assert.equal(pedidoDoEndereco(new URLSearchParams("pedido=../x")), null);
  assert.equal(pedidoDoEndereco(new URLSearchParams("")), null);
  assert.equal(caminhoDaSala(ID), `/sala-atendimento.html?pedido=${ID}`);
  assert.throws(() => caminhoDaSala("x"));
});

test("estados: cada estado do banco tem tela; desconhecido nega", () => {
  assert.equal(visaoDoContexto({ state: "open" }).podeEntrar, true);
  for (const s of ["too_early", "expired", "closed", "cancelled", "not_confirmed", "denied", undefined]) {
    const v = visaoDoContexto({ state: s });
    assert.equal(v.podeEntrar, false);
    assert.ok(v.titulo && v.texto);
  }
  assert.match(mensagemDeErro({ code: "42501" }), /acesso/i);
  assert.match(mensagemDeErro({ code: "54000" }), /Muitas/);
  assert.match(mensagemDeErro({ code: "network", status: 0 }), /conexão/i);
});

test("vídeo: só URL de sala potala-* em daily.co, sem query nem credencial", () => {
  assert.equal(urlDeSalaValida(`https://x.daily.co/${SALA}`), true);
  for (const u of [`http://x.daily.co/${SALA}`, `https://evil.com/${SALA}`, `https://x.daily.co.evil.com/${SALA}`,
    "https://x.daily.co/outra", `https://x.daily.co/${SALA}?t=1`, `https://u:p@x.daily.co/${SALA}`, "lixo"]) {
    assert.equal(urlDeSalaValida(u), false, u);
  }
  const container = no("div");
  const porta = criarPortaDeVideo(adaptadorDaily({ documento: doc }));
  assert.throws(() => porta.entrar(container, { url: "https://evil.com/x", token: "t" }));
  porta.entrar(container, { url: `https://x.daily.co/${SALA}`, token: "a b" });
  assert.match(container.children[0].src, /\?t=a%20b$/);
  assert.match(container.children[0].allow, /camera; microphone/);
  porta.sair();
  assert.equal(container.children[0].removed, true);
});

test("chat: HTML malicioso entra como texto, nunca como marcação", async () => {
  const lista = no("ol"), form = no("form"), campo = { value: "" }, aviso = no("p");
  const chat = criarChat({ lista, formulario: form, campo, aviso, documento: doc,
    listar: async () => [{ id: 1, mine: false, role: "client", body: "<img src=x onerror=alert(1)>" }],
    enviar: async () => {}, agendar: () => 0, cancelar: () => {} });
  await chat.iniciar();
  const corpo = lista.children[0].children[1];
  assert.equal(corpo.textContent, "<img src=x onerror=alert(1)>");
  assert.equal(corpo.innerHTML, undefined);
  assert.equal(chat.ultimo, 1);
  assert.equal(normalizarMensagem("  \u0000oi\u0007 "), "oi");
  assert.equal(normalizarMensagem("   "), null);
  assert.equal(normalizarMensagem("a".repeat(1001)), null);
});

test("chat: perda e recuperação de conexão; erro de autorização encerra", async () => {
  const eventos = [];
  const respostas = [{ code: "network", status: 0 }, [], { code: "42501", status: 403 }];
  const chat = criarChat({ lista: no("ol"), formulario: no("form"), campo: { value: "" }, aviso: no("p"), documento: doc,
    listar: async () => { const r = respostas.shift(); if (r && !Array.isArray(r)) throw Object.assign(new Error("x"), r); return r; },
    enviar: async () => {}, agendar: (fn) => { fn(); return 0; }, cancelar: () => {},
    aoPerder: () => eventos.push("perdeu"), aoRecuperar: () => eventos.push("voltou"), aoEncerrar: () => eventos.push("encerrou") });
  await chat.iniciar();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(eventos, ["perdeu", "voltou", "encerrou"]);
});

function uiFalsa() {
  const log = [];
  return { log, areaDoVideo: no("div"),
    mostrarCarregando: () => log.push("carregando"), mostrarVisao: (v) => log.push(`visao:${v.estado}`),
    mostrarEntrando: () => log.push("entrando"), mostrarErro: () => log.push("erro"), mostrarSala: () => log.push("sala"),
    mostrarConexao: () => {}, mostrarSaida: (m) => log.push(`saida:${m}`) };
}
function videoFalso() { const v = { entrou: 0, saiu: 0, entrar() { v.entrou++; }, sair() { v.saiu++; } }; return v; }

test("sessão: não emite token fora do estado open", async () => {
  for (const state of ["too_early", "expired", "closed", "cancelled", "not_confirmed", "denied"]) {
    let emitido = 0;
    const s = criarSessaoSala({ requestId: ID, ui: uiFalsa(), video: videoFalso(), criarChat: () => ({}),
      api: { contexto: async () => ({ state, role: "client" }), emitir: async () => { emitido++; } } });
    await s.carregar();
    assert.equal(await s.entrar(), false);
    assert.equal(emitido, 0, state);
  }
});

test("sessão: fluxo aberto monta vídeo, inicia chat; cliente não encerra para todos", async () => {
  const video = videoFalso(); let chatIniciado = 0, parado = 0, encerrou = 0;
  const s = criarSessaoSala({ requestId: ID, ui: uiFalsa(), video,
    criarChat: () => ({ iniciar: async () => { chatIniciado++; }, parar: () => { parado++; } }),
    api: { contexto: async () => ({ state: "open", role: "client" }),
      emitir: async () => ({ url: `https://x.daily.co/${SALA}`, token: "t", expires_at: "2099-01-01T00:00:00Z" }),
      encerrar: async () => { encerrou++; } } });
  await s.carregar();
  assert.equal(await s.entrar(), true);
  assert.equal(video.entrou, 1); assert.equal(chatIniciado, 1);
  assert.equal(await s.encerrar(), false);
  assert.equal(encerrou, 0);
  s.sair();
  assert.equal(video.saiu, 1); assert.equal(parado, 1);
});

test("sessão: falha ao emitir token mostra erro e não monta vídeo", async () => {
  const video = videoFalso(); const ui = uiFalsa();
  const s = criarSessaoSala({ requestId: ID, ui, video, criarChat: () => ({}),
    api: { contexto: async () => ({ state: "open", role: "client" }), emitir: async () => { throw { code: "42501", status: 403 }; } } });
  await s.carregar();
  assert.equal(await s.entrar(), false);
  assert.equal(video.entrou, 0);
  assert.ok(ui.log.includes("erro"));
});

// ---- Função de borda do token ----
function borda(over = {}) {
  const chamadas = { daily: [], issue: 0 };
  const env = (n) => ({ DAILY_API_KEY: "segredo-ficticio", DAILY_DOMAIN: "potala", ROOM_ALLOWED_ORIGINS: "https://app.invalid", ...over.env })[n];
  const handler = createRoomTokenHandler({ env,
    issue: async (jwt, id) => { chamadas.issue++; chamadas.jwt = jwt; chamadas.id = id;
      return over.issue ? over.issue() : { data: { session_id: "s", room_name: SALA, provider: "daily", role: "client",
        expires_at: new Date(Date.now() + 3600e3).toISOString(), participant_id: "u1" } }; },
    daily: async (path, body) => { chamadas.daily.push([path, body]);
      return over.daily ? over.daily(path) : { status: 200, json: { token: "tok" } }; } });
  const req = (body = { request_id: ID }, headers = {}, method = "POST") => new Request("https://f.invalid/x", { method,
    headers: { "Content-Type": "application/json", Origin: "https://app.invalid", Authorization: "Bearer jwt-do-usuario", ...headers },
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
  return { handler, chamadas, req };
}

test("borda: sem JWT, com corpo extra ou ID inválido não chega ao banco nem ao provedor", async () => {
  const b = borda();
  assert.equal((await b.handler(b.req(undefined, { Authorization: "" }))).status, 401);
  assert.equal((await b.handler(b.req({ request_id: ID, extra: 1 }))).status, 400);
  assert.equal((await b.handler(b.req({ request_id: "x" }))).status, 400);
  assert.equal((await b.handler(b.req(undefined, {}, "GET"))).status, 405);
  assert.equal(b.chamadas.issue, 0); assert.equal(b.chamadas.daily.length, 0);
});

test("borda: negação do banco (não participante / cancelado / limite) nunca chama o provedor", async () => {
  for (const [code, status] of [["42501", 403], ["P0001", 409], ["54000", 429]]) {
    const b = borda({ issue: () => ({ error: { code } }) });
    const r = await b.handler(b.req());
    assert.equal(r.status, status);
    assert.equal(b.chamadas.daily.length, 0);
  }
});

test("borda: token preso à sala e ao participante, não-dono, sem gravação, usa o JWT do usuário", async () => {
  const b = borda();
  const r = await b.handler(b.req());
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.token, "tok");
  assert.equal(corpo.url, `https://potala.daily.co/${SALA}`);
  assert.equal(b.chamadas.jwt, "jwt-do-usuario");
  const sala = b.chamadas.daily.find(([p]) => p === "/rooms")[1];
  const tk = b.chamadas.daily.find(([p]) => p === "/meeting-tokens")[1].properties;
  assert.equal(sala.privacy, "private");
  assert.equal(tk.room_name, SALA); assert.equal(tk.user_id, "u1");
  assert.equal(tk.is_owner, false); assert.equal(tk.eject_at_token_exp, true);
  assert.ok(!JSON.stringify(b.chamadas.daily).includes("enable_recording\":\"cloud"));
  assert.ok(!("enable_recording" in sala.properties) && !("enable_recording" in tk));
  assert.ok(!JSON.stringify(corpo).includes("segredo-ficticio"));
});

test("borda: sem credencial do provedor responde 503 e não consulta o banco", async () => {
  const b = borda({ env: { DAILY_API_KEY: undefined } });
  assert.equal((await b.handler(b.req())).status, 503);
  assert.equal(b.chamadas.issue, 0);
});

// ---- SQL e artefatos servidos ----
const sql = readFileSync("supabase/migrations/202611020001_appointment_private_rooms.sql", "utf8");

test("SQL: RLS ligada sem policy, sem grant de tabela, funções SECURITY DEFINER com search_path vazio", () => {
  for (const t of ["sessions", "messages", "access_log"]) {
    assert.match(sql, new RegExp(`alter table public\\.appointment_room_${t} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on table public\\.appointment_room_${t} from public, anon, authenticated`));
  }
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(sql, /grant (select|insert|update|delete)[^;]*on table public\.appointment_room/i);
  const defs = sql.match(/create function public\.[\s\S]*?\n\$\$;/g) ?? [];
  assert.equal(defs.length, 6);
  for (const d of defs) { assert.match(d, /security definer/); assert.match(d, /set search_path = ''/); }
  assert.doesNotMatch(sql, /grant execute[^;]*to (anon|public)/i);
});

test("SQL: autorização derivada do banco (participante, reserva confirmada, janela, cancelamento, limite)", () => {
  assert.match(sql, /requester_user_id is not distinct from actor/);
  assert.match(sql, /is_appointment_professional\(r\.professional_profile_id\)/);
  assert.match(sql, /r\.status <> 'encerrada' or r\.reservation_schedule_id is null/);
  assert.match(sql, /r\.status = 'cancelada'/);
  assert.match(sql, /s\.status <> 'booked'/);
  assert.match(sql, /interval '15 minutes'/);
  assert.match(sql, /errcode = '54000'/);
  assert.match(sql, /sender_role = 'professional'|role' is distinct from 'professional'/);
  assert.match(sql, /delete from public\.appointment_room_messages/);
  assert.doesNotMatch(sql, /enable_recording/);
});

function arquivos(dir, lista = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) arquivos(p, lista); else lista.push(p);
  }
  return lista;
}

test("artefatos servidos: sem chave do provedor nem referência a segredo", () => {
  for (const f of arquivos("outputs/js/sala").concat(["outputs/sala-atendimento.html", "outputs/css/sala.css"])) {
    const t = readFileSync(f, "utf8");
    assert.doesNotMatch(t, /DAILY_API_KEY|api\.daily\.co|Bearer\s+[A-Za-z0-9]{20,}|service_role/i, f);
    assert.doesNotMatch(t, /innerHTML|insertAdjacentHTML|document\.write|eval\(/, f);
  }
});

test("borda: provedor ou banco fora do ar => 502 genérico, sem vazar detalhe nem segredo", async () => {
  const quedaDaily = borda({ daily: () => { throw new Error("ECONNRESET api.daily.co segredo-ficticio"); } });
  const r1 = await quedaDaily.handler(quedaDaily.req());
  assert.equal(r1.status, 502);
  assert.ok(!JSON.stringify(await r1.json()).match(/ECONNRESET|daily|segredo/i));
  const quedaBanco = borda({ issue: () => { throw new Error("fetch failed https://x.supabase.co jwt-do-usuario"); } });
  const r2 = await quedaBanco.handler(quedaBanco.req());
  assert.equal(r2.status, 502);
  assert.equal(quedaBanco.chamadas.daily.length, 0);
  assert.ok(!JSON.stringify(await r2.json()).match(/supabase|jwt/i));
});

test("borda: CORS só ecoa origem permitida; sem origem prevista não há cabeçalho", async () => {
  const b = borda();
  assert.equal((await b.handler(b.req(undefined, { Origin: "https://app.invalid" }, "OPTIONS"))).headers.get("access-control-allow-origin"), "https://app.invalid");
  assert.equal((await b.handler(b.req(undefined, { Origin: "https://evil.invalid" }, "OPTIONS"))).headers.get("access-control-allow-origin"), null);
  const sem = borda({ env: { ROOM_ALLOWED_ORIGINS: "" } });
  assert.equal((await sem.handler(sem.req(undefined, {}, "OPTIONS"))).headers.get("access-control-allow-origin"), null);
});

test("config: a função do token exige JWT validado pela plataforma", () => {
  const cfg = readFileSync("supabase/config.toml", "utf8");
  assert.match(cfg, /\[functions\.issue-appointment-room-token\][^[]*verify_jwt = true/);
});

test("SQL: leitura do chat só com sala aberta, rate limit serializado e controle rejeitado no servidor", () => {
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(actor::text \|\| ':token'/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(actor::text \|\| ':message'/);
  assert.match(sql, /clean ~ '\[\\x01-\\x08/);
  const lista = sql.slice(sql.indexOf("create function public.list_appointment_room_messages"), sql.indexOf("create function public.post_appointment_room_message"));
  assert.match(lista, /ctx ->> 'state' <> 'open'/);
});
test("CSS da sala: vídeo ocupa a largura (sem estourar em 320 px) e alvos de toque >= 44 px", () => {
  const css = readFileSync("outputs/css/sala.css", "utf8");
  assert.match(css, /\.sala-video \{[^}]*width: 100%;[^}]*min-width: 0;/);
  assert.match(css, /\.sala-pagina \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.sala-pagina button \{ min-height: 44px; \}/);
  assert.match(css, /\.sala-voltar \{[^}]*min-height: 44px/);
});

test("sessão: 401/403 ao emitir token não oferece tentar de novo", async () => {
  let podeTentar = null;
  const ui = { ...uiFalsa(), mostrarErro: (_t, o) => { podeTentar = o.podeTentarDeNovo; } };
  const s = criarSessaoSala({ requestId: ID, ui, video: videoFalso(), criarChat: () => ({}),
    api: { contexto: async () => ({ state: "open", role: "client" }), emitir: async () => { throw { code: "42501", status: 403 }; } } });
  await s.carregar(); await s.entrar();
  assert.equal(podeTentar, false);
});