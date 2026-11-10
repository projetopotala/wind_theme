import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAccessPanel, renderizarAcessos } from "../../outputs/js/admin/access-panel.js";
import { mensagemDaAprovacao, mensagemDaSolicitacao, renderizarSolicitacoes } from "../../outputs/js/admin/professional-applications.js";
import { secaoQueroAtender, validarSolicitacao } from "../../outputs/js/conta/spa/vistas/quero-atender.js";
import atendimentos from "../../outputs/js/conta/spa/vistas/atendimentos.js";

const ler = (caminho) => readFile(new URL(`../../${caminho}`, import.meta.url), "utf8");
const confirmado = "2026-11-01T10:00:00Z";
const pedido = { id: "11111111-1111-4111-8111-111111111111", status: "pending", specialty: "Reiki", created_at: "2026-11-09T12:00:00Z" };

/* ---------------- Meu Potala ---------------- */

test("sem a função no banco a seção não existe", () => {
  assert.equal(secaoQueroAtender({ disponivel: false, emailVerificadoEm: confirmado }), "");
});

test("conta com e-mail confirmado e sem pedido vê o formulário, sem campos de identidade, papel ou status", () => {
  const html = secaoQueroAtender({ disponivel: true, pedido: null, emailVerificadoEm: confirmado, nomeSugerido: "Ana <b>Lima</b>" });
  assert.match(html, /data-form="profissional"/);
  for (const nome of ["nome", "especialidade", "apresentacao", "telefone"]) assert.match(html, new RegExp(`name="${nome}"`));
  assert.doesNotMatch(html, /name="(user_?id|usuario|status|role|papel|email|published|publicado)"/i);
  assert.match(html, /Ana &lt;b&gt;Lima&lt;\/b&gt;/, "o nome sugerido é escapado");
  assert.match(html, /Aprovar não publica seu perfil/);
});

test("e-mail por confirmar não mostra o formulário", () => {
  const html = secaoQueroAtender({ disponivel: true, pedido: null, emailVerificadoEm: null });
  assert.doesNotMatch(html, /<form/);
  assert.match(html, /data-profissional-estado="sem-email"/);
});

test("estados do pedido: em análise, aprovado e recusado (com novo pedido)", () => {
  const analise = secaoQueroAtender({ disponivel: true, pedido, emailVerificadoEm: confirmado });
  assert.match(analise, /data-profissional-estado="pending"/);
  assert.doesNotMatch(analise, /<form/, "duplicidade evitada também na tela");
  const aprovado = secaoQueroAtender({ disponivel: true, pedido: { ...pedido, status: "approved" }, emailVerificadoEm: confirmado });
  assert.match(aprovado, /data-profissional-estado="approved"/);
  assert.doesNotMatch(aprovado, /<form/);
  const recusado = secaoQueroAtender({ disponivel: true, pedido: { ...pedido, status: "rejected", decision_note: "Faltam <i>dados</i>" }, emailVerificadoEm: confirmado });
  assert.match(recusado, /data-profissional-estado="rejected"/);
  assert.match(recusado, /Faltam &lt;i&gt;dados&lt;\/i&gt;/);
  assert.match(recusado, /data-form="profissional"/);
});

test("validação do formulário espelha o banco", () => {
  const bom = { nome: "Ana Lima", especialidade: "Reiki", apresentacao: "Atendo há dez anos, com foco em ansiedade.", telefone: "(11) 99999-0000" };
  assert.equal(validarSolicitacao(bom).erro, "");
  assert.match(validarSolicitacao({ ...bom, nome: "Al" }).erro, /nome/i);
  assert.match(validarSolicitacao({ ...bom, especialidade: "" }).erro, /especialidade/i);
  assert.match(validarSolicitacao({ ...bom, apresentacao: "curta" }).erro, /atuação/);
  assert.match(validarSolicitacao({ ...bom, telefone: "abc" }).erro, /telefone/i);
  assert.equal(validarSolicitacao({ ...bom, telefone: "" }).erro, "");
  assert.equal(validarSolicitacao({ ...bom, nome: "  Ana Lima  " }).campos.nome, "Ana Lima");
});

