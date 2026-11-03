// Corrida entre emissão de token e encerramento, com barreiras determinísticas (modelo LiveKit).
//
//  [SEGURANÇA] provam uma invariante da lógica real dos handlers (nenhum token é entregue depois de a
//              revalidação detectar o encerramento; a sala recriada é compensada).
//  [MODELO]    mostram o efeito no modelo de LiveKit de d4-livekit-modelo.mjs (token válido até expirar,
//              auto-create). O comportamento real do provedor exige homologação.
import assert from "node:assert/strict";
import test from "node:test";
import { SALA, barreira, mundo, nuncaVolta } from "./d4-livekit-modelo.mjs";

const semToken = async (r) => { const t = await r.text(); assert.ok(!/"token"/.test(t), `resposta não pode conter token: ${t}`); return t; };
const criacoes = (m) => m.chamadas.filter((c) => c[0] === "createRoom").length;

test("[MODELO] sem revalidação a sala é recriada depois do encerramento e o token novo entra", async () => {
  const x = mundo({ contextoSempreAberto: true });
  x.m.gate = barreira();
  const emissao = x.emitir();
  await x.m.chegou.passou;
  await x.encerrar();
  assert.equal(x.m.salas.has(SALA), false, "o encerramento apagou a sala");
  x.m.gate.abrir();
  const r = await emissao;
  assert.equal(r.status, 200, "sem proteção o token novo é entregue");
  assert.equal(x.m.entrar((await r.json()).token).ok, true, "e a sala volta a existir");
});

test("[SEGURANÇA] emissão iniciada antes e concluída depois do encerramento: não entrega token e compensa a sala", async () => {
  const x = mundo();
  x.m.gate = barreira();
  const emissao = x.emitir();
  await x.m.chegou.passou;
  assert.deepEqual(await (await x.encerrar()).json(), { closed: true, revoked: true });
  x.m.gate.abrir();
  const r = await emissao; const texto = await semToken(r);
  assert.equal(r.status, 409); assert.equal(JSON.parse(texto).code, "P0001");
  assert.equal(x.m.salas.size, 0, "a sala recriada foi removida e a ausência confirmada");
  assert.ok(x.m.chamadas.some((c) => c[0] === "removeParticipant" && c[2] === "u1"));
});

test("[SEGURANÇA] duas emissões concorrentes presas na mesma barreira durante o encerramento: ambas negadas, nenhuma sala sobra", async () => {
  const x = mundo(); x.m.gate = barreira();
  const a = x.emitir(), b = x.emitir();
  await x.m.chegou.passou;
  await x.encerrar();
  x.m.gate.abrir();
  const [ra, rb] = await Promise.all([a, b]);
  await semToken(ra); await semToken(rb);
  assert.deepEqual([ra.status, rb.status], [409, 409]);
  assert.equal(x.m.salas.size, 0);
});

test("[SEGURANÇA] encerramento depois da última revalidação: o token é entregue e o encerramento remove quem entrou e apaga a sala", async () => {
  const x = mundo();
  const r = await x.emitir();
  assert.equal(r.status, 200); const token = (await r.json()).token;
  assert.equal(x.m.entrar(token).ok, true);
  assert.deepEqual(x.m.conectados(SALA), ["u1"]);
  await x.encerrar();
  assert.equal(x.m.salas.has(SALA), false, "sala apagada e participante fora");
});

test("[SEGURANÇA] timeout na revalidação: falha fechado (sem token) e a reconciliação apaga a sala quando o estado é confirmado", async () => {
  const x = mundo({ contextoFalhas: 1 });
  x.m.gate = barreira(); const emissao = x.emitir();
  await x.m.chegou.passou; await x.encerrar(); x.m.gate.abrir();
  const r = await emissao; await semToken(r);
  assert.equal(r.status, 502);
  assert.equal(x.m.salas.size, 1, "sem confirmar o estado a sala existe, mas ninguém recebeu token");
  x.w.espera.abrir();
  assert.equal(await x.w.tarefas.at(-1), true);
  assert.equal(x.m.salas.size, 0, "a reconciliação automática removeu a sala");
});

test("[SEGURANÇA] falha temporária da compensação: sem token entregue; a reconciliação conclui quando o LiveKit volta", async () => {
  const x = mundo();
  x.m.gate = barreira(); const emissao = x.emitir();
  await x.m.chegou.passou; await x.encerrar();
  x.m.down = true; x.m.gate.abrir();
  const r = await emissao; await semToken(r);
  assert.equal(r.status, 502); assert.equal(x.m.salas.size, 1);
  x.m.down = false;
  x.w.espera.abrir();
  assert.equal(await x.w.tarefas.at(-1), true);
  assert.equal(x.m.salas.size, 0);
});

test("[SEGURANÇA] falha permanente da compensação: nenhum token entregue, retentativas limitadas, resultado pendente explícito", async () => {
  const x = mundo();
  x.m.gate = barreira(); const emissao = x.emitir();
  await x.m.chegou.passou; await x.encerrar();
  x.m.down = true; x.m.gate.abrir();
  const r = await emissao; await semToken(r);
  x.w.espera.abrir();
  assert.equal(await x.w.tarefas.at(-1), false);
  assert.ok(x.m.chamadas.filter((c) => c[0] === "deleteRoom").length <= 12, "retentativas limitadas");
  assert.equal(x.m.salas.size, 1, "fica pendente (não declarada como revogada)");
});

test("[SEGURANÇA] worker interrompido durante as retentativas: nenhum token foi entregue e uma nova chamada de encerramento conclui", async () => {
  const x = mundo({ esperar: nuncaVolta });
  x.m.gate = barreira(); const emissao = x.emitir();
  await x.m.chegou.passou; await x.encerrar();
  x.m.down = true; x.m.gate.abrir();
  const r = await emissao; await semToken(r);
  assert.equal(x.m.salas.size, 1, "a tarefa em segundo plano nunca avança (processo encerrado)");
  x.m.down = false;
  assert.deepEqual(await (await x.encerrar()).json(), { closed: true, revoked: true }, "repetição idempotente recupera");
  assert.equal(x.m.salas.size, 0);
});

test("[SEGURANÇA] LiveKit indisponível na criação da sala: 502, nenhum token, nenhuma sala", async () => {
  const x = mundo(); x.m.criacaoDown = true;
  const r = await x.emitir(); await semToken(r);
  assert.equal(r.status, 502); assert.equal(x.m.salas.size, 0);
  assert.ok(!x.m.chamadas.some((c) => c[0] === "token"), "nem o token é gerado sem sala");
});

test("[SEGURANÇA] encerramento com LiveKit fora do ar: revoked:false e a reconciliação automática conclui depois", async () => {
  const x = mundo();
  x.m.salas.set(SALA, { max: 2, conectados: new Map([["u1", true]]) }); x.m.down = true;
  assert.deepEqual(await (await x.encerrar()).json(), { closed: true, revoked: false });
  assert.deepEqual(x.m.conectados(SALA), ["u1"], "pendente até a reconciliação");
  x.m.down = false;
  x.w.espera.abrir();
  assert.equal(await x.w.tarefas[0], true);
  assert.equal(x.m.salas.has(SALA), false);
});

test("[SEGURANÇA] emissão legítima sem encerramento: entrega o token e não agenda reconciliação", async () => {
  const x = mundo();
  const r = await x.emitir();
  assert.equal(r.status, 200); assert.equal(x.w.tarefas.length, 0); assert.equal(x.m.salas.size, 1);
  assert.equal(criacoes(x.m), 1);
});
