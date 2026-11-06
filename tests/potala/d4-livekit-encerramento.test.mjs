// Encerramento e revogaÃ§Ã£o com LiveKit (modelo local). O efeito real no LiveKit Cloud
// (remoÃ§Ã£o de conectados, auto-create, tokens antigos) exige a homologaÃ§Ã£o real.
import assert from "node:assert/strict";
import test from "node:test";
import { createCloseRoomHandler } from "../../supabase/functions/close-appointment-room/handler.ts";
import { createRoomTokenHandler } from "../../supabase/functions/issue-appointment-room-token/handler.ts";
import { credencialDeServico } from "../../supabase/functions/_shared/credencial-servico.ts";
import { createSweepHandler } from "../../supabase/functions/sweep-appointment-rooms/handler.ts";
import { JANELA_VARREDURA_MS, TTL_TOKEN_SEGUNDOS, revogarSala } from "../../supabase/functions/_shared/livekit-revoke.ts";
import { criarApiDaSala, criarSessaoSala } from "../../outputs/js/sala/sessao-sala.js";
import { ID, SALA, barreira, envPadrao, modeloLiveKit, mundo, pedido } from "./d4-livekit-modelo.mjs";

function borda(over = {}) {
  const { m, lk } = modeloLiveKit();
  if (over.sala !== false) m.salas.set(SALA, { max: 2, conectados: new Map([["u1", true], ["u2", true]]) });
  const c = { close: 0, lookup: 0, marcadas: [], tarefas: [] };
  const lkUsado = over.lk ? over.lk(lk, m) : lk;
  const handler = createCloseRoomHandler({ env: envPadrao(over.env), lk: lkUsado, esperar: () => Promise.resolve(),
    later: (t) => c.tarefas.push(t),
    close: async (jwt) => { c.close++; c.jwt = jwt; if (over.closeThrows) throw new Error("rede"); return over.close ?? { data: { closed: true } }; },
    lookup: async () => { c.lookup++; if (over.lookupThrows) throw new Error("lookup"); return over.lookup === undefined ? { session_id: "sess-1", provider: "livekit", room_name: SALA, user_ids: ["u1", "u2"] } : over.lookup; },
    marcar: async (id) => { c.marcadas.push(id); if (over.marcarThrows) throw new Error("x"); } });
  const req = (body = { request_id: ID }, headers = {}, method = "POST") => new Request("https://f.invalid/x", { method,
    headers: { "Content-Type": "application/json", Origin: "https://app.invalid", Authorization: "Bearer jwt", ...headers },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
  return { handler, c, m, req };
}
const corpo = async (r) => r.json();
const nomes = (m) => m.chamadas.map((x) => x[0]);

test("encerrar: pedido sem JWT, mal formado ou com mÃ©todo errado nÃ£o chega ao banco nem ao LiveKit", async () => {
  const b = borda();
  assert.equal((await b.handler(b.req(undefined, { Authorization: "" }))).status, 401);
  assert.equal((await b.handler(b.req({ request_id: ID, x: 1 }))).status, 400);
  assert.equal((await b.handler(b.req(undefined, {}, "GET"))).status, 405);
  const pre = await b.handler(b.req(undefined, {}, "OPTIONS"));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), "https://app.invalid");
  assert.equal(b.c.close, 0); assert.equal(b.m.chamadas.length, 0);
});

test("encerramento normal: remove cada participante conhecido, apaga a sala, CONFIRMA que ela nÃ£o existe e marca a sessÃ£o", async () => {
  const b = borda();
  assert.deepEqual(await corpo(await b.handler(b.req())), { closed: true, revoked: true });
  assert.equal(b.c.jwt, "jwt");
  assert.deepEqual(nomes(b.m).slice(0, 4), ["removeParticipant", "removeParticipant", "deleteRoom", "findRoom"]);
  assert.deepEqual(b.m.conectados(SALA), []); assert.equal(b.m.salas.has(SALA), false);
  assert.deepEqual(b.c.marcadas, ["sess-1"]);
});

test("participante nÃ£o autorizado: banco nega => 403, sem leitura de sala nem chamada ao LiveKit", async () => {
  const b = borda({ close: { error: { code: "42501" } } });
  assert.equal((await b.handler(b.req())).status, 403);
  assert.equal(b.c.lookup, 0); assert.equal(b.m.chamadas.length, 0);
});