test("a vista de Atendimentos mostra o pedido só a quem ainda não atende", () => {
  const base = { atendimentoDisponivel: true, estado: { usuario: { emailVerificadoEm: confirmado, nome: "Ana" } }, solicitacaoProfissional: { disponivel: true, pedido: null } };
  assert.match(atendimentos.renderizar(base), /id="mp-quero-atender"/);
  assert.match(atendimentos.renderizar({ ...base, atendimentoDisponivel: false }), /id="mp-quero-atender"/);
  const profissional = atendimentos.renderizar({ ...base, perfisProfissionais: [{ id: "p1", nome: "Ana" }] });
  assert.doesNotMatch(profissional, /mp-quero-atender/);
  assert.doesNotMatch(atendimentos.renderizar({ ...base, solicitacaoProfissional: { disponivel: false, pedido: null } }), /mp-quero-atender/);
  assert.doesNotMatch(atendimentos.renderizar({ atendimentoDisponivel: true }), /mp-quero-atender/);
});

test("adaptador Supabase: só chama as duas RPCs próprias, sem enviar identidade, e trata a função ausente", async () => {
  const codigo = await ler("outputs/js/conta/adaptadores/supabase.js");
  const trecho = codigo.slice(codigo.indexOf("async solicitacaoProfissional()"), codigo.indexOf("async cancelarAtendimento"));
  assert.match(trecho, /client\.rpc\("my_professional_application"\)/);
  assert.match(trecho, /client\.rpc\("submit_professional_application", \{\s*p_display_name: nome, p_specialty: especialidade, p_presentation: apresentacao, p_phone: telefone \|\| null,\s*\}\)/);
  assert.doesNotMatch(trecho, /user_id|p_user|p_status|p_role|\.from\(/);
  assert.match(trecho, /\["PGRST202", "42883"\]\.includes\(error\.code\)\) return \{ disponivel: false, pedido: null \}/);
});

test("app.js envia só os campos validados e recarrega os dados; mensagens de erro conhecidas existem", async () => {
  const app = await ler("outputs/js/conta/spa/app.js");
  assert.match(app, /closest\?\.\("\[data-form='profissional'\]"\)/);
  assert.match(app, /sessao\.enviarSolicitacaoProfissional\(campos\)/);
  const msgs = await ler("outputs/js/conta/mensagens.js");
  for (const codigo of ["PROFISSIONAL_JA_SOLICITADO", "PROFISSIONAL_CAMPOS", "PROFISSIONAL_LIMITE", "PROFISSIONAL_SEM_PERMISSAO"]) assert.match(msgs, new RegExp(`"${codigo}"`));
});

/* ---------------- Admin ---------------- */

const pendentes = [{ id: "s1", user_id: "u1", email: "ana@x", display_name: "Ana <script>", specialty: "Reiki", presentation: "Texto <b>longo</b> de apresentação", contact_phone: "11 90000-0000", status: "pending", created_at: "2026-11-09T12:00:00Z" }];

test("lista de pedidos: nada aparece sem permissão do banco; tudo é escapado; aprovar e recusar pedem confirmação inline", () => {
  assert.equal(renderizarSolicitacoes({ solicitacoes: null }), "");
  const html = renderizarSolicitacoes({ solicitacoes: pendentes });
  assert.match(html, /Ana &lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|<b>longo/);
  assert.match(html, /data-acao="sol-aprovar" data-solicitacao-id="s1"/);
  assert.doesNotMatch(html, /sol-aprovar-confirmado/);
  const aprovando = renderizarSolicitacoes({ solicitacoes: pendentes, confirmando: "aprovar|s1" });
  assert.match(aprovando, /não publicado/);
  assert.match(aprovando, /data-acao="sol-aprovar-confirmado"/);
  const recusando = renderizarSolicitacoes({ solicitacoes: pendentes, confirmando: "recusar|s1" });
  assert.match(recusando, /data-sol-nota/);
  assert.match(recusando, /data-acao="sol-recusar-confirmado"/);
  assert.match(renderizarSolicitacoes({ solicitacoes: [] }), /Nenhum pedido pendente/);
});

test("a tela de acessos inclui os pedidos antes do vínculo manual", () => {
  const html = renderizarAcessos({ solicitacoes: pendentes });
  assert.ok(html.indexOf("data-solicitacoes") > 0);
  assert.doesNotMatch(renderizarAcessos({ solicitacoes: null }), /data-solicitacoes/);
});

