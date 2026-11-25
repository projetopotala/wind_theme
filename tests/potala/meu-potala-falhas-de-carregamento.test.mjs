import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import inicio from "../../outputs/js/conta/spa/vistas/inicio.js";
import cursos from "../../outputs/js/conta/spa/vistas/cursos.js";
import agenda from "../../outputs/js/conta/spa/vistas/agenda.js";
import atendimentos from "../../outputs/js/conta/spa/vistas/atendimentos.js";
import { falhaDeCarregamento, leituraFalhou, vazioOuFalha } from "../../outputs/js/conta/spa/vistas/comum.js";

/*
 * Consulta vazia (terminou bem, sem registros) NAO e consulta com erro (nao carregou).
 * Quando a leitura de uma colecao falha, a tela nao pode dizer "nada marcado": a pessoa
 * entenderia que nao tem nada. Cada colecao falha sozinha; as outras continuam inteiras.
 */
const agora = new Date("2026-11-25T12:00:00-03:00");
const base = {
  historico: [], inscricoes: [], progressos: [], agenda: [], salvos: [], acompanhando: [], notificacoes: [], preferencias: [],
  atendimentos: [], inscricoesCursos: [], opcoesAtendimento: [], horariosAtendimento: [], agendaProfissional: [],
  aulasDoProfessor: [], perfisProfissionais: [], textosDoBlog: [], agora, atendimentoDisponivel: true,
  estado: { status: "autenticado", usuario: { id: "u1" } }, parametros: new URLSearchParams(""),
};
const comFalha = (...nomes) => ({ ...base, falhas: nomes });
const semFalha = () => ({ ...base, falhas: [] });

const FRASES_DE_VAZIO = [
  /Nada marcado por enquanto/, /Nada esperando por você agora/, /Nenhum compromisso marcado/, /Nenhum compromisso pela frente/,
  /Você ainda não está em nenhum curso/, /Nenhum curso por enquanto/, /Você ainda não pediu nenhum atendimento/,
  /Toque em “Salvar”/,
];
const semNenhumVazio = (html) => FRASES_DE_VAZIO.forEach((frase) => assert.doesNotMatch(html, frase, `não deve conter ${frase}`));
const temFalha = (html) => {
  assert.match(html, /data-falha-carregamento/);
  assert.match(html, /role="alert"/);
  assert.match(html, /data-acao="recarregar"[^>]*>Tentar novamente</);
};

test("ajudantes: leituraFalhou olha só os nomes pedidos e a falha traz 'Tentar novamente' acessível", () => {
  assert.equal(leituraFalhou(["agenda"], "agenda", "salvos"), true);
  assert.equal(leituraFalhou(["agenda"], "salvos"), false);
  assert.equal(leituraFalhou(undefined, "agenda"), false);
  assert.equal(leituraFalhou([], "agenda"), false);
  temFalha(falhaDeCarregamento({ texto: "x" }));
  assert.match(vazioOuFalha({ falhas: [], colecoes: ["agenda"], texto: "Vazio aqui" }), /Vazio aqui/);
  assert.doesNotMatch(vazioOuFalha({ falhas: [], colecoes: ["agenda"], texto: "Vazio aqui" }), /falha-de-carregamento/);
  assert.doesNotMatch(vazioOuFalha({ falhas: ["agenda"], colecoes: ["agenda"], texto: "Vazio aqui" }), /Vazio aqui/);
});

test("Início: leitura que terminou bem e veio vazia mostra os estados vazios habituais", () => {
  const html = inicio.renderizar(semFalha());
  assert.doesNotMatch(html, /data-falha-carregamento/);
  assert.match(html, /Nada marcado por enquanto/);
  assert.match(html, /Nada esperando por você agora/);
  assert.match(html, /Você ainda não está em nenhum curso/);
  assert.match(html, /Nenhum compromisso marcado/);
  assert.match(html, /Toque em “Salvar”/);
});

test("Início: tudo falhou → só falhas, nenhuma frase de 'nada marcado'", () => {
  const html = inicio.renderizar(comFalha("agenda", "atendimentos", "inscricoes", "inscricoesCursos", "notificacoes", "preferencias", "salvos"));
  temFalha(html);
  semNenhumVazio(html);
  assert.ok((html.match(/data-falha-carregamento/g) || []).length >= 4);
});

test("Início: a falha da agenda não apaga os outros blocos (cursos e salvos seguem com o estado correto)", () => {
  const html = inicio.renderizar(comFalha("agenda"));
  temFalha(html);
  assert.doesNotMatch(html, /Nenhum compromisso marcado/);
  assert.doesNotMatch(html, /Nada marcado por enquanto/);
  assert.match(html, /Você ainda não está em nenhum curso/, "cursos carregaram vazios");
  assert.match(html, /Toque em “Salvar”/, "salvos carregaram vazios");
  const salvos = html.slice(html.indexOf('id="mp-inicio-salvos"'));
  assert.doesNotMatch(salvos.slice(0, salvos.indexOf("</section>")), /data-falha-carregamento/);
});

test("Início: a falha de salvos mostra falha só no bloco de salvos", () => {
  const html = inicio.renderizar(comFalha("salvos"));
  const salvos = html.slice(html.indexOf('id="mp-inicio-salvos"'));
  assert.match(salvos.slice(0, salvos.indexOf("</section>")), /data-falha-carregamento/);
  assert.doesNotMatch(html, /Toque em “Salvar”/);
  assert.match(html, /Nenhum compromisso marcado/);
});

