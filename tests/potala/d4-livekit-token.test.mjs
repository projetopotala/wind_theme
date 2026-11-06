// Emissão de token LiveKit: claims REAIS gerados pelo SDK oficial (livekit-server-sdk, em node_modules)
// e verificados aqui; o resto usa o modelo de d4-livekit-modelo.mjs (sem rede).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import * as sdk from "livekit-server-sdk";
import { gerarToken } from "../../supabase/functions/_shared/livekit-token.ts";
import { TTL_TOKEN_SEGUNDOS, urlLiveKit } from "../../supabase/functions/_shared/livekit-revoke.ts";
import { createRoomTokenHandler } from "../../supabase/functions/issue-appointment-room-token/handler.ts";
import { ID, SALA, envPadrao, mundo, modeloLiveKit, pedido } from "./d4-livekit-modelo.mjs";

const KEY = "APIchaveficticia", SECRET = "segredoficticio0123456789";
const decodificar = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
const assinaturaOk = (jwt, segredo) => {
  const [h, p, s] = jwt.split(".");
  return crypto.createHmac("sha256", segredo).update(`${h}.${p}`).digest("base64url") === s;
};

test("token real do SDK: só entra na sala certa, com identidade do participante, validade curta e sem poderes de administração", async () => {
  const jwt = await gerarToken(sdk, KEY, SECRET, { room: SALA, identity: "user-1", name: "Cliente", ttlSeconds: 90 });
  const c = decodificar(jwt);
  assert.ok(assinaturaOk(jwt, SECRET), "assinado com o segredo");
  assert.ok(!assinaturaOk(jwt, "outro-segredo"));
  assert.equal(c.iss, KEY); assert.equal(c.sub, "user-1"); assert.equal(c.name, "Cliente");
  assert.equal(c.exp - c.nbf, 90, "validade de 90 s");
  assert.equal(c.video.room, SALA);
  assert.equal(c.video.roomJoin, true);
  assert.equal(c.video.canPublish, true); assert.equal(c.video.canSubscribe, true);
  assert.equal(c.video.canPublishData, false, "o chat é nosso: sem canal de dados do provedor");
  assert.deepEqual([...c.video.canPublishSources].sort(), ["camera", "microphone"], "sem compartilhar tela");
  for (const poder of ["roomAdmin", "roomCreate", "roomList", "roomRecord", "ingressAdmin", "hidden", "recorder", "canUpdateOwnMetadata"]) {
    assert.ok(!c.video[poder], `sem ${poder}`);
  }
  assert.ok(!JSON.stringify(c).includes(SECRET), "o segredo nunca vai no token");
});

