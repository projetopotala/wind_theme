import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  analisarConta, montarPlano, nomesParecidos, normalizarNome, renderizarCadastro, validarEtapa, verificarDuplicidade, PAPEIS_OPERACIONAIS,
} from "../../outputs/js/admin/cadastro-profissional.js";

const ler = (rel) => readFileSync(new URL(`../../outputs/${rel}`, import.meta.url), "utf8");

/* P1B | Cadastro guiado de profissional — sobre os cadastros e funções que já existem. */

const perfis = [
  { id: "p1", display_name: "Ana Maria Souza", email: "ana@exemplo.test", roles: ["client"], active: true, published: false },
  { id: "p2", display_name: "João Pereira", email: "", roles: ["professional"], active: true, published: true },
];

test("duplicidade: e-mail idêntico identifica o cadastro; nome parecido só avisa", () => {
  const porEmail = verificarDuplicidade(perfis, { nome: "Outra Pessoa", email: " ANA@exemplo.test " });
  assert.equal(porEmail.porEmail?.id, "p1");
  const porNome = verificarDuplicidade(perfis, { nome: "joao  pereira", email: "novo@exemplo.test" });
  assert.equal(porNome.porEmail, null);
  assert.deepEqual(porNome.porNome.map((p) => p.id), ["p2"]);
  assert.equal(nomesParecidos("Ana Souza", "Ana Maria Souza"), true, "mesmo primeiro e último nome");
  assert.equal(nomesParecidos("Ana", "Ana Maria Souza"), false, "um só nome não basta");
  assert.equal(normalizarNome("  JOÃO   Pereira "), "joao pereira");
  assert.deepEqual(verificarDuplicidade(perfis, { nome: "Carla Dias", email: "" }), { porEmail: null, porNome: [] });
});

test("conta de acesso: só por e-mail idêntico, nunca por nome; vínculos existentes são respeitados", () => {
  const contas = [
    { id: "u1", email: "ana@exemplo.test", links: [] },
    { id: "u2", email: "joao@exemplo.test", links: [{ profile_id: "p9", display_name: "Outro" }] },
    { id: "u3", email: "ja@exemplo.test", links: [{ profile_id: "p1", display_name: "Ana" }] },
  ];
  const fonte = { contas, perfisProf: [{ profile_id: "p1", linked_user_id: null }, { profile_id: "p5", linked_user_id: "u7" }] };
  assert.equal(analisarConta(fonte, { email: "" }).situacao, "sem-email");
  assert.equal(analisarConta(fonte, { email: "ANA@exemplo.test" }).situacao, "livre");
  assert.equal(analisarConta(fonte, { email: "ninguem@exemplo.test" }).situacao, "nenhuma");
  assert.equal(analisarConta(fonte, { email: "joao@exemplo.test" }).situacao, "vinculada-a-outro");
  assert.equal(analisarConta(fonte, { email: "ja@exemplo.test", perfilId: "p1" }).situacao, "ja-vinculada");
  assert.equal(analisarConta(fonte, { email: "ana@exemplo.test", perfilId: "p5" }).situacao, "perfil-ja-tem-conta");
  assert.equal(analisarConta({ erro: "falha" }, { email: "ana@exemplo.test" }).situacao, "erro");
  assert.equal(analisarConta(fonte, { email: "Ana Maria Souza" }).situacao, "nenhuma", "nome não encontra conta");
});

test("plano: só papéis operacionais, Profissional incluído, publicação desmarcada por padrão", () => {
  const novo = montarPlano({ nome: " Carla Dias ", email: "CARLA@exemplo.test", telefone: "11 9999", ativo: true });
  assert.deepEqual(novo.perfil, { display_name: "Carla Dias", email: "carla@exemplo.test", phone: "11 9999", roles: ["professional"], active: true, published: false });
  assert.equal(novo.vincular, false);
  const existente = montarPlano({ telefone: "11 8888", ativo: true, publicar: false }, { ...perfis[0], roles: ["client", "admin", "owner"] });
  assert.deepEqual(existente.perfil.roles, ["client", "professional"], "papéis fora da lista nunca passam");
  assert.equal(existente.perfil.id, "p1");
  assert.equal(existente.perfil.phone, "11 8888", "telefone só preenche se estava vazio");
  assert.equal("display_name" in existente.perfil, false, "não sobrescreve o nome do cadastro existente");
  for (const r of existente.perfil.roles) assert.ok(PAPEIS_OPERACIONAIS.includes(r));
  assert.equal(montarPlano({ vincular: true, contaId: "" }).vincular, false, "sem conta não há vínculo");
  assert.equal(montarPlano({ vincular: true, contaId: "u1", nome: "x" }).vincular, true);
});

