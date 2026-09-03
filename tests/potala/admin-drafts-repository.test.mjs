import assert from "node:assert/strict";
import test from "node:test";

import { createSupabaseContentRepository } from "../../outputs/js/home/supabase-content-repository.js";
import { createLocalContentRepository } from "../../outputs/js/home/content-repository.js";

/* Um cliente falso que registra em QUAL tabela cada escrita cai. É o que o
   teste principal deste arquivo precisa observar. */
function clienteFalso({ upsertError = null, rpcError = null, rows = [] } = {}) {
  const escritas = [];
  const rpcs = [];
  const apagados = [];
  const client = {
    from(tabela) {
      return {
        select() { return this; },
        order() { return Promise.resolve({ data: rows, error: null }); },
        upsert(linha) {
          escritas.push({ tabela, linha });
          return {
            select: () => ({
              single: () => Promise.resolve({ data: linha, error: upsertError }),
            }),
          };
        },
        delete() {
          return {
            eq(coluna, valor) {
              apagados.push({ tabela, coluna, valor });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
    async rpc(nome) {
      rpcs.push(nome);
      return { data: rows, error: rpcError };
    },
  };
  return { client, escritas, rpcs, apagados };
}

const rascunho = { id: "atendimentos", title: "Atendimentos", side: "left", position: 0 };

/*
 * A asserção que justifica este arquivo.
 *
 * Gravar um rascunho em home_blocks põe texto inacabado no site no mesmo
 * instante, e nada na tela do editor diria que foi isso que aconteceu.
 */
test("saveDraft escreve na tabela de rascunhos, nunca na publicada", async () => {
  const { client, escritas } = clienteFalso();
  await createSupabaseContentRepository({ client }).saveDraft(rascunho);

  assert.equal(escritas.length, 1);
  assert.equal(escritas[0].tabela, "home_block_drafts");
  assert.equal(escritas[0].linha.title, "Atendimentos");
});

test("discardDraft apaga só a linha de rascunho daquele bloco", async () => {
  const { client, apagados } = clienteFalso();
  await createSupabaseContentRepository({ client }).discardDraft("atendimentos");

  assert.deepEqual(apagados, [
    { tabela: "home_block_drafts", coluna: "id", valor: "atendimentos" },
  ]);
});

test("publishDrafts passa pela RPC, não por escrita direta", async () => {
  const { client, rpcs, escritas } = clienteFalso();
  await createSupabaseContentRepository({ client }).publishDrafts();

  assert.deepEqual(rpcs, ["publish_home_block_drafts"]);
  assert.deepEqual(escritas, []);
});

test("erro da RPC de publicar não vira sucesso silencioso", async () => {
  const { client } = clienteFalso({ rpcError: { message: "portal_admin_required" } });
  await assert.rejects(
    () => createSupabaseContentRepository({ client }).publishDrafts(),
    /portal_admin_required/,
  );
});

test("bloco sem título é recusado antes de chegar ao banco", async () => {
  const { client, escritas } = clienteFalso();
  await assert.rejects(() => createSupabaseContentRepository({ client }).saveDraft({ id: "x" }));
  assert.deepEqual(escritas, []);
});

/* O repositório local espelha o remoto para que o painel se comporte igual sem
   rede — inclusive na parte que importa: salvar rascunho não publica. */
function memoria() {
  const dados = new Map();
  return {
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => dados.set(chave, valor),
    removeItem: (chave) => dados.delete(chave),
  };
}

test("local: salvar rascunho não mexe na lista publicada", async () => {
  const storage = memoria();
  const repo = createLocalContentRepository({
    storage,
    defaults: [{ id: "a", title: "Original", side: "left", position: 0 }],
  });

  await repo.saveDraft({ id: "a", title: "Editado", side: "left", position: 0 });

  assert.deepEqual((await repo.list()).map((bloco) => bloco.title), ["Original"]);
  assert.deepEqual((await repo.listDrafts()).map((bloco) => bloco.title), ["Editado"]);
});

test("local: publicar move o rascunho para a lista e esvazia os rascunhos", async () => {
  const storage = memoria();
  const repo = createLocalContentRepository({
    storage,
    defaults: [{ id: "a", title: "Original", side: "left", position: 0 }],
  });

  await repo.saveDraft({ id: "a", title: "Editado", side: "left", position: 0 });
  await repo.publishDrafts();

  assert.deepEqual((await repo.list()).map((bloco) => bloco.title), ["Editado"]);
  assert.deepEqual(await repo.listDrafts(), []);
});

test("local: descartar rascunho devolve o bloco ao que está no ar", async () => {
  const storage = memoria();
  const repo = createLocalContentRepository({
    storage,
    defaults: [{ id: "a", title: "Original", side: "left", position: 0 }],
  });

  await repo.saveDraft({ id: "a", title: "Editado", side: "left", position: 0 });
  await repo.discardDraft("a");

  assert.deepEqual(await repo.listDrafts(), []);
  assert.deepEqual((await repo.list()).map((bloco) => bloco.title), ["Original"]);
});

/*
 * Uma linha vinda de um banco que ainda não recebeu a migração — sem
 * title_scale, allow_panel nem meta_description — tem de virar um bloco válido.
 * É o estado real do banco enquanto a migração não roda, e nele o painel
 * precisa continuar mostrando o que está publicado.
 */
test("linha sem as colunas novas ainda vira bloco, com os padrões", async () => {
  const linhaAntiga = {
    id: "quem-somos",
    slug: "quem-somos",
    category: "A entrada",
    title: "Quem somos",
    summary: "Um resumo",
    body: "Um corpo",
    image: "",
    icon: "",
    tags: [],
    href: "quem-somos.html",
    side: "left",
    position: 0,
    published: true,
    updated_at: "2026-09-01T00:00:00.000Z",
  };
  const client = {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [linhaAntiga], error: null }) }),
    }),
    rpc: async () => ({ data: [], error: null }),
  };

  const [bloco] = await createSupabaseContentRepository({ client }).list();

  assert.equal(bloco.title, "Quem somos");
  assert.equal(bloco.titleScale, "normal");
  assert.equal(bloco.allowPanel, true);
  assert.equal(bloco.metaDescription, "");
});