test("banco indisponÃ­vel ou erro inesperado => 502 e o LiveKit nÃ£o Ã© chamado", async () => {
  for (const o of [{ closeThrows: true }, { close: { error: { code: "500" } } }, { close: { data: null } }]) {
    const b = borda(o);
    assert.equal((await b.handler(b.req())).status, 502);
    assert.equal(b.m.chamadas.length, 0);
  }
});

test("LiveKit indisponÃ­vel (5xx), recusando credencial (401) ou lento (exceÃ§Ã£o) nunca vira sucesso nem vaza segredo", async () => {
  for (const falha of [{ status: 503 }, { status: 401 }, "throw"]) {
    const b = borda({ lk: (lk) => ({ ...lk,
      removeParticipant: async () => { if (falha === "throw") throw new Error("segredoficticio0123456789"); return falha; },
      deleteRoom: async () => { if (falha === "throw") throw new Error("segredoficticio0123456789"); return falha; } }) });
    const texto = await (await b.handler(b.req())).text();
    assert.deepEqual(JSON.parse(texto), { closed: true, revoked: false });
    assert.ok(!texto.includes("segredo"));
    assert.equal(b.c.marcadas.length, 0, "nÃ£o marca como revogada");
  }
});

test("sala que continua existindo depois do delete (reentrada com token ainda vÃ¡lido) NÃƒO conta como revogada", async () => {
  const b = borda({ lk: (lk) => ({ ...lk, findRoom: async () => ({ status: 200 }) }) });
  assert.equal((await corpo(await b.handler(b.req()))).revoked, false);
  assert.deepEqual(b.c.marcadas, []);
});

test("falha parcial: remoÃ§Ã£o falha mas o delete Ã© tentado e a verificaÃ§Ã£o decide; a repetiÃ§Ã£o conclui sem reabrir nada", async () => {
  let falha = true;
  const b = borda({ lk: (lk) => ({ ...lk, removeParticipant: async (r, i) => (falha ? { status: 500 } : lk.removeParticipant(r, i)) }) });
  assert.equal((await corpo(await b.handler(b.req()))).revoked, false);
  assert.ok(nomes(b.m).includes("deleteRoom"));
  falha = false;
  assert.deepEqual(await corpo(await b.handler(b.req())), { closed: true, revoked: true });
  assert.equal(b.c.close, 2, "o banco Ã© consultado de novo e aceita o profissional numa sala encerrada");
});

test("requisiÃ§Ã£o duplicada: duas chamadas simultÃ¢neas dÃ£o o mesmo resultado", async () => {
  const b = borda();
  const [r1, r2] = await Promise.all([b.handler(b.req()), b.handler(b.req())]);
  assert.deepEqual(await corpo(r1), { closed: true, revoked: true });
  assert.deepEqual(await corpo(r2), { closed: true, revoked: true });
});

test("sala jÃ¡ ausente no LiveKit (404) Ã© sucesso; sem sessÃ£o no banco nÃ£o hÃ¡ o que revogar", async () => {
  const a = borda({ sala: false });
  assert.equal((await corpo(await a.handler(a.req()))).revoked, true);
  const s = borda({ lookup: null });
  assert.deepEqual(await corpo(await s.handler(s.req())), { closed: true, revoked: true });
  assert.equal(s.m.chamadas.length, 0);
});

test("leitura da sala falha: revogaÃ§Ã£o NÃƒO Ã© dada como feita e o LiveKit nÃ£o Ã© chamado; sem credenciais: pendente", async () => {
  const b = borda({ lookupThrows: true });
  assert.deepEqual(await corpo(await b.handler(b.req())), { closed: true, revoked: false });
  assert.equal(b.m.chamadas.length, 0);
  for (const env of [{ LIVEKIT_API_KEY: "" }, { LIVEKIT_API_SECRET: "" }]) {
    const c = borda({ env });
    assert.equal((await corpo(await c.handler(c.req()))).revoked, false);
    assert.equal(c.m.chamadas.length, 0);
  }
});

test("histÃ³rico Daily: sessÃ£o antiga sÃ³ fecha no banco, nÃ£o chama o LiveKit e nÃ£o Ã© marcada", async () => {
  const b = borda({ lookup: { session_id: "d1", provider: "daily", room_name: SALA, user_ids: ["u1"] } });
  assert.deepEqual(await corpo(await b.handler(b.req())), { closed: true, revoked: true });
  assert.equal(b.m.chamadas.length, 0); assert.deepEqual(b.c.marcadas, []); assert.equal(b.c.tarefas.length, 0);
});

test("falha ao marcar a sessÃ£o nÃ£o muda a resposta (o varredor repete)", async () => {
  const b = borda({ marcarThrows: true });
  assert.deepEqual(await corpo(await b.handler(b.req())), { closed: true, revoked: true });
});

