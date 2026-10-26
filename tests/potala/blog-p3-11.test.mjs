import assert from "node:assert/strict";
import test from "node:test";

import { comoRegistro, statusEfetivo } from "../../outputs/js/blog/blog-remoto.js";
import { autorPadrao, dataAoPublicar } from "../../outputs/js/blog-admin/blog-editor.js";
import { contarPorStatus, filtrarPosts, resumoDaMesa } from "../../outputs/js/blog-admin/mesa-modelo.js";
import { criarAvisos, MAXIMO_DE_AVISOS } from "../../outputs/js/blog-admin/mesa-ui.js";

test("D-1: autor padrão nunca é o e-mail de login", () => {
  assert.equal(autorPadrao({ nome: "admin@potala.org", autor: "" }), "Instituto Potala");
  assert.equal(autorPadrao({ autor: "admin@potala.org" }), "Instituto Potala");
  assert.equal(autorPadrao(null), "Instituto Potala");
  assert.equal(autorPadrao({ autor: "  Lama Padma  " }), "Lama Padma");
});

const HORA = "2026-10-27T13:00:00Z"; // 10:00 em America/Sao_Paulo
const antes = Date.parse("2026-10-27T12:59:59Z");
const depois = Date.parse("2026-10-27T13:00:01Z");

test("D-2: statusEfetivo antes, na hora e depois do agendamento", () => {
  assert.equal(statusEfetivo("scheduled", HORA, antes), "scheduled");
  assert.equal(statusEfetivo("scheduled", HORA, Date.parse(HORA)), "published");
  assert.equal(statusEfetivo("scheduled", HORA, depois), "published");
  assert.equal(statusEfetivo("scheduled", null, depois), "scheduled");
  assert.equal(statusEfetivo("draft", HORA, depois), "draft");
});

test("D-2: registro vencido conta e filtra como publicado, mantendo o status gravado", () => {
  const vencido = comoRegistro({ status: "scheduled", publish_at: "2020-01-01T13:00:00Z", document: { id: "a", title: "A" } });
  const futuro = comoRegistro({ status: "scheduled", publish_at: "2999-01-01T13:00:00Z", document: { id: "b", title: "B" } });
  assert.equal(vencido.statusGravado, "scheduled");
  assert.equal(vencido.status, "published");
  assert.equal(futuro.status, "scheduled");
  const contagem = contarPorStatus([vencido, futuro]);
  assert.equal(contagem.published, 1);
  assert.equal(contagem.scheduled, 1);
  assert.deepEqual(filtrarPosts([vencido, futuro], { status: "scheduled" }).map((r) => r.id), ["b"]);
  const resumo = resumoDaMesa([vencido, futuro]);
  assert.equal(resumo.numeros.agendados, 1);
  assert.deepEqual(resumo.agendados.map((r) => r.id), ["b"]);
});

function raizFalsa() {
  const filhos = [];
  const criar = () => {
    const el = { dataset: {}, attrs: {}, innerHTML: "", ouvintes: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      querySelector(sel) { return sel.includes("fechar") || (sel.includes("acao") && this.innerHTML.includes("mesa-aviso__acao")) ? { addEventListener: (_t, f) => { el.ouvintes[sel] = f; } } : null; },
      remove() { const i = filhos.indexOf(el); if (i >= 0) filhos.splice(i, 1); } };
    return el;
  };
  return { children: filhos, ownerDocument: { createElement: criar }, append(el) { filhos.push(el); } };
}

test("ER13: avisos iguais não se empilham e há no máximo 3 na tela", () => {
  const raiz = raizFalsa();
  const avisos = criarAvisos(raiz);
  avisos.mostrar("Falhou.", { tipo: "erro", duracao: 0 });
  avisos.mostrar("Falhou.", { tipo: "erro", duracao: 0 });
  assert.equal(raiz.children.length, 1);
  for (const n of [1, 2, 3, 4]) avisos.mostrar(`Erro ${n}`, { tipo: "erro", duracao: 0 });
  assert.equal(raiz.children.length, MAXIMO_DE_AVISOS);
  assert.equal(raiz.children[0].attrs.role, "alert");
});

test("ER13: erro sem ação fecha sozinho; erro com ação fica", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const raiz = raizFalsa();
  const avisos = criarAvisos(raiz);
  avisos.mostrar("Sem ação", { tipo: "erro" });
  avisos.mostrar("Com ação", { tipo: "erro", acao: { rotulo: "Tentar de novo", executar() {} } });
  t.mock.timers.tick(12000);
  assert.deepEqual(raiz.children.map((a) => a.dataset.chave), ["erro|Com ação"]);
});

test("Risco publish_at: atualizar agendado já no ar mantém a data exibida no Blog", () => {
  const vencido = comoRegistro({ status: "scheduled", publish_at: "2026-10-20T13:00:00Z", document: { id: "c", title: "C", publishedAt: "2026-10-20" } });
  assert.equal(dataAoPublicar(vencido, "2026-10-20", "2026-10-26"), "2026-10-20");
  const futuro = comoRegistro({ status: "scheduled", publish_at: "2999-01-01T13:00:00Z", document: { id: "d", title: "D", publishedAt: "2999-01-01" } });
  assert.equal(dataAoPublicar(futuro, "2999-01-01", "2026-10-26"), "2026-10-26");
  assert.equal(dataAoPublicar(null, "", "2026-10-26"), "2026-10-26");
});
