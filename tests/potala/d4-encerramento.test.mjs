import assert from "node:assert/strict";
import test from "node:test";
import { createCloseRoomHandler } from "../../supabase/functions/close-appointment-room/handler.ts";
import { criarApiDaSala } from "../../outputs/js/sala/sessao-sala.js";

const ID = "11111111-2222-4333-8444-555555555555";
const SALA = "potala-0123456789abcdef0123456789abcdef";

function borda(over = {}) {
  const c = { daily: [], close: 0, lookup: 0 };
  const env = (n) => ({ DAILY_API_KEY: "segredo-ficticio", ROOM_ALLOWED_ORIGINS: "https://app.invalid", ...over.env })[n];
  const handler = createCloseRoomHandler({ env,
    close: async (jwt) => { c.close++; c.jwt = jwt; return over.close ?? { data: { closed: true } }; },
    lookup: async () => { c.lookup++; return over.lookup === undefined ? { room_name: SALA, user_ids: ["u1", "u2"] } : over.lookup; },
    daily: async (m, p, b) => { c.daily.push([m, p, b]); return over.daily ? over.daily(m, p) : { status: 200, json: {} }; } });
  const req = (body = { request_id: ID }, headers = {}, method = "POST") => new Request("https://f.invalid/x", { method,
    headers: { "Content-Type": "application/json", Origin: "https://app.invalid", Authorization: "Bearer jwt", ...headers },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
  return { handler, c, req };
}

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

test("encerrar: o banco nega => 403 e o provedor nunca é chamado", async () => {
  const b = borda({ close: { error: { code: "42501" } } });
  assert.equal((await b.handler(b.req())).status, 403);
  assert.equal(b.c.lookup, 0); assert.equal(b.c.daily.length, 0);
});

test("encerrar: autorizado expulsa e bane os participantes registrados e apaga a sala", async () => {
  const b = borda();
  const r = await b.handler(b.req());
  assert.deepEqual(await r.json(), { closed: true, revoked: true });
  assert.equal(b.c.jwt, "jwt");
  assert.deepEqual(b.c.daily[0], ["POST", `/rooms/${SALA}/eject`, { user_ids: ["u1", "u2"], ban: true }]);
  assert.deepEqual(b.c.daily[1], ["DELETE", `/rooms/${SALA}`, undefined]);
});

test("encerrar: falha do provedor não desfaz o fechamento no banco e sinaliza revogação pendente, sem vazar detalhe", async () => {
  const b = borda({ daily: () => ({ status: 500, json: { error: "segredo-ficticio" } }) });
  const r = await b.handler(b.req());
  const texto = await r.text();
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(texto), { closed: true, revoked: false });
  assert.ok(!texto.includes("segredo"));
});

test("encerrar: sala inexistente no provedor (404) conta como revogada; sem sessão não há o que revogar", async () => {
  const a = borda({ daily: () => ({ status: 404, json: {} }) });
  assert.equal((await (await a.handler(a.req())).json()).revoked, true);
  const s = borda({ lookup: null });
  assert.deepEqual(await (await s.handler(s.req())).json(), { closed: true, revoked: true });
  assert.equal(s.c.daily.length, 0);
});

test("encerrar: o front chama a função de borda com o JWT da sessão", async () => {
  const visto = [];
  const api = criarApiDaSala({ client: { auth: { getSession: async () => ({ data: { session: { access_token: "jwt" } } }) } },
    config: { url: "https://x.supabase.co/", publishableKey: "pk" },
    fetchImpl: async (url, init) => { visto.push([url, init.headers.Authorization, init.body]); return new Response('{"closed":true,"revoked":true}', { status: 200 }); } });
  await api.encerrar(ID);
  assert.equal(visto[0][0], "https://x.supabase.co/functions/v1/close-appointment-room");
  assert.equal(visto[0][1], "Bearer jwt");
  assert.deepEqual(JSON.parse(visto[0][2]), { request_id: ID });
});