test("nada foi aberto (closed:false): nÃ£o hÃ¡ o que revogar", async () => {
  const b = borda({ close: { data: { closed: false } } });
  assert.deepEqual(await corpo(await b.handler(b.req())), { closed: false, revoked: true });
  assert.equal(b.m.chamadas.length, 0);
});

test("token antigo apÃ³s o encerramento: o banco nega nova emissÃ£o e o LiveKit nÃ£o cria sala nem token", async () => {
  const { m, lk } = modeloLiveKit();
  const h = createRoomTokenHandler({ env: envPadrao(), lk, context: async () => ({}), issue: async () => ({ error: { code: "P0001" } }) });
  assert.equal((await h(pedido())).status, 409);
  assert.equal(m.chamadas.length, 0);
});

// ---- Token antigo: o que o LiveKit NÃƒO revoga, e o que fazemos a respeito ----
test("[MODELO] token ainda vÃ¡lido recria a sala depois do delete: revogaÃ§Ã£o detecta, apaga de novo e a varredura final fecha a janela", async () => {
  const m = mundo();
  const r = await m.emitir();
  const token = (await r.json()).token;
  assert.equal(m.m.entrar(token).ok, true);
  assert.deepEqual(await (await m.encerrar()).json(), { closed: true, revoked: true });
  assert.equal(m.m.salas.has(SALA), false, "sala apagada e conectados fora");
  // O LiveKit nÃ£o invalida o JWT: dentro do TTL o dono do token entra e recria a sala.
  assert.equal(m.m.entrar(token).ok, true, "limite honesto: token vÃ¡lido recria a sala (premissa do modelo)");
  assert.equal(await revogarSala(m.lk, SALA, ["u1", "u2"]), true, "uma nova revogaÃ§Ã£o apaga a sala recriada");
  assert.equal(m.m.salas.has(SALA), false);
  // Depois do TTL o mesmo token nÃ£o entra mais.
  m.m.agora += TTL_TOKEN_SEGUNDOS + 1;
  assert.equal(m.m.entrar(token).motivo, "expirado");
  assert.equal(m.m.salas.has(SALA), false);
});

test("[SEGURANÃ‡A] o encerramento agenda a varredura final depois da janela do token e ela apaga quem reentrou", async () => {
  const esperas = [];
  const m = mundo({ esperar: (ms) => { esperas.push(ms); return Promise.resolve(); } });
  const token = (await (await m.emitir()).json()).token;
  await m.encerrar();
  assert.equal(m.m.entrar(token).ok, true, "reentrada com token ainda vÃ¡lido");
  await m.w.tarefas.at(-1);
  assert.ok(esperas.includes(JANELA_VARREDURA_MS), "espera a janela do token (TTL + margem)");
  assert.ok(JANELA_VARREDURA_MS > TTL_TOKEN_SEGUNDOS * 1000);
  assert.equal(m.m.salas.has(SALA), false, "a varredura final removeu a sala recriada");
  assert.deepEqual(m.w.marcadas.at(-1), "sess-1");
});

test("[SEGURANÃ‡A] token curto: expira em no mÃ¡ximo TTL_TOKEN_SEGUNDOS, mesmo com consulta longa", async () => {
  const m = mundo();
  await m.emitir();
  assert.equal(m.m.chamadas.find((c) => c[0] === "token")[3], TTL_TOKEN_SEGUNDOS);
  assert.ok(TTL_TOKEN_SEGUNDOS <= 120);
});

// ---- Varredor de expiraÃ§Ã£o ----
function varredor(fila, over = {}) {
  const { m, lk } = modeloLiveKit();
  for (const s of fila) m.salas.set(s.room_name, { max: 2, conectados: new Map(s.user_ids.map((u) => [u, true])) });
  const marcadas = [];
  const ambiente = envPadrao({ SUPABASE_SERVICE_ROLE_KEY: "chave-de-servico-ficticia", ...over.env });
  const h = createSweepHandler({ env: ambiente, autorizado: (r) => credencialDeServico(ambiente, r), lk,
    pendentes: async () => { if (over.leituraFalha) throw new Error("x"); return fila; },
    marcar: async (id) => { if (over.marcarFalha) throw new Error("x"); marcadas.push(id); } });
  const req = (auth = "Bearer chave-de-servico-ficticia", method = "POST") => new Request("https://f.invalid/x", { method, headers: { Authorization: auth } });
  return { h, m, marcadas, req };
}
const sala = (n) => ({ session_id: `s${n}`, room_name: `potala-${String(n).padStart(32, "0")}`, user_ids: ["u1", "u2"] });