test("handler: 200 com wss, token curto limitado ao fim da janela e sala criada com o nome certo (sem segredo na resposta)", async () => {
  const { m, lk } = modeloLiveKit();
  const h = createRoomTokenHandler({ env: envPadrao(), lk, context: async () => ({ data: { state: "open" } }),
    issue: async () => ({ data: { session_id: "s", room_name: SALA, provider: "livekit", role: "professional", expires_at: new Date(Date.now() + 3600e3).toISOString(), participant_id: "u9" } }) });
  const r = await h(pedido());
  const texto = await r.text();
  assert.equal(r.status, 200);
  const corpo = JSON.parse(texto);
  assert.equal(corpo.url, "wss://potala-lab.livekit.cloud");
  assert.equal(corpo.role, "professional");
  assert.ok(!/segredoficticio|APIchaveficticia/.test(texto));
  assert.deepEqual(m.chamadas.find((c) => c[0] === "createRoom"), ["createRoom", SALA]);
  const ttl = m.chamadas.find((c) => c[0] === "token")[3];
  assert.equal(ttl, TTL_TOKEN_SEGUNDOS);
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("o token nunca vive mais que a consulta: janela de 20 s => ttl de 20 s; janela já vencida => 409 sem tocar no LiveKit", async () => {
  const curto = mundo({ janelaMs: 20_000 });
  assert.equal((await curto.emitir()).status, 200);
  const ttl = curto.m.chamadas.find((c) => c[0] === "token")[3];
  assert.ok(ttl >= 19 && ttl <= 20, `ttl=${ttl}`);
  const vencida = mundo({ janelaMs: -1000 });
  assert.equal((await vencida.emitir()).status, 409);
  assert.equal(vencida.m.chamadas.length, 0);
});

test("limite de dois: a sala nasce com max 2 (parâmetro fixo no código) e a terceira identidade é recusada", async () => {
  const fonte = fs.readFileSync(new URL("../../supabase/functions/_shared/livekit-sdk.ts", import.meta.url), "utf8");
  assert.match(fonte, /maxParticipants: 2/);
  const w = mundo();
  await w.emitir();
  assert.equal(w.m.salas.get(SALA).max, 2);
  assert.equal(w.m.entrar(`tok|${SALA}|a|${w.m.agora + 90}`).ok, true);
  assert.equal(w.m.entrar(`tok|${SALA}|b|${w.m.agora + 90}`).ok, true);
  assert.equal(w.m.entrar(`tok|${SALA}|c|${w.m.agora + 90}`).motivo, "cheia");
  assert.equal(w.m.entrar(`tok|${SALA}|a|${w.m.agora + 90}`).ok, true, "a mesma identidade reentra (substitui a conexão)");
});

test("pedido inválido, sem JWT, método errado e CORS não chegam ao banco nem ao LiveKit", async () => {
  const w = mundo();
  const h = createRoomTokenHandler({ env: envPadrao(), lk: w.lk, issue: async () => { throw new Error("não deveria"); }, context: async () => ({}) });
  const base = { "Content-Type": "application/json", Origin: "https://app.invalid" };
  assert.equal((await h(new Request("https://f.invalid/x", { method: "POST", headers: base, body: "{}" }))).status, 401);
  assert.equal((await h(new Request("https://f.invalid/x", { method: "POST", headers: { ...base, Authorization: "Bearer j" }, body: JSON.stringify({ request_id: "x" }) }))).status, 400);
  assert.equal((await h(new Request("https://f.invalid/x", { method: "POST", headers: { ...base, Authorization: "Bearer j" }, body: JSON.stringify({ request_id: ID, extra: 1 }) }))).status, 400);
  assert.equal((await h(new Request("https://f.invalid/x", { method: "GET" }))).status, 405);
  const pre = await h(new Request("https://f.invalid/x", { method: "OPTIONS", headers: { Origin: "https://app.invalid" } }));
  assert.equal(pre.status, 204); assert.equal(pre.headers.get("access-control-allow-origin"), "https://app.invalid");
  const ruim = await h(new Request("https://f.invalid/x", { method: "OPTIONS", headers: { Origin: "https://evil.invalid" } }));
  assert.equal(ruim.headers.get("access-control-allow-origin"), null);
  assert.equal(w.m.chamadas.length, 0);
});

test("erros do banco viram 403/409/429/502 sem chamar o LiveKit", async () => {
  for (const [code, status] of [["42501", 403], ["P0001", 409], ["54000", 429], ["XX", 502]]) {
    const w = mundo();
    const h = createRoomTokenHandler({ env: envPadrao(), lk: w.lk, context: async () => ({}), issue: async () => ({ error: { code } }) });
    assert.equal((await h(pedido())).status, status);
    assert.equal(w.m.chamadas.length, 0);
  }
});

test("configuração ausente ou inválida => 503 (sem LiveKit): URL fora de livekit.cloud, sem chave ou sem segredo", async () => {
  for (const over of [{ LIVEKIT_URL: undefined }, { LIVEKIT_URL: "wss://evil.example.com" }, { LIVEKIT_URL: "ws://x.livekit.cloud" },
    { LIVEKIT_API_KEY: "" }, { LIVEKIT_API_SECRET: undefined }]) {
    const w = mundo({ env: over });
    assert.equal((await w.emitir()).status, 503, JSON.stringify(over));
    assert.equal(w.m.chamadas.length, 0);
  }
  assert.equal(urlLiveKit(' "https://abc.livekit.cloud/" '), "wss://abc.livekit.cloud");
  assert.equal(urlLiveKit("wss://abc.livekit.cloud.evil.com"), null);
});

test("sessão antiga do Daily nunca vira sala LiveKit (409, sem sala, sem token)", async () => {
  const w = mundo({ provider: "daily" });
  const r = await w.emitir();
  assert.equal(r.status, 409);
  assert.equal(w.m.chamadas.length, 0);
});

test("falha do LiveKit na criação ou no token => 502 com diagnóstico seguro (passo e status), sem segredo", async () => {
  const w = mundo(); w.m.criacaoDown = true;
  const r = await w.emitir(); const t = await r.text();
  assert.equal(r.status, 502);
  assert.deepEqual(JSON.parse(t), { message: "Não foi possível abrir a sala.", step: "room", provider_status: 503 });
  const w2 = mundo(); w2.lk.token = async () => { throw new Error("segredoficticio0123456789"); };
  const r2 = await w2.emitir(); const t2 = await r2.text();
  assert.equal(r2.status, 502); assert.ok(!/segredo/.test(t2));
  assert.equal(JSON.parse(t2).step, "token");
});
