// Corrida entre emissão de token e encerramento, com barreiras determinísticas.
//
// Dois tipos de teste, identificados no nome:
//  [SEGURANÇA]  provam uma invariante da lógica real dos handlers (ex.: nenhum token é entregue
//               depois de a revalidação detectar o encerramento).
//  [MOCK]       demonstram o efeito no modelo de Daily deste arquivo (salas existentes, tokens válidos
//               enquanto a sala existe). O comportamento real do provedor ainda exige homologação.
import assert from "node:assert/strict";
import test from "node:test";
import { createCloseRoomHandler } from "../../supabase/functions/close-appointment-room/handler.ts";
import { createRoomTokenHandler } from "../../supabase/functions/issue-appointment-room-token/handler.ts";

const ID = "11111111-2222-4333-8444-555555555555";
const SALA = "potala-0123456789abcdef0123456789abcdef";
const barreira = () => { let abrir; const passou = new Promise((r) => { abrir = r; }); return { passou, abrir }; };
const nuncaVolta = () => new Promise(() => {}); // worker interrompido durante a espera

function mundo(opc = {}) {
  const w = { salas: new Set(), fechado: false, chamadas: [], tarefas: [], gate: null, chegou: barreira(),
    dailyDown: false, criacaoDown: false, espera: barreira(), contextoFalhas: opc.contextoFalhas ?? 0 };
  w.tokenValido = (t) => w.salas.has(String(t).split("|")[1]);
  const dailyRota = async (method, path, body) => {
    w.chamadas.push([method, path, body]);
    if (method === "POST" && path === "/rooms") {
      w.chegou.abrir(); if (w.gate) await w.gate.passou;
      if (w.criacaoDown) return { status: 503, json: {} };
      if (w.salas.has(body.name)) return { status: 400, json: { info: "room already exists" } };
      w.salas.add(body.name); return { status: 200, json: {} };
    }
    if (path === "/meeting-tokens") return w.salas.has(body.properties.room_name) ? { status: 200, json: { token: `tok|${body.properties.room_name}` } } : { status: 404, json: {} };
    const m = /^\/rooms\/([^/]+)(\/eject)?$/.exec(path);
    if (m && w.dailyDown) return { status: 503, json: {} };
    if (m && method === "POST") return w.salas.has(m[1]) ? { status: 200, json: { ejectedIds: [] } } : { status: 404, json: {} };
    if (m && method === "DELETE") return w.salas.delete(m[1]) ? { status: 200, json: { deleted: true } } : { status: 404, json: {} };
    return { status: 404, json: {} };
  };
  const env = (n) => ({ DAILY_API_KEY: "k", DAILY_DOMAIN: "potala", ROOM_ALLOWED_ORIGINS: "https://app.invalid" })[n];
  const later = (t) => { w.tarefas.push(t); };
  const esperar = opc.esperar ?? (() => w.espera.passou); // retentativas só andam quando o teste libera
  const emitir = createRoomTokenHandler({ env, later, esperar,
    issue: async () => ({ data: { session_id: "s", room_name: SALA, provider: "daily", role: "client", expires_at: new Date(Date.now() + 3600e3).toISOString(), participant_id: "u1" } }),
    context: async () => {
      if (opc.contextoSempreAberto) return { data: { state: "open" } };
      if (w.contextoFalhas-- > 0) throw new Error("timeout");
      return { data: { state: w.fechado ? "closed" : "open" } };
    },
    daily: (path, body, method = "POST") => dailyRota(method, path, body) });
  const encerrar = createCloseRoomHandler({ env, later, esperar,
    close: async () => { w.fechado = true; return { data: { closed: true } }; },
    lookup: async () => ({ room_name: SALA, user_ids: ["u1", "u2"] }),
    daily: dailyRota });
  const req = () => new Request("https://f.invalid/x", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://app.invalid", Authorization: "Bearer jwt" }, body: JSON.stringify({ request_id: ID }) });
  return { w, emitir: () => emitir(req()), encerrar: () => encerrar(req()) };
}
const semToken = async (r) => { const t = await r.text(); assert.ok(!/token/.test(t.replace(/"message"[^,}]*/g, "")), `resposta não pode conter token: ${t}`); return t; };


test("[MOCK] reprodução sem revalidação: a sala é recriada depois do encerramento e o token antigo volta a valer", async () => {
  const m = mundo({ contextoSempreAberto: true });
  m.w.salas.add(SALA); const antigo = `tok|${SALA}`;
  m.w.gate = barreira();
  const emissao = m.emitir();
  await m.w.chegou.passou;
  await m.encerrar();
  assert.equal(m.w.tokenValido(antigo), false, "o encerramento apagou a sala");
  m.w.gate.abrir();
  assert.equal((await emissao).status, 200, "sem proteção o token novo é entregue");
  assert.equal(m.w.tokenValido(antigo), true, "sala recriada: o token antigo voltou a valer");
});

test("[SEGURANÇA] emissão iniciada antes e concluída depois do encerramento: não entrega token e compensa a sala", async () => {
  const m = mundo();
  m.w.salas.add(SALA); const antigo = `tok|${SALA}`;
  m.w.gate = barreira();
  const emissao = m.emitir();
  await m.w.chegou.passou;
  assert.deepEqual(await (await m.encerrar()).json(), { closed: true, revoked: true });
  m.w.gate.abrir();
  const r = await emissao; const texto = await semToken(r);
  assert.equal(r.status, 409); assert.equal(JSON.parse(texto).code, "P0001");
  assert.equal(m.w.salas.size, 0, "sala recriada foi removida");
  assert.equal(m.w.tokenValido(antigo), false, "o token antigo não volta a valer");
  assert.ok(m.w.chamadas.some((c) => c[1] === `/rooms/${SALA}/eject` && c[2].ban === true && c[2].user_ids[0] === "u1"));
});

