import assert from "node:assert/strict";
import test from "node:test";
import { createOperationsClient, traduzirErro } from "../../outputs/js/admin/operations/client.js";
import { estadoVazio } from "../../outputs/js/admin/operations/motor.js";

/*
 * Um banco falso com a mesma semântica de public.op_snapshot e public.op_apply:
 * revisão conferida, idempotência pelo identificador do pedido e alterações
 * aplicadas por registro. Só o que o cliente precisa enxergar.
 */
function banco() {
  const estado = estadoVazio();
  const pedidos = new Map();
  const chamadas = [];
  const client = {
    async rpc(nome, args) {
      chamadas.push({ nome, args: structuredClone(args) });
      if (nome === "op_snapshot") return { data: structuredClone(estado), error: null };
      if (nome !== "op_apply") return { data: null, error: { code: "PGRST202", message: "not found" } };
      const anterior = pedidos.get(args.p_idempotency_key);
      if (anterior) return { data: anterior, error: null };
      if (args.p_revision !== estado.revision) return { data: null, error: { code: "PT409", message: "revisão" } };
      for (const { table, id, after } of args.p_changes) {
        const linhas = estado[table];
        const indice = linhas.findIndex((linha) => linha.id === id);
        if (after === null) linhas.splice(indice, 1);
        else if (indice >= 0) linhas[indice] = after;
        else linhas.push(after);
      }
      estado.revision += 1;
      estado.audit_events.push({ id: `a${estado.revision}`, action: args.p_action });
      const resposta = { result: args.p_result, revision: estado.revision };
      pedidos.set(args.p_idempotency_key, resposta);
      return { data: resposta, error: null };
    },
  };
  return { estado, chamadas, client };
}

const pessoa = (state, { type, payload }, ctx) => {
  if (type !== "person.save") return undefined;
  const linha = { id: payload.id || ctx.id(), display_name: payload.name, created_at: ctx.now };
  state.profiles.push(linha);
  return linha;
};

let contador = 0;
const id = () => `id-${++contador}`;

test("refresh lê o estado pelo banco e devolve cópia", async () => {
  const { client } = banco();
  const operacao = createOperationsClient({ client, handlers: [pessoa], id });
  assert.equal(operacao.snapshot, null);
  await operacao.refresh();
  const copia = operacao.snapshot;
  copia.profiles.push({ id: "não-persistido" });
  assert.deepEqual(operacao.snapshot.profiles, []);
  assert.throws(() => createOperationsClient({}), /Supabase/);
});

test("o comando roda a regra no navegador e envia só o que mudou, com a revisão lida", async () => {
  const { client, chamadas, estado } = banco();
  const operacao = createOperationsClient({ client, handlers: [pessoa], id, agora: () => "2026-09-17T12:00:00.000Z" });
  const salvo = await operacao.command("person.save", { name: "Ana" });
  assert.equal(salvo.display_name, "Ana");
  const aplicar = chamadas.find((chamada) => chamada.nome === "op_apply").args;
  assert.equal(aplicar.p_revision, 0);
  assert.equal(aplicar.p_action, "person.save");
  assert.deepEqual(aplicar.p_changes.map(({ table, after }) => [table, after.display_name]), [["profiles", "Ana"]]);
  assert.equal(estado.profiles.length, 1);
  assert.equal(operacao.snapshot.revision, 1, "o estado é relido depois de gravar");
});

test("comandos em sequência partem cada um da revisão nova", async () => {
  const { client, chamadas } = banco();
  const operacao = createOperationsClient({ client, handlers: [pessoa], id });
  await Promise.all([operacao.command("person.save", { name: "Primeiro" }), operacao.command("person.save", { name: "Segundo" })]);
  const revisoes = chamadas.filter((chamada) => chamada.nome === "op_apply").map((chamada) => chamada.args.p_revision);
  assert.deepEqual(revisoes, [0, 1]);
  assert.equal(operacao.snapshot.profiles.length, 2);
});

test("revisão desatualizada relê o estado, avisa e o próximo comando funciona", async () => {
  const { client, estado } = banco();
  const operacao = createOperationsClient({ client, handlers: [pessoa], id });
  await operacao.refresh();
  estado.revision = 5;
  await assert.rejects(operacao.command("person.save", { name: "Ana" }), /outra janela/);
  assert.equal(operacao.snapshot.revision, 5);
  await operacao.command("person.save", { name: "Ana" });
  assert.equal(operacao.snapshot.revision, 6);
});

test("repetir o mesmo comando após falha reaproveita o identificador do pedido", async () => {
  const { client, chamadas } = banco();
  let falhar = true;
  const instavel = {
    async rpc(nome, args) {
      if (nome === "op_apply" && falhar) {
        falhar = false;
        await client.rpc(nome, args);
        return { data: null, error: { message: "Failed to fetch" } };
      }
      return client.rpc(nome, args);
    },
  };
  const operacao = createOperationsClient({ client: instavel, handlers: [pessoa], id });
  await assert.rejects(operacao.command("person.save", { id: "p1", name: "Ana" }), /Sem conexão/);
  await operacao.command("person.save", { id: "p1", name: "Ana" });
  const chaves = chamadas.filter((chamada) => chamada.nome === "op_apply").map((chamada) => chamada.args.p_idempotency_key);
  assert.equal(new Set(chaves).size, 1, "a segunda tentativa não pode gravar de novo");
});

test("regra de domínio que recusa não chega ao banco", async () => {
  const { client, chamadas } = banco();
  const recusa = () => { throw new Error("Sala ocupada."); };
  const operacao = createOperationsClient({ client, handlers: [recusa], id });
  await assert.rejects(operacao.command("schedule.save", {}), /Sala ocupada/);
  assert.equal(chamadas.filter((chamada) => chamada.nome === "op_apply").length, 0);
});

test("erros do banco viram frases que dizem o que fazer", () => {
  assert.match(traduzirErro({ code: "PGRST202", message: "Could not find the function public.op_snapshot" }).message, /não foi instalada/);
  assert.match(traduzirErro({ code: "42501" }).message, /acesso não permite/);
  assert.match(traduzirErro({ code: "23505", message: 'duplicate key value violates unique constraint "op_records_room_code"' }).message, /sala com este código/);
  assert.match(traduzirErro({ code: "23505", message: 'duplicate key value violates unique constraint "op_records_asset_code"' }).message, /patrimônio/);
});
