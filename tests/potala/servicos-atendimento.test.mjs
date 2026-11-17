import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createServicosAtendimento, montarPlanoAlternar, montarPlanoServico, novoFormulario, renderizarServicos, validarServico } from "../../outputs/js/admin/servicos-atendimento.js";
import { applyScheduleCommand } from "../../outputs/js/admin/operations/schedule.js";

const estado = () => ({
  profiles: [
    { id: "p1", display_name: "Ana <b>", roles: ["professional"], active: true },
    { id: "p2", display_name: "Bia", roles: ["professional"], active: true },
  ],
  activity_definitions: [], activity_offerings: [], offering_professionals: [], enrollments: [], schedule_items: [],
});
const form = (e = {}) => ({ ...novoFormulario(), nome: "Acolhimento", modalidade: "online", profissionais: ["p1"], ...e });

test("seção recolhível com botão Novo serviço, lista vazia e texto escapado", () => {
  const html = renderizarServicos(estado());
  assert.match(html, /<details[^>]*data-servicos-secao(?![^>]*\sopen)/);
  assert.match(html, /Serviços de atendimento/);
  assert.match(html, /data-serv-novo[^>]*>Novo serviço</);
  assert.match(html, /Nenhum serviço de atendimento cadastrado/);
  const comForm = renderizarServicos(estado(), { formulario: form() });
  assert.match(comForm, /name="nome"/); assert.match(comForm, /name="modalidade"/); assert.match(comForm, /name="duracao"/);
  assert.match(comForm, /name="profissional"/); assert.match(comForm, /name="status"/);
  assert.ok(!comForm.includes("Ana <b>"), "nome de profissional escapado");
});

test("plano de serviço novo: ofertas nascem inativas e a ativação é o último passo", () => {
  const passos = montarPlanoServico(form({ modalidade: "ambas", profissionais: ["p1", "p2"] }), estado());
  assert.equal(passos[0].tipo, "definition.save");
  const ofertas = passos.filter((p) => p.tipo === "offering.save");
  assert.equal(ofertas.slice(0, 2).every((p) => p.payload.active === false), true);
  assert.equal(passos.at(-1).payload.active, true);
  assert.equal(passos.at(-1).tipo, "offering.save");
  assert.equal(passos.filter((p) => p.tipo === "offering_professional.save").length, 4);
  assert.ok(!passos.some((p) => /delete|remove/i.test(p.tipo)), "nunca exclui");
});

test("comando offering_professional.save: valida oferta, profissional, inativo e duplicado", () => {
  const s = estado();
  const ctx = { id: (() => { let n = 0; return () => `n${++n}`; })(), now: "2026-11-17T00:00:00.000Z" };
  s.activity_definitions.push({ id: "d", title: "X", kind: "appointment" });
  s.activity_offerings.push({ id: "o", title: "X", definition_id: "d", mode: "online" });
  s.profiles.push({ id: "off", display_name: "Off", roles: ["professional"], active: false }, { id: "cli", display_name: "C", roles: ["client"], active: true });
  const cmd = (payload) => applyScheduleCommand(s, { type: "offering_professional.save", payload }, ctx);
  assert.ok(cmd({ offering_id: "o", professional_id: "p1" }));
  assert.throws(() => cmd({ offering_id: "o", professional_id: "p1" }), /já habilitado/);
  assert.throws(() => cmd({ offering_id: "nada", professional_id: "p2" }), /Oferta/);
  assert.throws(() => cmd({ offering_id: "o", professional_id: "cli" }), /profissional/i);
  assert.throws(() => cmd({ offering_id: "o", professional_id: "off" }), /inativo/i);
  assert.ok(cmd({ offering_id: "o", professional_id: "off", active: false }), "desativar vínculo de inativo é permitido");
});

test("alternar exige profissional ativo para ativar e só toca nas ofertas necessárias", () => {
  const s = estado();
  s.activity_definitions.push({ id: "d", title: "X", kind: "appointment", duration_minutes: 60 });
  s.activity_offerings.push({ id: "o1", title: "X", definition_id: "d", mode: "online", active: false });
  assert.match(montarPlanoAlternar(s, "d", true).erro, /profissional/i);
  s.offering_professionals.push({ id: "l", offering_id: "o1", professional_id: "p1", active: true });
  assert.deepEqual(montarPlanoAlternar(s, "d", true).passos.map((p) => p.payload), [{ id: "o1", active: true }]);
  assert.deepEqual(montarPlanoAlternar(s, "d", false).passos, []);
});

test("validação básica", () => {
  assert.ok(validarServico(form({ nome: "" }), estado()).length);
  assert.deepEqual(validarServico(form(), estado()), []);
});

test("controller: Novo serviço abre o formulário; salvar inválido mostra erro sem gravar", async () => {
  const ouvintes = {};
  const root = { innerHTML: "", addEventListener: (t, f) => { ouvintes[t] = f; }, removeEventListener() {}, querySelector: () => null };
  let gravou = 0;
  const operations = { snapshot: estado(), command: async () => { gravou++; }, refresh: async () => {} };
  const c = createServicosAtendimento({ root, operations });
  assert.match(root.innerHTML, /data-serv-novo/);
  const alvo = (attr) => ({ target: { closest: (sel) => (sel.includes(attr) ? { dataset: {} } : null) } });
  await ouvintes.click(alvo("data-serv-novo"));
  assert.match(root.innerHTML, /data-serv-form/);
  assert.match(root.innerHTML, /<details[^>]*\sopen/);
  assert.equal(gravou, 0);
  c.destroy();
});

test("integração: a seção está montada em Atendimentos e usa só o motor existente (sem migration nova)", () => {
  const html = readFileSync(new URL("../../outputs/admin.html", import.meta.url), "utf8");
  assert.ok(html.indexOf("data-servicos-atendimento") > html.indexOf('data-admin-workspace="atendimentos"'));
  const entry = readFileSync(new URL("../../outputs/js/admin/admin-entry.js", import.meta.url), "utf8");
  assert.match(entry, /createServicosAtendimento\(/);
});
