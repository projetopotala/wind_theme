import assert from "node:assert/strict";
import test from "node:test";
import { COLECOES, aplicarComando, estadoVazio, textoEstavel } from "../../outputs/js/admin/operations/motor.js";
import { HANDLERS } from "../../outputs/js/admin/operations/client.js";

let n = 0;
const ctx = () => ({ handlers: HANDLERS, id: () => `id-${++n}`, agora: "2026-09-17T12:00:00.000Z", actor: "Paulo" });

test("as coleções são as mesmas que o banco aceita", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(new URL("../../supabase/migrations/202609170001_operacao_do_instituto.sql", import.meta.url), "utf8");
  for (const colecao of COLECOES) assert.match(sql, new RegExp(`'${colecao}'`), `o banco não conhece ${colecao}`);
});

test("preparar as salas gera dez registros novos e nada mais", () => {
  const { result, changes } = aplicarComando(estadoVazio(), { type: "setup.rooms", payload: {} }, ctx());
  assert.deepEqual(result, { count: 10 });
  assert.equal(changes.length, 10);
  assert.ok(changes.every((mudanca) => mudanca.table === "rooms" && mudanca.after.id === mudanca.id));
});

test("editar uma sala envia só ela, mesmo com as chaves em outra ordem", () => {
  const { changes: criadas } = aplicarComando(estadoVazio(), { type: "setup.rooms", payload: {} }, ctx());
  const estado = { ...estadoVazio(), revision: 1, rooms: criadas.map((mudanca) => mudanca.after) };
  /* O jsonb devolve as chaves reordenadas; isso sozinho não é alteração. */
  estado.rooms = estado.rooms.map((sala) => Object.fromEntries(Object.entries(sala).reverse()));
  const sala = { ...estado.rooms[0], name: "Sala Lótus", capacity: 2, accessible: true, status: "available", opens_at: "08:00", closes_at: "20:00" };
  const { changes } = aplicarComando(estado, { type: "room.save", payload: sala }, ctx());
  assert.equal(changes.length, 1);
  assert.equal(changes[0].after.name, "Sala Lótus");
});

test("registro que some vira remoção", () => {
  const estado = { ...estadoVazio(), profiles: [{ id: "a" }, { id: "b" }] };
  const tirar = (state, { type }) => { if (type === "tirar") { state.profiles.pop(); return { ok: true }; } };
  const { changes } = aplicarComando(estado, { type: "tirar", payload: {} }, { ...ctx(), handlers: [tirar] });
  assert.deepEqual(changes, [{ table: "profiles", id: "b", after: null }]);
});

test("comando desconhecido, inválido ou com id repetido é recusado sem alterar o estado", () => {
  const estado = estadoVazio();
  assert.throws(() => aplicarComando(estado, { type: "nada", payload: {} }, ctx()), /desconhecida/);
  assert.throws(() => aplicarComando(estado, { type: "room.save" }, ctx()), /inválido/);
  const duplica = (state) => { state.profiles.push({ id: "x" }, { id: "x" }); return {}; };
  assert.throws(() => aplicarComando(estado, { type: "d", payload: {} }, { ...ctx(), handlers: [duplica] }), /duplicado/);
  assert.deepEqual(estado, estadoVazio());
});

test("a comparação estável ignora a ordem das chaves, não o conteúdo", () => {
  assert.equal(textoEstavel({ a: 1, b: { c: 2, d: 3 } }), textoEstavel({ b: { d: 3, c: 2 }, a: 1 }));
  assert.notEqual(textoEstavel({ a: [1, 2] }), textoEstavel({ a: [2, 1] }));
});
