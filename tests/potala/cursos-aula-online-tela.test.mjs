import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { criarInscricao, linkExterno } from "../../outputs/js/conta/modelos.js";
import { paraModelo } from "../../outputs/js/conta/adaptadores/supabase.js";
import cursos from "../../outputs/js/conta/spa/vistas/cursos.js";
import { CAMPOS_POR_FAMILIA } from "../../outputs/js/admin/operations/agenda-views.js";

const LINK = "https://meet.example.invalid/sala-ok?x=1&y=2";
const AGORA = "2026-11-11T12:00:00.000Z";
const inscricao = (extra = {}) => criarInscricao({
  id: "e1", cursoRef: "t1", curso: "Turma de Teste", professor: "Profa. Teste", modalidade: "Online",
  status: "proximo_encontro", proximaAula: "2026-11-13T22:00:00.000Z", linkAula: LINK, ...extra,
});
const tela = (...inscricoes) => cursos.renderizar({ inscricoes, progressos: [], agora: AGORA });

test("aula online com link: botao abre em nova aba com rel seguro e href escapado", () => {
  const html = tela(inscricao());
  assert.match(html, /Entrar na aula online/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.ok(html.includes('href="https://meet.example.invalid/sala-ok?x=1&amp;y=2"'), "href escapado");
  assert.ok(!html.includes("Link da aula ainda"), "sem aviso quando ha link");
  assert.match(html, /Turma de Teste/);
  assert.match(html, /Profa\. Teste/);
  assert.match(html, /Pr.xima aula:/);
});

test("aula online sem link mas com aula marcada: mostra o aviso simples, sem botao", () => {
  const html = tela(inscricao({ linkAula: null }));
  assert.match(html, /Link da aula ainda não disponível/);
  assert.ok(!html.includes("Entrar na aula online"));
});

test("sem aula marcada, presencial, espera e concluido nao mostram botao nem aviso", () => {
  const casos = [
    inscricao({ linkAula: null, proximaAula: null, status: "inscrito" }),
    inscricao({ modalidade: "Presencial" }),
    inscricao({ modalidade: "Presencial", linkAula: null }),
    inscricao({ status: "aguardando_turma", proximaAula: null }),
    inscricao({ status: "concluido" }),
  ];
  for (const caso of casos) {
    const html = tela(caso);
    assert.ok(!html.includes("Entrar na aula online"), `botao em ${caso.modalidade}/${caso.status}`);
    assert.ok(!html.includes("Link da aula ainda"), `aviso em ${caso.modalidade}/${caso.status}`);
  }
});

test("o modelo so aceita link https de reuniao; todo o resto vira null", () => {
  assert.equal(linkExterno(LINK), LINK);
  assert.equal(linkExterno("  https://meet.example.invalid/a  "), "https://meet.example.invalid/a");
  const ruins = [
    "http://meet.example.invalid/a", "javascript:alert(1)", "data:text/html,x", "ftp://meet.example.invalid/a", "//meet.example.invalid/a",
    "/sala/1", "sala", "https://", "https:///a", "https://user:senha@meet.example.invalid/a", "https://meet.example.invalid/a b",
    'https://meet.example.invalid/a"x', "https://meet.example.invalid/<b>", "https://meet.example.invalid\\evil", "https://a.invalid/\nx", "",
    "   ", null, undefined, `https://meet.example.invalid/${"a".repeat(2000)}`,
  ];
  for (const ruim of ruins) assert.equal(linkExterno(ruim), null, String(ruim).slice(0, 40));
  assert.equal(inscricao({ linkAula: "javascript:alert(1)" }).linkAula, null);
  assert.equal(inscricao({ linkAula: undefined }).linkAula, null);
});

test("link inseguro que escapasse do banco nao vira botao", () => {
  const html = tela(inscricao({ linkAula: "javascript:alert(1)" }));
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("Entrar na aula online"));
  assert.match(html, /Link da aula ainda não disponível/);
});

test("o adaptador le join_url do backend como linkAula e a leitura antiga segue valida", () => {
  const novo = paraModelo("inscricoes", {
    id: "e1", course_ref: "t1", course_title: "Turma", teacher_name: "Profa.", modality: "Online",
    status: "proximo_encontro", next_session_at: "2026-11-13T22:00:00Z", join_url: LINK, enrolled_at: "2026-11-01T10:00:00Z",
  }, "u1");
  assert.equal(novo.linkAula, LINK);
  const antigo = paraModelo("inscricoes", { id: "o1", user_id: "u1", course_ref: "x", course_title: "Antigo", status: "inscrito" }, "u1");
  assert.equal(antigo.linkAula, null);
});

test("Agenda: aula de Curso mostra Modalidade e Link online; o aviso de link ausente existe no controlador", () => {
  assert.ok(CAMPOS_POR_FAMILIA.curso.includes("mode"));
  assert.ok(CAMPOS_POR_FAMILIA.curso.includes("online_url"));
  assert.ok(CAMPOS_POR_FAMILIA.online.includes("online_url"), "atendimento online segue igual");
  assert.ok(!CAMPOS_POR_FAMILIA.atendimento.includes("online_url"), "atendimento presencial segue igual");
  const controlador = readFileSync(new URL("../../outputs/js/admin/operations/controller.js", import.meta.url), "utf8");
  assert.match(controlador, /Aula salva, mas sem o Link online/);
  assert.match(controlador, /precisa começar com https:\/\//);
});