test("Início: com dados presentes, a falha de outra coleção não esconde o que carregou", () => {
  const dados = { ...comFalha("salvos"), agenda: [{ id: "a1", titulo: "Prática em casa", tipo: "pessoal", origem: "pessoal", inicio: "2026-11-26T10:00:00-03:00" }] };
  const html = inicio.renderizar(dados);
  assert.match(html, /Prática em casa/);
});

test("Cursos: vazio de verdade vs. falha", () => {
  assert.match(cursos.renderizar(semFalha()), /Nenhum curso por enquanto/);
  assert.doesNotMatch(cursos.renderizar(semFalha()), /data-falha-carregamento/);
  const html = cursos.renderizar(comFalha("inscricoes"));
  temFalha(html);
  semNenhumVazio(html);
});

test("Cursos: falha das inscrições com pedidos já carregados mostra os pedidos E a falha", () => {
  const pedido = { id: "p1", status: "solicitada", course_title: "Curso Exemplo", mode: "online", price_cents: 1000, created_at: "2026-11-20T10:00:00-03:00" };
  const html = cursos.renderizar({ ...comFalha("inscricoes"), inscricoesCursos: [pedido] });
  temFalha(html);
  assert.match(html, /Curso Exemplo/);
  assert.doesNotMatch(html, /Nenhum curso por enquanto/);
});

test("Cursos: falha de outra coleção (agenda) não interfere", () => {
  const html = cursos.renderizar(comFalha("agenda"));
  assert.match(html, /Nenhum curso por enquanto/);
  assert.doesNotMatch(html, /data-falha-carregamento/);
});

test("Agenda: vazio de verdade vs. falha, e o formulário de anotar continua", () => {
  assert.match(agenda.renderizar(semFalha()), /Nenhum compromisso pela frente/);
  assert.doesNotMatch(agenda.renderizar(semFalha()), /data-falha-carregamento/);
  const html = agenda.renderizar(comFalha("agenda"));
  temFalha(html);
  semNenhumVazio(html);
  assert.match(html, /data-form="compromisso"/);
  assert.match(agenda.renderizar(comFalha("salvos")), /Nenhum compromisso pela frente/);
});

test("Atendimentos (cliente): sem pedidos de verdade mostra o convite; com falha, só a falha", () => {
  const vazio = atendimentos.renderizar(semFalha());
  assert.match(vazio, /Você ainda não pediu nenhum atendimento/);
  assert.match(vazio, /Solicitar um atendimento/);
  const html = atendimentos.renderizar(comFalha("atendimentos"));
  temFalha(html);
  semNenhumVazio(html);
  assert.doesNotMatch(html, /Solicitar um atendimento|mp-atendimentos-resumo/);
  assert.match(atendimentos.renderizar(comFalha("agenda")), /Você ainda não pediu nenhum atendimento/);
});

test("Atendimentos (cliente): com pedidos carregados nada de falha, mesmo se a lista de falhas citar outra coleção", () => {
  const pedido = { id: "c3d1a4f2-0000-4000-8000-000000000001", servico: "Escuta", modalidade: "online", status: "recebida" };
  const html = atendimentos.renderizar({ ...comFalha("salvos"), atendimentos: [pedido] });
  assert.match(html, /Escuta/);
  assert.doesNotMatch(html, /data-falha-carregamento/);
});

test("Atendimentos (profissional): agenda que não carregou não vira 'Nenhuma consulta'", () => {
  const prof = { perfisProfissionais: [{ id: "p1", nome: "X" }] };
  const ok = atendimentos.renderizar({ ...semFalha(), ...prof });
  assert.match(ok, /Nenhuma consulta futura atribu/);
  const html = atendimentos.renderizar({ ...comFalha("agendaProfissional"), ...prof });
  temFalha(html);
  assert.match(html, /id="mp-agenda-profissional"/);
  assert.doesNotMatch(html, /Nenhuma consulta futura atribu/);
});

test("app.js entrega as falhas às telas e o botão 'recarregar' refaz a leitura", () => {
  const app = readFileSync(new URL("../../outputs/js/conta/spa/app.js", import.meta.url), "utf8");
  assert.match(app, /dados\.falhas = respostas\.filter\(\(resposta\) => resposta\.erro\)/);
  assert.match(app, /const contexto = \{ \.\.\.dados,/);
  assert.match(app, /recarregar: \(\) => \{\s*dados = null;\s*dono = null;\s*return desenhar\("atualizacao"\);/);
});

test("CSS: a falha tem estilo próprio e a barra inferior tem folga para 'Atendimentos' em 320–419 px", () => {
  const css = readFileSync(new URL("../../outputs/css/conta.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(css, /\.mp-vazio-falha \{/);
  const estreita = css.match(/@media \(max-width: 419px\) \{\n([^}]*\{[^}]*\}\n?)+\}/);
  assert.ok(estreita, "regra para telas estreitas existe");
  assert.match(estreita[0], /\.mp-pagina \.mp-nav \{ gap: 0; padding-inline: 4px; \}/);
  assert.match(estreita[0], /\.mp-nav-principal a \{ padding-inline: 0; \}/);
  /* O alvo de toque da barra continua com 56 px de altura mínima. */
  assert.match(css, /\.mp-pagina \.mp-nav a,\n\s*\.mp-pagina \.mp-nav \.mp-nav-mais \{ flex-direction: column; justify-content: center; gap: 4px; min-height: 56px;/);
});
