// Credencial propria do varredor (x-sweeper-secret): segredo dedicado, nunca a service_role.
import assert from "node:assert/strict";
import test from "node:test";
import { credencialDoVarredor } from "../../supabase/functions/_shared/credencial-varredor.ts";
import { createSweepHandler } from "../../supabase/functions/sweep-appointment-rooms/handler.ts";
import { envPadrao, modeloLiveKit } from "./d4-livekit-modelo.mjs";

const SEGREDO = "varredor-FICTICIO-0123456789abcdef-0123456789";
const env = (extra = {}) => (n) => ({ SWEEPER_SECRET: SEGREDO, SUPABASE_SERVICE_ROLE_KEY: "eyJ-service-ficticia-0123456789.abc.def", ...extra })[n];
const req = (h = {}) => new Request("https://f.invalid/x", { method: "POST", headers: h });

test("varredor: aceita somente o segredo dedicado no cabecalho x-sweeper-secret", () => {
  assert.equal(credencialDoVarredor(env(), req({ "x-sweeper-secret": SEGREDO })), true);
  for (const h of [{}, { "x-sweeper-secret": "" }, { "x-sweeper-secret": SEGREDO + "x" }, { "x-sweeper-secret": SEGREDO.slice(1) }, { "x-sweeper-secret": SEGREDO.toUpperCase() },
    { apikey: SEGREDO }, { authorization: `Bearer ${SEGREDO}` },
    { apikey: "eyJ-service-ficticia-0123456789.abc.def", authorization: "Bearer eyJ-service-ficticia-0123456789.abc.def" }, { authorization: "Bearer eyJ-jwt-de-usuario.abc.def" }]) {
    assert.equal(credencialDoVarredor(env(), req(h)), false, JSON.stringify(h));
  }
});

test("varredor: falha fechado sem segredo configurado ou com segredo curto", () => {
  assert.equal(credencialDoVarredor(env({ SWEEPER_SECRET: undefined }), req({ "x-sweeper-secret": "" })), false);
  assert.equal(credencialDoVarredor(env({ SWEEPER_SECRET: "curto" }), req({ "x-sweeper-secret": "curto" })), false);
});

test("varredor + segredo dedicado: sem credencial => 401 antes de ler a fila ou tocar o LiveKit; com credencial => 200", async () => {
  const { m, lk } = modeloLiveKit(); let leituras = 0;
  const h = createSweepHandler({ env: envPadrao(), autorizado: (r) => credencialDoVarredor(env(), r), lk, marcar: async () => {}, pendentes: async () => { leituras++; return []; } });
  const chamar = (headers, method = "POST") => h(new Request("https://f.invalid/x", { method, headers }));
  for (const headers of [{}, { "x-sweeper-secret": "errado" }, { apikey: SEGREDO }]) { const r = await chamar(headers); assert.equal(r.status, 401); assert.ok(!(await r.text()).includes(SEGREDO)); }
  assert.equal(leituras, 0); assert.equal(m.chamadas.length, 0);
  assert.equal((await chamar({ "x-sweeper-secret": SEGREDO })).status, 200); assert.equal(leituras, 1);
  assert.equal((await chamar({ "x-sweeper-secret": SEGREDO }, "GET")).status, 405);
});
