// Mocks: provam a logica de encerramento/recuperacao. O comportamento real do Daily
// (expulsar conectados, efeito do DELETE) ainda exige homologacao com conta real.
import assert from "node:assert/strict";
import test from "node:test";
import { createCloseRoomHandler } from "../../supabase/functions/close-appointment-room/handler.ts";
import { createRoomTokenHandler } from "../../supabase/functions/issue-appointment-room-token/handler.ts";
import { criarApiDaSala, criarSessaoSala } from "../../outputs/js/sala/sessao-sala.js";

const ID = "11111111-2222-4333-8444-555555555555";
const SALA = "potala-0123456789abcdef0123456789abcdef";
const OK = (m) => (m === "DELETE" ? { status: 200, json: { deleted: true, name: SALA } } : { status: 200, json: { ejectedIds: ["a"] } });

function borda(over = {}) {
  const c = { daily: [], close: 0, lookup: 0 };
  const env = (n) => ({ DAILY_API_KEY: "segredo-ficticio", ROOM_ALLOWED_ORIGINS: "https://app.invalid", ...over.env })[n];
  const handler = createCloseRoomHandler({ env,
    close: async (jwt) => { c.close++; c.jwt = jwt; if (over.closeThrows) throw new Error("rede"); return over.close ?? { data: { closed: true } }; },
    lookup: async () => { c.lookup++; if (over.lookupThrows) throw new Error("lookup"); return over.lookup === undefined ? { room_name: SALA, user_ids: ["u1", "u2"] } : over.lookup; },
    daily: async (m, p, b) => { c.daily.push([m, p, b]); return over.daily ? over.daily(m, p) : OK(m); } });
  const req = (body = { request_id: ID }, headers = {}, method = "POST") => new Request("https://f.invalid/x", { method,
    headers: { "Content-Type": "application/json", Origin: "https://app.invalid", Authorization: "Bearer jwt", ...headers },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
  return { handler, c, req };
}
const corpo = async (r) => r.json();

test("encerrar: pedido sem JWT, mal formado ou com método errado não chega ao banco nem ao provedor", async () => {
  const b = borda();
  assert.equal((await b.handler(b.req(undefined, { Authorization: "" }))).status, 401);
  assert.equal((await b.handler(b.req({ request_id: ID, x: 1 }))).status, 400);
  assert.equal((await b.handler(b.req(undefined, {}, "GET"))).status, 405);
  const pre = await b.handler(b.req(undefined, {}, "OPTIONS"));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), "https://app.invalid");
  assert.equal(b.c.close, 0); assert.equal(b.c.daily.length, 0);
});

test("encerramento normal: expulsa e bane os user_ids corretos, apaga a sala e confirma", async () => {
  const b = borda();
  assert.deepEqual(await corpo(await b.handler(b.req())), { closed: true, revoked: true });
  assert.equal(b.c.jwt, "jwt");
  assert.deepEqual(b.c.daily[0], ["POST", `/rooms/${SALA}/eject`, { user_ids: ["u1", "u2"], ban: true }]);
  assert.deepEqual(b.c.daily[1], ["DELETE", `/rooms/${SALA}`, undefined]);
});

test("participante não autorizado: banco nega => 403, sem leitura de sala nem chamada ao Daily", async () => {
  const b = borda({ close: { error: { code: "42501" } } });
  assert.equal((await b.handler(b.req())).status, 403);
  assert.equal(b.c.lookup, 0); assert.equal(b.c.daily.length, 0);
});

test("banco indisponível ou erro inesperado => 502 e o provedor não é chamado", async () => {
  for (const o of [{ closeThrows: true }, { close: { error: { code: "500" } } }, { close: { data: null } }]) {
    const b = borda(o);
    assert.equal((await b.handler(b.req())).status, 502);
    assert.equal(b.c.daily.length, 0);
  }
});

