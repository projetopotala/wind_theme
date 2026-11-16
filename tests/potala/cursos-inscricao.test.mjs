import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { montarCartao, pedirInscricao, prepararCurso } from "../../outputs/js/cursos/catalogo-publico.js";
import vista, { pedidosDeInscricao, SITUACAO_DO_PEDIDO } from "../../outputs/js/conta/spa/vistas/cursos.js";
import { acoesPermitidas, renderizarInscricoes } from "../../outputs/js/admin/inscricoes-cursos.js";

const ler = (c) => readFileSync(new URL(`../../${c}`, import.meta.url), "utf8");
const fakeDoc = () => {
  const no = (tag) => ({ tag, children: [], attrs: {}, _t: "", appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; }, set textContent(v) { this._t = v; }, get textContent() { return this._t + this.children.map((x) => x.textContent).join(""); }, find(p, a = []) { if (p(this)) a.push(this); this.children.forEach((c) => c.find && c.find(p, a)); return a; } });
  return { createElement: no, createTextNode: (t) => ({ textContent: t }) };
};
const TURMA = { id: "t1", title: "Curso", capacity: 3, spots_left: 2, availability: "aberta", price_cents: 15000, next_session: { starts_at: "2099-01-10T13:00:00Z" } };

test("turma aberta mostra 'Inscrever-se'; lotada nao", () => {
  const a = montarCartao(fakeDoc(), prepararCurso(TURMA));
  assert.equal(a.find((n) => n.attrs?.["data-inscrever"] === "t1").length, 1);
  const b = montarCartao(fakeDoc(), prepararCurso({ ...TURMA, availability: "esgotado", spots_left: 0 }));
  assert.equal(b.find((n) => n.attrs?.["data-inscrever"]).length, 0);
});

test("pedido de inscricao: sem sessao pede login; codigos do banco viram mensagens", async () => {
  const chamadas = [];
  const cliente = (sessao, resp) => async () => ({ auth: { getSession: async () => ({ data: { session: sessao } }) }, rpc: async (n, a) => { chamadas.push([n, a]); return resp; } });
  assert.deepEqual(await pedirInscricao("t1", "k", { obterCliente: cliente(null) }), { estado: "entrar" });
  assert.equal(chamadas.length, 0);
  assert.deepEqual(await pedirInscricao("t1", "k", { obterCliente: cliente({}, { data: { status: "solicitada" } }) }), { estado: "solicitada" });
  assert.deepEqual(chamadas[0], ["request_course_enrollment", { p_idempotency_key: "k", p_offering_id: "t1" }]);
  for (const [code, estado] of [["23514", "lotada"], ["PT409", "ja-inscrito"], ["22023", "fechada"], ["42501", "confirmar-email"], ["X", "erro"]]) {
    assert.deepEqual(await pedirInscricao("t1", "k", { obterCliente: cliente({}, { error: { code } }) }), { estado }, code);
  }
});

test("Meu Potala: estados claros; solicitada nunca aparece como matriculado; cancelar so antes de pagar", () => {
  assert.equal(SITUACAO_DO_PEDIDO.solicitada[0], "Inscrição solicitada");
  const html = pedidosDeInscricao([
    { id: "1", status: "solicitada", course_title: "<b>A</b>", price_cents: 15000, mode: "online" },
    { id: "2", status: "aguardando_pagamento", course_title: "B", price_cents: 100 },
    { id: "3", status: "matriculada", course_title: "C", price_cents: 0 },
  ]);
  assert.doesNotMatch(html, /<b>A<\/b>/);
  assert.match(html, /Inscrição solicitada[\s\S]*Aguardando pagamento[\s\S]*Matriculado/);
  assert.equal((html.match(/data-form="cancelar-inscricao-curso"/g) || []).length, 2, "matriculada nao tem cancelar do aluno");
  const so = vista.renderizar({ inscricoes: [], progressos: [], agora: new Date(), inscricoesCursos: [{ id: "1", status: "solicitada", course_title: "A" }] });
  assert.match(so, /Seus pedidos de inscrição/);
  const app = ler("outputs/js/conta/spa/app.js");
  assert.match(app, /sessao\.inscricoesCursos\(\)/);
  assert.match(app, /await sessao\.cancelarInscricaoCurso\(id\)/);
});

test("fila do Owner: acoes por estado e nenhuma acao de 'marcar pago'", () => {
  assert.deepEqual(acoesPermitidas("solicitada", 0).map((a) => a[0]), ["aprovar", "recusar", "cancelar"]);
  assert.match(acoesPermitidas("solicitada", 0)[0][1], /matricular/);
  assert.match(acoesPermitidas("solicitada", 100)[0][1], /aguardar pagamento/);
  assert.deepEqual(acoesPermitidas("aguardando_pagamento", 100).map((a) => a[0]), ["recusar", "cancelar"]);
  assert.deepEqual(acoesPermitidas("matriculada", 0).map((a) => a[0]), ["cancelar"]);
  assert.deepEqual(acoesPermitidas("cancelada", 0), []);
  const html = renderizarInscricoes([{ id: "r1", status: "solicitada", course_title: "<i>X</i>", student_name: "Ana", student_email: "a@x", price_cents: 15000, capacity: 3, seats_taken: 1, created_at: "2026-11-16T09:00:00Z", updated_at: "2026-11-16T09:00:00Z" }]);
  assert.match(html, /2 de 3 vagas livres/);
  assert.doesNotMatch(html, /<i>X<\/i>/);
  const decisoes = [...html.matchAll(/data-ic-decidir="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(decisoes.length && decisoes.every((d) => ["aprovar", "recusar", "cancelar"].includes(d)), "so aprovar/recusar/cancelar");
  const src = ler("outputs/js/admin/inscricoes-cursos.js");
  assert.doesNotMatch(src, /confirm_course_enrollment_payment/);
  assert.match(ler("outputs/js/admin/operations/views.js"), /data-inscricoes-cursos="">Inscrições de cursos/);
});

test("nenhum codigo do navegador chama a confirmacao de pagamento", () => {
  for (const f of ["outputs/js/cursos/catalogo-publico.js", "outputs/js/conta/adaptadores/supabase.js", "outputs/js/admin/inscricoes-cursos.js", "outputs/js/conta/spa/app.js"]) {
    assert.doesNotMatch(ler(f), /confirm_course_enrollment_payment/, f);
  }
});
