// Credencial de serviço do varredor e revogação de token no LiveKit Cloud (revokeTokenTs).
import assert from "node:assert/strict";
import test from "node:test";
import * as sdk from "livekit-server-sdk";
import { credencialDeServico } from "../../supabase/functions/_shared/credencial-servico.ts";
import { opcoesDeRevogacao } from "../../supabase/functions/_shared/livekit-token.ts";
import { createSweepHandler } from "../../supabase/functions/sweep-appointment-rooms/handler.ts";
import { envPadrao, modeloLiveKit } from "./d4-livekit-modelo.mjs";

const SECRETA = "sb_secret_FICTICIA_0123456789abcdef";
const OUTRA = "sb_secret_OUTRA_FICTICIA_0123456789";
const LEGADA = "eyJ-legada-ficticia-0123456789.abc.def";
const env = (extra = {}) => (n) => ({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRETA, automacao: OUTRA }), SUPABASE_SERVICE_ROLE_KEY: LEGADA,
  SUPABASE_ANON_KEY: "eyJ-anon-ficticia-0123456789.abc.def", ...extra })[n];
const req = (h = {}) => new Request("https://f.invalid/x", { method: "POST", headers: h });

test("credencial: chave secreta no apikey (padrão do pg_net), no Bearer e a chave legada são aceitas", () => {
  assert.equal(credencialDeServico(env(), req({ apikey: SECRETA })), true);
  assert.equal(credencialDeServico(env(), req({ apikey: OUTRA })), true, "chave nomeada do projeto");
  assert.equal(credencialDeServico(env(), req({ authorization: `Bearer ${SECRETA}` })), true);
  assert.equal(credencialDeServico(env(), req({ authorization: `Bearer ${LEGADA}` })), true);
  assert.equal(credencialDeServico(env(), req({ apikey: LEGADA })), true);
});

test("credencial: sem cabeçalho, vazia, parecida, anon, publicável e JWT de usuário são recusados", () => {
  const recusadas = [{}, { apikey: "" }, { authorization: "Bearer " }, { apikey: SECRETA + "x" }, { apikey: SECRETA.slice(0, -1) },
    { apikey: SECRETA.toUpperCase() }, { authorization: `Basic ${SECRETA}` }, { apikey: "eyJ-anon-ficticia-0123456789.abc.def" },
    { apikey: "sb_publishable_FICTICIA_0123456789ab" }, { authorization: "Bearer eyJ-jwt-de-usuario.abc.def" }, { apikey: "a", authorization: "Bearer b" }];
  for (const h of recusadas) assert.equal(credencialDeServico(env(), req(h)), false, JSON.stringify(h));
});

test("credencial: falha fechado quando não há chave configurada, JSON inválido ou chave curta demais", () => {
  const sem = env({ SUPABASE_SECRET_KEYS: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined });
  assert.equal(credencialDeServico(sem, req({ apikey: SECRETA })), false);
  assert.equal(credencialDeServico(sem, req({ apikey: "" })), false);
  const lixo = env({ SUPABASE_SECRET_KEYS: "{não é json", SUPABASE_SERVICE_ROLE_KEY: undefined });
  assert.equal(credencialDeServico(lixo, req({ apikey: SECRETA })), false);
  const curta = env({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: "x" }), SUPABASE_SERVICE_ROLE_KEY: "" });
  assert.equal(credencialDeServico(curta, req({ apikey: "x" })), false);
});

test("varredor + credencial: sem credencial ou inválida => 401 antes de ler a fila ou tocar o LiveKit; com credencial => 200", async () => {
  const { m, lk } = modeloLiveKit();
  let leituras = 0;
  const h = createSweepHandler({ env: envPadrao(), autorizado: (r) => credencialDeServico(env(), r), lk, marcar: async () => {},
    pendentes: async () => { leituras++; return []; } });
  const chamar = (headers) => h(new Request("https://f.invalid/x", { method: "POST", headers }));
  for (const headers of [{}, { apikey: "invalida" }, { authorization: "Bearer eyJ-jwt-de-usuario.abc.def" }, { apikey: "eyJ-anon-ficticia-0123456789.abc.def" }]) {
    const r = await chamar(headers);
    assert.equal(r.status, 401); assert.ok(!(await r.text()).match(/sb_secret|eyJ/));
  }
  assert.equal(leituras, 0); assert.equal(m.chamadas.length, 0);
  assert.equal((await chamar({ apikey: SECRETA })).status, 200);
  assert.equal(leituras, 1);
  assert.equal((await h(new Request("https://f.invalid/x", { method: "GET", headers: { apikey: SECRETA } }))).status, 405);
});

test("revogação: o cliente OFICIAL do SDK envia revokeTokenTs a ≤ 60 s do relógio, e mesmo para quem já saiu a chamada é a mesma", async () => {
  const agora = Math.floor(Date.now() / 1000);
  const opc = opcoesDeRevogacao(agora);
  assert.equal(opc.revokeTokenTs, BigInt(agora + 5));
  const visto = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { visto.push({ url: String(url), corpo: JSON.parse(init.body) }); return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }); };
  try {
    const cliente = new sdk.RoomServiceClient("https://x.livekit.cloud", "APIficticia", "segredo-ficticio-0123456789abcdef");
    await cliente.removeParticipant("potala-" + "a".repeat(32), "u1", opc);
  } finally { globalThis.fetch = original; }
  assert.match(visto[0].url, /RoomService\/RemoveParticipant$/);
  assert.equal(visto[0].corpo.room, "potala-" + "a".repeat(32)); assert.equal(visto[0].corpo.identity, "u1");
  const ts = Number(visto[0].corpo.revokeTokenTs);
  assert.ok(Math.abs(ts - agora) <= 60 && ts > agora, `revokeTokenTs=${ts}`);
});

test("revogação: o código de produção chama RemoveParticipant com revokeTokenTs ANTES de apagar a sala (não depende só do DeleteRoom)", async () => {
  const fs = await import("node:fs");
  const fonte = fs.readFileSync(new URL("../../supabase/functions/_shared/livekit-sdk.ts", import.meta.url), "utf8");
  assert.match(fonte, /removeParticipant\(room, identity, opcoesDeRevogacao\(\)\)/);
  const rev = fs.readFileSync(new URL("../../supabase/functions/_shared/livekit-revoke.ts", import.meta.url), "utf8");
  assert.ok(rev.indexOf("lk.removeParticipant") < rev.indexOf("lk.deleteRoom"), "remoção/revogação antes do delete");
});