test("validação de cada etapa", () => {
  assert.match(validarEtapa(1, { nome: "  " }), /nome completo/);
  assert.equal(validarEtapa(1, { nome: "Carla" }), "");
  assert.match(validarEtapa(2, { email: "carla@" }), /incompleto/);
  assert.equal(validarEtapa(2, { email: "" }), "", "e-mail é opcional");
  assert.match(validarEtapa(3, { duplicidade: { porEmail: perfis[0], porNome: [] } }), /Já existe/);
  assert.equal(validarEtapa(3, { existenteId: "p1", duplicidade: { porEmail: perfis[0], porNome: [] } }), "");
  assert.match(validarEtapa(3, { duplicidade: { porEmail: null, porNome: [perfis[1]] } }), /nome parecido/);
  assert.equal(validarEtapa(3, { confirmaOutraPessoa: true, duplicidade: { porEmail: null, porNome: [perfis[1]] } }), "");
});

test("telas: etapas nomeadas, avisos claros e nenhum campo sem persistência", () => {
  const base = { etapa: 1, nome: "", email: "", telefone: "", ativo: true, publicar: false };
  const t1 = renderizarCadastro(base, perfis);
  assert.match(t1, /aria-current="step"/);
  assert.match(t1, /não cria conta de acesso/);
  assert.match(t1, /não dá acesso administrativo/);
  const t5 = renderizarCadastro({ ...base, etapa: 5 }, perfis);
  assert.match(t5, /name="publicar" >/, "publicação desmarcada");
  assert.match(t5, /name="ativo" checked/);
  const nomes = [...[1, 2, 3, 4, 5, 6].flatMap((n) => [...renderizarCadastro({ ...base, etapa: n, duplicidade: { porEmail: null, porNome: [] }, contasCarregadas: { contas: [] } }, perfis).matchAll(/name="([a-zA-Z]+)"/g)].map((m) => m[1]))];
  assert.deepEqual([...new Set(nomes)].sort(), ["ativo", "email", "nome", "publicar", "telefone"].sort(), "só campos gravados (ou escolhas do próprio fluxo)");
  assert.match(renderizarCadastro({ ...base, etapa: 2 }, perfis), /Especialidades e biografia ainda não têm campo próprio/);
  const t6 = renderizarCadastro({ ...base, etapa: 6, nome: "Carla", email: "c@e.test" }, perfis);
  assert.match(t6, /Salvar cadastro/);
  assert.match(t6, /Não muda: acessos administrativos/);
  const t7 = renderizarCadastro({ etapa: 7, resultado: { nome: "Carla", ativo: true, publicado: false, vinculado: false } }, perfis);
  assert.match(t7, /<li data-ok="nao"><span aria-hidden="true">•<\/span> Disponível publicamente/, "publicação pendente fica marcada como pendente");
  assert.match(t7, /data-cg-ir="atendimentos"/);
  assert.doesNotMatch(renderizarCadastro({ ...base, nome: '<img src=x onerror=alert(1)>' }, perfis), /<img src=x/);
});

test("segurança: o fluxo não cria conta, não concede papéis de portal e usa só funções existentes", () => {
  const js = ler("js/admin/cadastro-profissional.js").replace(/\/\*[\s\S]*?\*\//g, "");
  const rpcs = [...js.matchAll(/rpc\("([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(rpcs)].sort(), ["admin_link_professional", "admin_list_accounts", "admin_list_professional_profiles"]);
  assert.doesNotMatch(js, /signUp|auth\.admin|service_role|admin_set_blog_access|portal_role\s*:|"owner"|'owner'|"admin"\s*\]|blog_editor/);
  assert.match(js, /operations\.command\("person\.save"/);
  const motor = ler("js/admin/operations/schedule.js");
  assert.match(motor, /\['client','student','participant','professional'\]\.includes\(role\)/, "o comando de Pessoas só aceita papéis operacionais");
  assert.match(motor, /E-mail já cadastrado para outra pessoa/, "o comando recusa e-mail repetido");
});

test("o painel liga o fluxo e o atalho da Visão geral abre o cadastro guiado", () => {
  assert.match(ler("js/admin/admin-entry.js"), /createCadastroGuiado\(\{/);
  assert.match(ler("js/admin/operations/views.js"), /data-cadastro-guiado>Cadastro guiado de profissional</);
  assert.match(ler("js/admin/admin-tarefas.js"), /guiado: "\[data-cadastro-guiado\]"/);
  assert.match(ler("admin.html"), /<link rel="stylesheet" href="\/css\/cadastro-profissional\.css">/);
});
