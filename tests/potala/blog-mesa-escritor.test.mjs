import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { itensDoMenu } from "../../outputs/js/blog-admin/mesa-visoes.js";
import { podePublicar } from "../../outputs/js/blog-admin/mesa-modelo.js";

const ids = (registro, permissoes) => itensDoMenu(registro, permissoes).filter((i) => i !== "separador").map((i) => i.id);
const escritor = { ler: true, editar: true, publicar: false, somenteProprios: true };
const editor = { ler: true, editar: true, publicar: true };

test("Escritor: o menu da lista nao oferece Agendar nem Arquivar; Editar, Duplicar e Excluir continuam", () => {
  for (const status of ["draft", "review"]) {
    const lista = ids({ status }, escritor);
    assert.ok(!lista.includes("agendar"), `agendar em ${status}`);
    assert.ok(!lista.includes("arquivar"), `arquivar em ${status}`);
    for (const id of ["editar", "visualizar", "duplicar", "excluir"]) assert.ok(lista.includes(id), `${id} em ${status}`);
  }
});

test("Editor, Owner e quem nao informa permissoes continuam vendo Agendar e Arquivar", () => {
  for (const permissoes of [editor, undefined, {}]) {
    const lista = ids({ status: "draft" }, permissoes);
    assert.ok(lista.includes("agendar") && lista.includes("arquivar"));
  }
  assert.ok(ids({ status: "scheduled" }, editor).includes("arquivar"));
  assert.ok(ids({ status: "archived" }, editor).includes("restaurar"));
});

test("podePublicar so e falso quando publicar === false", () => {
  assert.equal(podePublicar({ publicar: false }), false);
  assert.equal(podePublicar({ publicar: true }), true);
  assert.equal(podePublicar(undefined), true);
  assert.equal(podePublicar({}), true);
});

test("editor de texto: Escritor so envia para revisao; Publicar, Agendar e Arquivar saem da tela", () => {
  const fonte = readFileSync(new URL("../../outputs/js/blog-admin/blog-editor.js", import.meta.url), "utf8");
  assert.match(fonte, /const publica = \(\) => podePublicar\(ctx\.permissoes\);/);
  assert.match(fonte, /if \(!publica\(\)\) \{[\s\S]{0,200}acao: "revisao", rotulo: "Enviar para revis/);
  assert.match(fonte, /const escolhaVisivel = publica\(\) && /);
  assert.match(fonte, /publica\(\) \? `<button[^`]*data-editor-acao="publicar"/);
  assert.match(fonte, /publica\(\) \? `<button[^`]*data-editor-acao="arquivar"/);
  /* a trava do backend e a do mudarStatus continuam */
  assert.match(fonte, /ctx\.permissoes\?\.publicar === false/);
});
