import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { centavosParaReais, dadosDoCurso, montarPlanoNovoCurso, novoFormulario, reaisParaCentavos, renderizarNovoCurso, validarNovoCurso } from "../../outputs/js/admin/novo-curso.js";
import { simularPlano } from "../../outputs/js/admin/organizar-curso.js";
import { montarCartaoInteresse, precoLegivel, prepararCurso, prepararCursoSemTurma, registrarInteresse } from "../../outputs/js/cursos/catalogo-publico.js";

const S = {
  activity_definitions: [{ id: "d-yoga", title: "Curso de Yoaga", kind: "course" }, { id: "d-atend", title: "Meditação", kind: "appointment" }],
  activity_offerings: [{ id: "o-yoga", title: "Curso Yoaga", definition_id: "d-yoga", professional_id: "prof", mode: "online", capacity: 2 }],
  profiles: [{ id: "prof", display_name: "Professora", roles: ["professional"], active: true }, { id: "cli", display_name: "Cliente", roles: ["client"], active: true }],
  rooms: [{ id: "sala", name: "Sala 1", status: "available", capacity: 10, code: "S1" }],
  enrollments: [], schedule_items: [], offering_professionals: [],
};
const amanha = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);

test("valor em reais vira centavos inteiros", () => {
  for (const [entrada, saida] of [["150", 15000], ["150,5", 15050], ["150,50", 15050], ["R$ 1.200,00", 120000], ["1.200", 120000], ["0", 0], ["99.90", 9990], ["", null], ["abc", null], ["-5", null], ["1,234", null]]) {
    assert.equal(reaisParaCentavos(entrada), saida, entrada);
  }
  assert.equal(centavosParaReais(15050), "150,50");
});

test("validacao: nome, descricao para publicar, turma completa para abrir inscricoes", () => {
  const base = { ...novoFormulario(), nome: "Curso novo" };
  assert.deepEqual(validarNovoCurso(base, S), [], "rascunho sem turma e valido");
  assert.match(validarNovoCurso({ ...base, nome: "" }, S).join(), /nome/);
  assert.match(validarNovoCurso({ ...base, nome: "curso de yoaga" }, S).join(), /Já existe/);
  assert.match(validarNovoCurso({ ...base, publicar: true }, S).join(), /descrição/);
  assert.match(validarNovoCurso({ ...base, valor: "abc" }, S).join(), /Valor inválido/);
  assert.match(validarNovoCurso({ ...base, imagem: "https://x/y.jpg" }, S).join(), /media/);
  const comTurma = { ...base, descricao: "d", publicar: true, comTurma: true };
  const erros = validarNovoCurso(comTurma, S).join(" | ");
  assert.match(erros, /professor/); assert.match(erros, /vagas/); assert.match(erros, /valor/); assert.match(erros, /primeira aula/);
  assert.match(validarNovoCurso({ ...comTurma, professorId: "prof", capacidade: "5", valor: "0", aula: { data: "2020-01-01", inicio: "10:00", fim: "11:00" } }, S).join(), /futuro/);
  assert.match(validarNovoCurso({ ...comTurma, modalidade: "presencial", professorId: "prof", capacidade: "5", valor: "0", aula: { data: amanha, inicio: "10:00", fim: "11:00", salaId: "" } }, S).join(), /sala/);
  assert.deepEqual(validarNovoCurso({ ...comTurma, professorId: "prof", capacidade: "5", valor: "120", aula: { data: amanha, inicio: "10:00", fim: "11:00" } }, S), []);
});

test("plano usa os comandos oficiais e o motor da operacao aceita (curso novo com turma e aula)", () => {
  const dados = { ...novoFormulario(), nome: "TESTE INTERNO Novo", descricao: "Descrição", valor: "150,00", publicar: true, comTurma: true, professorId: "prof", capacidade: "4", aula: { data: amanha, inicio: "10:00", fim: "11:00", salaId: "", link: "https://meet.exemplo.com/x" } };
  const passos = montarPlanoNovoCurso(dados, S);
  assert.deepEqual(passos.map((p) => p.tipo), ["definition.save", "offering.save", "schedule.save"]);
  assert.equal(passos[0].payload.price_cents, 15000);
  assert.equal(passos[0].payload.published, true);
  assert.deepEqual(passos[1].payload.definition_id, { ref: "curso" });
  assert.equal(passos[1].payload.capacity, 4);
  const r = simularPlano(S, passos);
  assert.equal(r.ok, true, r.erro);
});

test("editar curso existente: mesmos ids, sem criar outro; sem turma nao gera turma nem aula", () => {
  const dados = { ...dadosDoCurso(S, "d-yoga"), descricao: "Nova descrição", valor: "200" };
  assert.equal(dados.turmaId, "o-yoga");
  const passos = montarPlanoNovoCurso(dados, S);
  assert.equal(passos[0].payload.id, "d-yoga");
  assert.equal(passos[1].payload.id, "o-yoga");
  assert.equal(passos.length, 2, "sem aula nova");
  assert.equal(simularPlano(S, passos).ok, true);
  assert.deepEqual(montarPlanoNovoCurso({ ...novoFormulario(), nome: "Só curso" }, S).map((p) => p.tipo), ["definition.save"]);
});