test("Daily indisponível (5xx), sem autorização (401) ou lento (timeout) nunca vira sucesso", async () => {
  for (const daily of [() => ({ status: 503, json: {} }), () => ({ status: 401, json: {} }), () => { throw new Error("timeout"); }]) {
    const b = borda({ daily });
    const texto = await (await b.handler(b.req())).text();
    assert.deepEqual(JSON.parse(texto), { closed: true, revoked: false });
    assert.ok(!texto.includes("segredo"));
    assert.equal(b.c.daily.length, 2, "tenta os dois passos mesmo com falha");
  }
});

test("resposta ambígua do Daily (200 sem a confirmação esperada, 202, 204) não conta como revogado", async () => {
  for (const daily of [() => ({ status: 200, json: {} }), () => ({ status: 202, json: { deleted: true, ejectedIds: [] } }),
    () => ({ status: 204, json: {} }), (m) => (m === "DELETE" ? { status: 200, json: { deleted: false } } : OK(m))]) {
    const b = borda({ daily });
    assert.equal((await corpo(await b.handler(b.req()))).revoked, false);
  }
});

test("falha parcial: expulsão ok e exclusão falha => revoked:false; a repetição conclui sem reabrir nada", async () => {
  let delFalha = true;
  const b = borda({ daily: (m) => (m === "DELETE" && delFalha ? { status: 500, json: {} } : OK(m)) });
  assert.equal((await corpo(await b.handler(b.req()))).revoked, false);
  delFalha = false;
  assert.deepEqual(await corpo(await b.handler(b.req())), { closed: true, revoked: true });
  assert.equal(b.c.close, 2, "o banco é consultado de novo e aceita o profissional numa sala encerrada");
});

test("falha parcial inversa: expulsão falha mas a exclusão é tentada; a repetição com sala ausente (404) é idempotente", async () => {
  let ejFalha = true;
  const b = borda({ daily: (m) => (m === "POST" && ejFalha ? { status: 500, json: {} } : m === "POST" ? { status: 404, json: {} } : OK(m)) });
  assert.equal((await corpo(await b.handler(b.req()))).revoked, false);
  assert.equal(b.c.daily[1][0], "DELETE");
  ejFalha = false;
  assert.equal((await corpo(await b.handler(b.req()))).revoked, true);
});

test("requisição duplicada: duas chamadas simultâneas dão o mesmo resultado", async () => {
  const b = borda();
  const [r1, r2] = await Promise.all([b.handler(b.req()), b.handler(b.req())]);
  assert.deepEqual(await corpo(r1), { closed: true, revoked: true });
  assert.deepEqual(await corpo(r2), { closed: true, revoked: true });
});

test("sala já ausente no Daily (404) é sucesso; sem sessão no banco não há o que revogar", async () => {
  const a = borda({ daily: () => ({ status: 404, json: {} }) });
  assert.equal((await corpo(await a.handler(a.req()))).revoked, true);
  const s = borda({ lookup: null });
  assert.deepEqual(await corpo(await s.handler(s.req())), { closed: true, revoked: true });
  assert.equal(s.c.daily.length, 0);
});

test("leitura da sala falha (erro do banco ou timeout): revogação NÃO é dada como feita e o Daily não é chamado", async () => {
  const b = borda({ lookupThrows: true });
  assert.deepEqual(await corpo(await b.handler(b.req())), { closed: true, revoked: false });
  assert.equal(b.c.daily.length, 0);
});

test("sem chave do Daily configurada: revogação pendente, não sucesso", async () => {
  const b = borda({ env: { DAILY_API_KEY: "" } });
  assert.equal((await corpo(await b.handler(b.req()))).revoked, false);
  assert.equal(b.c.daily.length, 0);
});