test("varredor: sÃ³ a chave de serviÃ§o chama; usuÃ¡rio, token errado, sem cabeÃ§alho e mÃ©todo errado sÃ£o recusados sem tocar no LiveKit", async () => {
  const v = varredor([sala(1)]);
  for (const auth of ["", "Bearer jwt-de-usuario", "Bearer chave-de-servico-ficticia-x", "Basic abc"]) assert.equal((await v.h(v.req(auth))).status, 401);
  assert.equal((await v.h(v.req(undefined, "GET"))).status, 405);
  assert.equal(v.m.chamadas.length, 0);
});

test("varredor: encerra as salas vencidas, desconecta quem restou, confirma a ausÃªncia e marca; resposta sÃ³ traz contagens", async () => {
  const fila = [sala(1), sala(2)];
  const v = varredor(fila);
  v.m.salas.get(fila[0].room_name).conectados.set("u1", true); // consulta vencida com gente conectada
  const r = await v.h(v.req()); const t = await r.text();
  assert.deepEqual(JSON.parse(t), { processadas: 2, revogadas: 2, pendentes: 0 });
  assert.equal(v.m.salas.size, 0); assert.deepEqual(v.marcadas, ["s1", "s2"]);
  assert.ok(!/livekit|segredo|chave/i.test(t));
});

test("varredor: falha do LiveKit deixa pendente (nÃ£o marca) e a prÃ³xima rodada conclui; leitura falha => 502; sem credenciais => 503", async () => {
  const v = varredor([sala(1)]); v.m.down = true;
  assert.deepEqual(await (await v.h(v.req())).json(), { processadas: 1, revogadas: 0, pendentes: 1 });
  assert.deepEqual(v.marcadas, []);
  v.m.down = false;
  assert.deepEqual(await (await v.h(v.req())).json(), { processadas: 1, revogadas: 1, pendentes: 0 });
  const l = varredor([sala(1)], { leituraFalha: true });
  assert.equal((await l.h(l.req())).status, 502);
  const s = varredor([sala(1)], { env: { LIVEKIT_API_SECRET: "" } });
  assert.equal((await s.h(s.req())).status, 503);
  const f = varredor([sala(1)], { marcarFalha: true });
  assert.deepEqual(await (await f.h(f.req())).json(), { processadas: 1, revogadas: 0, pendentes: 1 });
});

// ---- Tela / sessÃ£o ----
function sessao({ role = "professional", state = "open", encerrar, emitir, esperar }) {
  const log = [], entradas = [];
  const ui = new Proxy({ areaDoVideo: {} }, { get: (t, k) => (k in t ? t[k] : () => { log.push(String(k)); }) });
  const video = { entrar(a, dados, ganchos) { entradas.push({ dados, ganchos }); }, sair() { log.push("video.sair"); } };
  const s = criarSessaoSala({ requestId: ID, ui, video, esperar: esperar ?? (() => Promise.resolve()), criarChat: () => ({ iniciar: async () => {}, parar() {} }),
    api: { contexto: async () => ({ state, role }), encerrar, emitir } });
  return { s, log, entradas };
}

test("tela: provedor nÃ£o confirmou => a revogaÃ§Ã£o pendente fica visÃ­vel e repetÃ­vel, nunca 'concluÃ­da'", async () => {
  const { s, log } = sessao({ encerrar: async () => ({ closed: true, revoked: false }) });
  await s.carregar();
  assert.equal(await s.encerrar(), true);
  assert.ok(log.includes("oferecerRevogacao")); assert.ok(!log.includes("revogacaoConcluida"));
});

test("tela: confirmaÃ§Ã£o encerra sem pendÃªncia; a repetiÃ§Ã£o conclui e some a oferta", async () => {
  const respostas = [{ closed: true, revoked: false }, { closed: true, revoked: true }];
  const { s, log } = sessao({ encerrar: async () => respostas.shift() });
  await s.carregar(); await s.encerrar();
  assert.equal(await s.revogar(), true);
  assert.ok(log.includes("revogacaoConcluida"));
  const ok = sessao({ encerrar: async () => ({ closed: true, revoked: true }) });
  await ok.s.carregar(); await ok.s.encerrar();
  assert.ok(!ok.log.includes("oferecerRevogacao"));
});