test("tela: so cursos (nao atendimentos) na lista; texto escapado; interessados do curso", () => {
  const html = renderizarNovoCurso({ ...dadosDoCurso(S, "d-yoga"), nome: "<b>x</b>" }, S, { interessados: [{ course_id: "d-yoga", name: "Ana", email: "ana@x.test" }, { course_id: "outro", name: "Bia", email: "b@x" }] });
  assert.match(html, /Curso de Yoaga \(rascunho\)/);
  assert.doesNotMatch(html, /Meditação/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /Interessados \(1\)/);
  assert.match(html, /ana@x\.test/);
  assert.doesNotMatch(html, /b@x/);
});

test("painel: botao 'Novo curso' e principal; Organizar continua como opcao", () => {
  const views = readFileSync(new URL("../../outputs/js/admin/operations/views.js", import.meta.url), "utf8");
  assert.match(views, /op-primary" data-novo-curso="">Novo curso<\/button><button type="button" class="op-button" data-organizar-curso/);
  assert.match(readFileSync(new URL("../../outputs/js/admin/admin-entry.js", import.meta.url), "utf8"), /createNovoCurso\(\{ root: panel, operations, client/);
});

test("catalogo: preco em centavos, gratuito, sem preco nos cursos sem turma", () => {
  assert.equal(precoLegivel({ price_cents: 15000 }).replace(/\s/g, " "), "R$ 150,00");
  assert.equal(precoLegivel({ price_cents: 0 }), "Gratuito");
  assert.equal(precoLegivel({ price_cents: null }), "");
  assert.equal(prepararCurso({ id: "t", title: "T", price_cents: 9990 }).valor.replace(/\s/g, " "), "R$ 99,90");
  const c = prepararCursoSemTurma({ id: "d", title: "Curso", summary: "S", price_cents: 100, image: "https://x/y.jpg" });
  assert.equal("valor" in c, false);
  assert.equal(c.imagem, "");
});

test("cartao de interesse escapa texto e tem botao 'Tenho interesse'", () => {
  const no = (tag) => ({ tag, children: [], attrs: {}, _t: "", appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; }, set textContent(v) { this._t = v; }, get textContent() { return this._t + this.children.map((x) => x.textContent).join(""); } });
  const doc = { createElement: no, createTextNode: (t) => ({ textContent: t }) };
  const art = montarCartaoInteresse(doc, prepararCursoSemTurma({ id: "d1", title: "<img src=x>", summary: "S" }));
  assert.match(art.textContent, /<img src=x>/);
  assert.match(art.textContent, /Tenho interesse/);
});

test("registrar interesse: sem sessao pede login; com sessao usa a funcao do banco", async () => {
  const chamadas = [];
  const cliente = (sessao, resposta) => async () => ({ auth: { getSession: async () => ({ data: { session: sessao } }) }, rpc: async (n, a) => { chamadas.push([n, a]); return resposta; } });
  assert.deepEqual(await registrarInteresse("d1", { obterCliente: cliente(null) }), { estado: "entrar" });
  assert.equal(chamadas.length, 0, "sem sessao nao chama o banco");
  assert.deepEqual(await registrarInteresse("d1", { obterCliente: cliente({}, { data: { registered: true, new: true } }) }), { estado: "registrado" });
  assert.deepEqual(chamadas[0], ["register_course_interest", { p_course_id: "d1" }]);
  assert.deepEqual(await registrarInteresse("d1", { obterCliente: cliente({}, { data: { new: false } }) }), { estado: "ja-registrado" });
  assert.deepEqual(await registrarInteresse("d1", { obterCliente: cliente({}, { error: { code: "22023" } }) }), { estado: "erro" });
});

test("falha durante o salvamento guarda os ids gravados para continuar sem duplicar", () => {
  const src = readFileSync(new URL("../../outputs/js/admin/novo-curso.js", import.meta.url), "utf8");
  assert.match(src, /dados = \{ \.\.\.dados, cursoId: r\.refs\.curso \|\| dados\.cursoId, turmaId: r\.refs\.turma \|\| dados\.turmaId \}/);
  /* com o id gravado, o plano seguinte atualiza (tem id) em vez de criar */
  const dados = { ...novoFormulario(), cursoId: "d-yoga", nome: "Curso de Yoaga" };
  assert.equal(montarPlanoNovoCurso(dados, S)[0].payload.id, "d-yoga");
  assert.deepEqual(validarNovoCurso(dados, S), [], "nao acusa nome repetido do proprio curso");
});
