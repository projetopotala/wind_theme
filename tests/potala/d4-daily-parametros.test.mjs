// Parâmetros enviados ao Daily: provam o que o nosso código pede (o efeito real no provedor exige homologação).
import assert from "node:assert/strict";
import test from "node:test";
import { createRoomTokenHandler } from "../../supabase/functions/issue-appointment-room-token/handler.ts";

const ID = "11111111-2222-4333-8444-555555555555";
const SALA = "potala-0123456789abcdef0123456789abcdef";

async function emitir(expiraEm) {
  const chamadas = [];
  const handler = createRoomTokenHandler({
    env: (n) => ({ DAILY_API_KEY: "k", DAILY_DOMAIN: "potala", ROOM_ALLOWED_ORIGINS: "https://app.invalid" })[n],
    issue: async () => ({ data: { session_id: "s", room_name: SALA, provider: "daily", role: "professional", expires_at: expiraEm, participant_id: "u9" } }),
    context: async () => ({ data: { state: "open" } }),
    daily: async (path, body, method = "POST") => { chamadas.push({ path, body, method }); return { status: 200, json: { token: "tok" } }; } });
  const r = await handler(new Request("https://f.invalid/x", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer jwt" }, body: JSON.stringify({ request_id: ID }) }));
  return { r, chamadas };
}

test("sala e token expiram exatamente no fim da janela (segundos Unix) e ejetam ao expirar", async () => {
  const fim = new Date(Date.now() + 90 * 60000); fim.setMilliseconds(0);
  const esperado = Math.floor(fim.getTime() / 1000);
  const { r, chamadas } = await emitir(fim.toISOString());
  assert.equal(r.status, 200);
  const sala = chamadas.find((c) => c.path === "/rooms").body;
  const token = chamadas.find((c) => c.path === "/meeting-tokens").body.properties;
  assert.equal(sala.properties.exp, esperado);
  assert.equal(sala.properties.eject_at_room_exp, true);
  assert.equal(token.exp, esperado);
  assert.equal(token.eject_at_token_exp, true);
  assert.ok(token.exp <= sala.properties.exp, "o token nunca vive mais que a sala");
});

test("sala privada, no máximo dois participantes, sem chat do provedor, sem batida à porta e sem gravação", async () => {
  const { chamadas } = await emitir(new Date(Date.now() + 3600e3).toISOString());
  const sala = chamadas.find((c) => c.path === "/rooms").body;
  assert.equal(sala.name, SALA);
  assert.equal(sala.privacy, "private");
  assert.equal(sala.properties.max_participants, 2);
  assert.equal(sala.properties.enable_chat, false);
  assert.equal(sala.properties.enable_knocking, false);
  const todos = JSON.stringify(chamadas);
  assert.ok(!/record|transcri|streaming/i.test(todos), "nenhum recurso de gravação/transcrição/streaming é pedido");
});

test("token: preso à sala e ao participante, nunca dono, sem permissões extras", async () => {
  const { chamadas } = await emitir(new Date(Date.now() + 3600e3).toISOString());
  const t = chamadas.find((c) => c.path === "/meeting-tokens").body.properties;
  assert.equal(t.room_name, SALA); assert.equal(t.user_id, "u9"); assert.equal(t.is_owner, false);
  assert.deepEqual(Object.keys(t).sort(), ["eject_at_token_exp", "exp", "is_owner", "room_name", "user_id", "user_name"]);
});

test("janela já vencida: nada é pedido ao Daily", async () => {
  const { r, chamadas } = await emitir(new Date(Date.now() - 1000).toISOString());
  assert.equal(r.status, 409); assert.equal(chamadas.length, 0);
});
