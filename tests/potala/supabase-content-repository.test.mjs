import assert from "node:assert/strict";
import test from "node:test";

import { createSupabaseContentRepository } from "../../outputs/js/home/supabase-content-repository.js";

function queryClient({ rows = [], error = null, rpcRows = rows, rpcError = null } = {}) {
  const calls = { select: [], eq: [], order: [], rpc: [] };
  const query = {
    select(columns) { calls.select.push(columns); return this; },
    eq(column, value) { calls.eq.push([column, value]); return this; },
    order(column, options) { calls.order.push([column, options]); return this; },
    then(resolve) { return Promise.resolve(resolve({ data: rows, error })); },
  };
  return {
    calls,
    client: {
      from(table) {
        assert.equal(table, "home_blocks");
        return query;
      },
      async rpc(name, args) {
        calls.rpc.push([name, args]);
        return { data: rpcRows, error: rpcError };
      },
    },
  };
}

const databaseRow = {
  id: "quem-somos",
  slug: "quem-somos",
  category: "Entrada",
  title: "Quem somos",
  summary: "Resumo",
  body: "Texto",
  image: "",
  icon: "",
  tags: ["história"],
  href: "quem-somos.html",
  side: "left",
  position: 0,
  published: true,
  updated_at: "2026-09-02T10:00:00.000Z",
};

test("list filtra publicação no servidor e mapeia snake_case", async () => {
  const { client, calls } = queryClient({ rows: [databaseRow] });
  const repository = createSupabaseContentRepository({ client });

  const blocks = await repository.list({ publishedOnly: true });

  assert.equal(blocks[0].updatedAt, databaseRow.updated_at);
  assert.deepEqual(calls.eq, [["published", true]]);
  assert.deepEqual(calls.order, [["position", { ascending: true }]]);
  assert.match(calls.select[0], /updated_at/);
});

test("replaceAll envia uma única RPC atômica e devolve blocos normalizados", async () => {
  const { client, calls } = queryClient({ rpcRows: [databaseRow] });
  const repository = createSupabaseContentRepository({ client });

  const result = await repository.replaceAll([{
    ...databaseRow,
    updatedAt: databaseRow.updated_at,
  }]);

  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.rpc[0][0], "replace_home_blocks");
  assert.equal(calls.rpc[0][1].payload[0].updated_at, databaseRow.updated_at);
  assert.equal(calls.rpc[0][1].payload[0].updatedAt, undefined);
  assert.equal(result[0].title, "Quem somos");
});

test("erro remoto preserva código e operação", async () => {
  const { client } = queryClient({ error: { code: "42501", message: "denied" } });
  const repository = createSupabaseContentRepository({ client });

  await assert.rejects(
    () => repository.list(),
    (error) => error.code === "42501" && error.operation === "list",
  );
});

test("reset repõe os padrões pela mesma escrita remota", async () => {
  const { client, calls } = queryClient({ rpcRows: [databaseRow] });
  const repository = createSupabaseContentRepository({
    client,
    defaults: [{ ...databaseRow, updatedAt: databaseRow.updated_at }],
  });

  await repository.reset();

  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.rpc[0][1].payload[0].id, "quem-somos");
});