test("token antigo após o encerramento: o banco nega nova emissão e o Daily não cria sala nem token", async () => {
  const daily = [];
  const handler = createRoomTokenHandler({ env: (n) => ({ DAILY_API_KEY: "k", DAILY_DOMAIN: "potala", ROOM_ALLOWED_ORIGINS: "https://app.invalid" })[n],
    issue: async () => ({ error: { code: "P0001" } }), daily: async (...a) => { daily.push(a); return { status: 200, json: {} }; } });
  const r = await handler(new Request("https://f.invalid/x", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer jwt" }, body: JSON.stringify({ request_id: ID }) }));
  assert.equal(r.status, 409); assert.equal(daily.length, 0);
});

// ---- Tela / sessão ----
function sessao({ role = "professional", state = "open", encerrar }) {
  const log = [];
  const ui = new Proxy({ areaDoVideo: {} }, { get: (t, k) => (k in t ? t[k] : () => { log.push(String(k)); }) });
  const video = { entrar() {}, sair() { log.push("video.sair"); } };
  const s = criarSessaoSala({ requestId: ID, ui, video, criarChat: () => ({ iniciar: async () => {}, parar() {} }),
    api: { contexto: async () => ({ state, role }), encerrar } });
  return { s, log };
}

test("tela: provedor não confirmou => a revogação pendente fica visível e repetível, nunca 'concluída'", async () => {
  const { s, log } = sessao({ encerrar: async () => ({ closed: true, revoked: false }) });
  await s.carregar();
  assert.equal(await s.encerrar(), true);
  assert.ok(log.includes("oferecerRevogacao"));
  assert.ok(!log.includes("revogacaoConcluida"));
});

test("tela: confirmação do provedor encerra sem pendência; a repetição conclui e some a oferta", async () => {
  const respostas = [{ closed: true, revoked: false }, { closed: true, revoked: true }];
  const { s, log } = sessao({ encerrar: async () => respostas.shift() });
  await s.carregar(); await s.encerrar();
  assert.equal(await s.revogar(), true);
  assert.ok(log.includes("revogacaoConcluida"));
  const ok = sessao({ encerrar: async () => ({ closed: true, revoked: true }) });
  await ok.s.carregar(); await ok.s.encerrar();
  assert.ok(!ok.log.includes("oferecerRevogacao"));
});

test("tela: falha de rede na repetição mantém a oferta; sala já encerrada reaberta pelo profissional oferece revogar", async () => {
  const { s, log } = sessao({ state: "closed", encerrar: async () => { throw new Error("rede"); } });
  await s.carregar();
  assert.ok(log.includes("oferecerRevogacao"), "profissional vê a oferta ao abrir sala encerrada");
  log.length = 0;
  assert.equal(await s.revogar(), false);
  assert.ok(log.includes("oferecerRevogacao"));
});

test("tela: cliente não vê nem consegue acionar a revogação", async () => {
  let chamadas = 0;
  const { s, log } = sessao({ role: "client", state: "closed", encerrar: async () => { chamadas++; return { revoked: true }; } });
  await s.carregar();
  assert.ok(!log.includes("oferecerRevogacao"));
  assert.equal(await s.revogar(), false); assert.equal(await s.encerrar(), false);
  assert.equal(chamadas, 0);
});

test("o front chama a função de borda com o JWT da sessão, sem enviar chave do provedor", async () => {
  const visto = [];
  const api = criarApiDaSala({ client: { auth: { getSession: async () => ({ data: { session: { access_token: "jwt" } } }) } },
    config: { url: "https://x.supabase.co/", publishableKey: "pk" },
    fetchImpl: async (url, init) => { visto.push([url, init.headers.Authorization, init.body]); return new Response('{"closed":true,"revoked":true}', { status: 200 }); } });
  await api.encerrar(ID);
  assert.equal(visto[0][0], "https://x.supabase.co/functions/v1/close-appointment-room");
  assert.equal(visto[0][1], "Bearer jwt");
  assert.deepEqual(JSON.parse(visto[0][2]), { request_id: ID });
});