test("[SEGURANÇA] duas emissões concorrentes presas na mesma barreira durante o encerramento: ambas negadas, nenhuma sala sobra", async () => {
  const m = mundo(); m.w.gate = barreira();
  const a = m.emitir(), b = m.emitir();
  await m.w.chegou.passou;
  await m.encerrar();
  m.w.gate.abrir();
  const [ra, rb] = await Promise.all([a, b]);
  await semToken(ra); await semToken(rb);
  assert.deepEqual([ra.status, rb.status], [409, 409]);
  assert.equal(m.w.salas.size, 0);
});

test("[SEGURANÇA] encerramento depois da última revalidação: o token é entregue e o encerramento revoga a sala em seguida", async () => {
  const m = mundo();
  const r = await m.emitir();
  assert.equal(r.status, 200); const t = (await r.json()).token;
  assert.equal(m.w.tokenValido(t), true);
  await m.encerrar();
  assert.equal(m.w.tokenValido(t), false, "janela entre a revalidação e a entrega é coberta pela revogação do encerramento");
});


test("[SEGURANÇA] timeout na revalidação: falha fechado (sem token) e a reconciliação apaga a sala quando o estado é confirmado", async () => {
  const m = mundo({ contextoFalhas: 1 });
  m.w.gate = barreira(); const emissao = m.emitir();
  await m.w.chegou.passou; await m.encerrar(); m.w.gate.abrir();
  const r = await emissao; await semToken(r);
  assert.equal(r.status, 502);
  assert.equal(m.w.salas.size, 1, "sem confirmar o estado a sala ainda existe, mas ninguém recebeu token");
  m.w.espera.abrir();
  assert.equal(await m.w.tarefas.at(-1), true);
  assert.equal(m.w.salas.size, 0, "a reconciliação automática removeu a sala");
});

test("[SEGURANÇA] falha temporária da compensação: sem token entregue; a reconciliação conclui quando o Daily volta", async () => {
  const m = mundo();
  m.w.gate = barreira(); const emissao = m.emitir();
  await m.w.chegou.passou; await m.encerrar();
  m.w.dailyDown = true; m.w.gate.abrir();
  const r = await emissao; await semToken(r);
  assert.equal(r.status, 502); assert.equal(m.w.salas.size, 1);
  m.w.dailyDown = false;
  m.w.espera.abrir();
  assert.equal(await m.w.tarefas.at(-1), true);
  assert.equal(m.w.salas.size, 0);
});

test("[SEGURANÇA] falha permanente da compensação: nenhum token entregue, retentativas limitadas, resultado pendente explícito", async () => {
  const m = mundo();
  m.w.gate = barreira(); const emissao = m.emitir();
  await m.w.chegou.passou; await m.encerrar();
  m.w.dailyDown = true; m.w.gate.abrir();
  const r = await emissao; await semToken(r);
  m.w.espera.abrir();
  assert.equal(await m.w.tarefas.at(-1), false);
  assert.ok(m.w.chamadas.filter((c) => c[0] === "DELETE").length <= 8, "retentativas limitadas");
  assert.equal(m.w.salas.size, 1, "fica pendente (não declarada como revogada)");
});

test("[SEGURANÇA] worker interrompido durante as retentativas: nenhum token foi entregue e uma nova chamada de encerramento conclui", async () => {
  const m = mundo({ esperar: nuncaVolta });
  m.w.gate = barreira(); const emissao = m.emitir();
  await m.w.chegou.passou; await m.encerrar();
  m.w.dailyDown = true; m.w.gate.abrir();
  const r = await emissao; await semToken(r);
  // a tarefa em segundo plano nunca avança (processo encerrado): a sala segue pendente
  assert.equal(m.w.salas.size, 1);
  m.w.dailyDown = false;
  assert.deepEqual(await (await m.encerrar()).json(), { closed: true, revoked: true }, "repetição idempotente recupera");
  assert.equal(m.w.salas.size, 0);
});

test("[SEGURANÇA] Daily indisponível na criação da sala: 502, nenhum token, nenhuma sala", async () => {
  const m = mundo(); m.w.criacaoDown = true;
  const r = await m.emitir(); await semToken(r);
  assert.equal(r.status, 502); assert.equal(m.w.salas.size, 0);
});

test("[SEGURANÇA] encerramento com Daily fora do ar: revoked:false e a reconciliação automática conclui depois", async () => {
  const m = mundo();
  m.w.salas.add(SALA); const t = `tok|${SALA}`; m.w.dailyDown = true;
  assert.deepEqual(await (await m.encerrar()).json(), { closed: true, revoked: false });
  assert.equal(m.w.tokenValido(t), true, "pendente até a reconciliação");
  m.w.dailyDown = false;
  m.w.espera.abrir();
  assert.equal(await m.w.tarefas[0], true);
  assert.equal(m.w.tokenValido(t), false);
});

test("[SEGURANÇA] emissão legítima sem encerramento: entrega o token e não agenda reconciliação", async () => {
  const m = mundo();
  const r = await m.emitir();
  assert.equal(r.status, 200); assert.equal(m.w.tarefas.length, 0); assert.equal(m.w.salas.size, 1);
});
