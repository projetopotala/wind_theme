import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ADMIN_PREVIEW_MESSAGE,
  createPreviewMessage,
  previewBlocksForDraft,
} from "../../outputs/js/admin/admin-controller.js";
import {
  parseAdminPreviewMessage,
  previewStructure,
} from "../../outputs/js/home/admin-preview.js";

test("Home oferece acesso discreto ao painel e o painel contém a prévia real", async () => {
  const [homeScenes, admin] = await Promise.all([
    readFile(new URL("../../outputs/js/home/home-scenes.js", import.meta.url), "utf8"),
    readFile(new URL("../../outputs/admin.html", import.meta.url), "utf8"),
  ]);

  /*
   * O acesso ao painel percorreu três formas, sempre pelo mesmo motivo.
   *
   * Foi uma pílula larga escrita "Painel editorial" — o item mais destacado da
   * barra lateral, e o único que o visitante nunca vai usar. Virou uma opção
   * dentro de um botão redondo. Com a barra removida, virou o lápis no canto
   * inferior esquerdo: discreto, e o único controle da Home que não é para
   * quem chega.
   */
  assert.match(homeScenes, /journey-lapis[\s\S]*?href="admin\.html"/);
  assert.match(admin, /<iframe[^>]+data-admin-preview/);
  assert.match(admin, /src="transcendido\.html\?admin-preview=1"/);
});

test("rascunho altera somente a cópia enviada à prévia", () => {
  const base = [{
    id: "cursos",
    title: "Cursos",
    summary: "Resumo antigo",
    side: "left",
    position: 0,
    published: true,
    tags: [],
  }];
  const antes = structuredClone(base);
  const preview = previewBlocksForDraft(base, {
    ...base[0],
    summary: "Resumo ao vivo",
    body: "Texto ao vivo",
  });

  assert.deepEqual(base, antes);
  assert.equal(preview[0].summary, "Resumo ao vivo");
  assert.equal(preview[0].body, "Texto ao vivo");
});

test("novo bloco recebe identidade temporária estável somente na prévia", () => {
  const preview = previewBlocksForDraft([], {
    title: "Novo caminho",
    summary: "Em criação",
    side: "right",
    published: true,
  });

  assert.equal(preview[0].id, "admin-preview-draft");
  assert.equal(preview[0].slug, "admin-preview-draft");
});

test("mensagem da prévia carrega tipo, blocos e foco", () => {
  const message = createPreviewMessage([{ id: "cursos" }], "cursos");
  assert.equal(message.type, ADMIN_PREVIEW_MESSAGE);
  assert.deepEqual(message.blocks, [{ id: "cursos" }]);
  assert.equal(message.focusId, "cursos");
});

test("Home aceita a prévia somente da janela pai e da mesma origem", () => {
  const source = {};
  const event = {
    origin: "https://potala.test",
    source,
    data: createPreviewMessage([{
      id: "cursos",
      title: "Cursos",
      summary: "Resumo",
      side: "left",
      position: 0,
      published: true,
    }], "cursos"),
  };

  const accepted = parseAdminPreviewMessage(event, {
    origin: "https://potala.test",
    source,
  });
  assert.equal(accepted.blocks[0].id, "cursos");
  assert.equal(accepted.focusId, "cursos");
  assert.equal(parseAdminPreviewMessage({ ...event, origin: "https://evil.test" }, {
    origin: "https://potala.test",
    source,
  }), null);
  assert.equal(parseAdminPreviewMessage({ ...event, source: {} }, {
    origin: "https://potala.test",
    source,
  }), null);
});

test("mudanças textuais não recriam a cena; estrutura e lado recriam", () => {
  const base = [{ id: "cursos", side: "left", position: 0, published: true, title: "Cursos" }];
  assert.equal(
    previewStructure(base),
    previewStructure([{ ...base[0], title: "Cursos livres", summary: "Novo" }]),
  );
  assert.notEqual(previewStructure(base), previewStructure([{ ...base[0], side: "right" }]));
});