test("mensagens: regra do banco aparece, falha genérica não vaza detalhe, aprovação não promete publicação", () => {
  assert.equal(mensagemDaSolicitacao({ code: "22023", message: "O vínculo desta conta está desativado." }), "O vínculo desta conta está desativado.");
  assert.match(mensagemDaSolicitacao({ code: "42501" }), /owner/);
  assert.match(mensagemDaSolicitacao({ code: "XX000", message: "detalhe interno" }), /Nada foi alterado/);
  assert.match(mensagemDaAprovacao({ changed: true, profile_created: true }), /não publicado/);
  assert.match(mensagemDaAprovacao({ changed: false }), /já estava aprovado/);
});

function painelFalso(respostas) {
  const chamadas = [];
  const ouvintes = {};
  const alvo = { innerHTML: "", addEventListener(t, f) { ouvintes[t] = f; }, querySelector() { return null; } };
  const client = { rpc: async (n, a) => { chamadas.push([n, a]); return respostas[n] || { data: [], error: null }; } };
  const painel = createAccessPanel({ root: { querySelector: () => alvo }, client });
  return { painel, chamadas, ouvintes, alvo };
}
const botao = (attrs, nota) => ({ target: { closest: (seletor) => (seletor === "[data-acao]" ? { getAttribute: (k) => attrs[k] ?? null, closest: () => ({ querySelector: () => (nota === undefined ? null : { value: nota }) }) } : null) } });
const aguardar = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); };

test("painel: Owner aprova com confirmação e a RPC leva só o id; recusa leva o motivo", async () => {
  const f = painelFalso({ admin_list_professional_applications: { data: pendentes, error: null }, admin_approve_professional_application: { data: { changed: true, profile_created: true }, error: null }, admin_reject_professional_application: { data: { changed: true }, error: null } });
  await f.painel.reload();
  assert.match(f.alvo.innerHTML, /data-solicitacoes/);
  f.ouvintes.click(botao({ "data-acao": "sol-aprovar", "data-solicitacao-id": "s1" }));
  assert.equal(f.chamadas.filter((c) => c[0] === "admin_approve_professional_application").length, 0, "clicar não aprova");
  f.ouvintes.click(botao({ "data-acao": "sol-aprovar-confirmado", "data-solicitacao-id": "s1" }));
  await aguardar();
  assert.deepEqual(f.chamadas.find((c) => c[0] === "admin_approve_professional_application")[1], { p_application_id: "s1" });
  assert.match(f.alvo.innerHTML, /Pedido aprovado/);
  f.ouvintes.click(botao({ "data-acao": "sol-recusar-confirmado", "data-solicitacao-id": "s1" }, " Falta formação "));
  await aguardar();
  assert.deepEqual(f.chamadas.find((c) => c[0] === "admin_reject_professional_application")[1], { p_application_id: "s1", p_note: "Falta formação" });
});

test("painel: sem ser o Owner (42501) a seção não aparece e nada quebra", async () => {
  const f = painelFalso({ admin_list_professional_applications: { data: null, error: { code: "42501" } } });
  await f.painel.reload();
  assert.doesNotMatch(f.alvo.innerHTML, /data-solicitacoes/);
});

test("painel: erro de regra do banco é mostrado e a lista é recarregada", async () => {
  const f = painelFalso({
    admin_list_professional_applications: { data: pendentes, error: null },
    admin_approve_professional_application: { data: null, error: { code: "22023", message: "O vínculo desta conta está desativado: reative em Usuários e acessos antes de aprovar." } },
  });
  await f.painel.reload();
  f.ouvintes.click(botao({ "data-acao": "sol-aprovar-confirmado", "data-solicitacao-id": "s1" }));
  await aguardar();
  assert.match(f.alvo.innerHTML, /vínculo desta conta está desativado/);
  assert.equal(f.chamadas.filter((c) => c[0] === "admin_list_professional_applications").length, 2);
});

test("o front não escreve em tabelas nem altera permissões: só RPCs de pedido", async () => {
  const arquivos = await Promise.all(["outputs/js/admin/professional-applications.js", "outputs/js/conta/spa/vistas/quero-atender.js"].map(ler));
  for (const codigo of arquivos) {
    assert.doesNotMatch(codigo, /\.from\(|\.insert\(|\.update\(|\.delete\(|localStorage|sessionStorage/);
    assert.doesNotMatch(codigo, /portal_module_permissions|admin_set_blog_access|blog_editor|is_portal_admin/);
  }
});