test("tela: falha de rede na repetiÃ§Ã£o mantÃ©m a oferta; sala jÃ¡ encerrada reaberta pelo profissional oferece revogar", async () => {
  const { s, log } = sessao({ state: "closed", encerrar: async () => { throw new Error("rede"); } });
  await s.carregar();
  assert.ok(log.includes("oferecerRevogacao"));
  log.length = 0;
  assert.equal(await s.revogar(), false);
  assert.ok(log.includes("oferecerRevogacao"));
});

test("tela: cliente nÃ£o vÃª nem consegue acionar a revogaÃ§Ã£o", async () => {
  let chamadas = 0;
  const { s, log } = sessao({ role: "client", state: "closed", encerrar: async () => { chamadas++; return { revoked: true }; } });
  await s.carregar();
  assert.ok(!log.includes("oferecerRevogacao"));
  assert.equal(await s.revogar(), false); assert.equal(await s.encerrar(), false);
  assert.equal(chamadas, 0);
});

test("o front chama a funÃ§Ã£o de borda com o JWT da sessÃ£o, sem enviar chave nem segredo do provedor", async () => {
  const visto = [];
  const api = criarApiDaSala({ client: { auth: { getSession: async () => ({ data: { session: { access_token: "jwt" } } }) } },
    config: { url: "https://x.supabase.co/", publishableKey: "pk" },
    fetchImpl: async (url, init) => { visto.push([url, init.headers.Authorization, init.body]); return new Response('{"closed":true,"revoked":true}', { status: 200 }); } });
  await api.encerrar(ID);
  assert.equal(visto[0][0], "https://x.supabase.co/functions/v1/close-appointment-room");
  assert.equal(visto[0][1], "Bearer jwt");
  assert.deepEqual(JSON.parse(visto[0][2]), { request_id: ID });
});

// ---- ReconexÃ£o ----
const acessoOk = { url: "wss://x.livekit.cloud", token: "t2", expires_at: "2099-01-01T00:00:00Z" };
const entrarNaSala = async (x) => { await x.s.carregar(); await x.s.entrar(); };

test("reconexÃ£o: queda de rede pede token NOVO e entra de novo (nunca reaproveita o antigo)", async () => {
  let n = 0;
  const x = sessao({ emitir: async () => ({ ...acessoOk, token: `t${++n}` }) });
  await entrarNaSala(x);
  assert.equal(x.entradas[0].dados.token, "t1");
  await x.entradas[0].ganchos.aoDesconectar("rede");
  assert.equal(x.entradas.length, 2); assert.equal(x.entradas[1].dados.token, "t2");
});

test("reconexÃ£o: sala encerrada/vencida (409) ou acesso negado ao pedir token novo => sai como 'encerrada', sem insistir", async () => {
  for (const status of [409, 403, 401]) {
    let n = 0;
    const x = sessao({ emitir: async () => { if (++n === 1) return acessoOk; throw Object.assign(new Error("x"), { status }); } });
    await entrarNaSala(x);
    await x.entradas[0].ganchos.aoDesconectar("removida");
    assert.equal(x.entradas.length, 1, "nÃ£o reentra");
    assert.ok(x.log.includes("mostrarSaida"));
    assert.equal(n, 2);
  }
});

test("reconexÃ£o: falhas de rede repetidas tÃªm limite (3 tentativas) e terminam com saÃ­da, sem laÃ§o infinito", async () => {
  let n = 0;
  const x = sessao({ emitir: async () => { if (++n === 1) return acessoOk; throw Object.assign(new Error("x"), { status: 0, code: "network" }); } });
  await entrarNaSala(x);
  await x.entradas[0].ganchos.aoDesconectar("rede");
  assert.equal(n, 4, "1 emissÃ£o inicial + 3 tentativas");
  assert.ok(x.log.includes("mostrarSaida"));
});

test("reconexÃ£o: entrar em outro dispositivo (identidade duplicada) sai sem pedir token; falha de montagem tenta de novo", async () => {
  let n = 0;
  const x = sessao({ emitir: async () => { n++; return acessoOk; } });
  await entrarNaSala(x);
  await x.entradas[0].ganchos.aoDesconectar("duplicada");
  assert.equal(n, 1); assert.ok(x.log.includes("mostrarSaida"));
  const y = sessao({ emitir: async () => acessoOk });
  await entrarNaSala(y);
  await y.entradas[0].ganchos.aoFalhar();
  assert.equal(y.entradas.length, 2);
});

test("barreira auxiliar do modelo estÃ¡ disponÃ­vel (sanidade)", () => { assert.equal(typeof barreira().abrir, "function"); });
