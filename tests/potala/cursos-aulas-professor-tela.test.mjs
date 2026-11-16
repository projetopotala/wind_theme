import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { aulasDoProfessor, acessoDaAulaDoProfessor, quandoNoFuso } from "../../outputs/js/conta/spa/vistas/aulas-do-professor.js";
import cursos from "../../outputs/js/conta/spa/vistas/cursos.js";
import atendimentos from "../../outputs/js/conta/spa/vistas/atendimentos.js";
import { criarDadosSupabase } from "../../outputs/js/conta/adaptadores/supabase.js";

const LINK = "https://meet.example.invalid/sala";
const aula = (extra = {}) => ({ id: "t1", curso: "Meditação Sintética", modalidade: "Online", proximaAula: "2099-01-01T12:00:00Z", linkAula: LINK, alunos: 2, ...extra });
const AGORA = new Date("2098-12-30T12:00:00Z");

test("professor com link vê 'Entrar na aula online' em nova aba, sem inscrição e sem pagamento", () => {
  const html = aulasDoProfessor([aula()], AGORA);
  assert.match(html, /Aulas que você ministra/);
  assert.match(html, /<a [^>]*href="https:\/\/meet\.example\.invalid\/sala"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>Entrar na aula online/);
  assert.match(html, /2 alunos matriculados/);
  assert.doesNotMatch(html, /pagamento|Inscri|Cancelar|Registrar/i);
});

test("sem link valido nao ha botao: http, javascript:, presencial; com aula marcada avisa", () => {
  for (const linkAula of ["http://x.example.invalid/a", "javascript:alert(1)", "https://a b.example.invalid", null, ""]) {
    assert.doesNotMatch(aulasDoProfessor([aula({ linkAula })], AGORA), /href=/, String(linkAula));
  }
  assert.match(aulasDoProfessor([aula({ linkAula: null })], AGORA), /Link da aula ainda não disponível/);
  assert.equal(acessoDaAulaDoProfessor(aula({ modalidade: "Presencial" })), "");
  assert.doesNotMatch(aulasDoProfessor([aula({ proximaAula: null, linkAula: null })], AGORA), /Link da aula/);
});

test("lista vazia ou invalida nao desenha nada", () => {
  assert.equal(aulasDoProfessor([], AGORA), "");
  assert.equal(aulasDoProfessor(undefined, AGORA), "");
  assert.equal(aulasDoProfessor([{}], AGORA), "");
});

test("Meus cursos: professor sem nenhuma inscricao ve as aulas, nao o vazio de aluno", () => {
  const html = cursos.renderizar({ inscricoes: [], progressos: [], agora: AGORA, inscricoesCursos: [], aulasDoProfessor: [aula()] });
  assert.match(html, /Entrar na aula online/);
  assert.doesNotMatch(html, /Nenhum curso por enquanto/);
  const aluna = cursos.renderizar({ inscricoes: [], progressos: [], agora: AGORA, inscricoesCursos: [] });
  assert.match(aluna, /Nenhum curso por enquanto/);
  assert.doesNotMatch(aluna, /Como professor/);
});

test("area profissional (Atendimentos) mostra as aulas, com ou sem consultas", () => {
  const html = atendimentos.renderizar({ perfisProfissionais: [{ id: "p1", nome: "X" }], agendaProfissional: [], aulasDoProfessor: [aula()], atendimentoDisponivel: true });
  assert.match(html, /Aulas que você ministra/);
  assert.match(html, /Entrar na aula online/);
  const soAulas = atendimentos.renderizar({ aulasDoProfessor: [aula()], atendimentoDisponivel: true });
  assert.match(soAulas, /Entrar na aula online/);
  const semNada = atendimentos.renderizar({ atendimentoDisponivel: true });
  assert.doesNotMatch(semNada, /Aulas que você ministra/);
});

test("adaptador: chama my_teaching_courses sem parametro de conta; mapeia; funcao ausente vira lista vazia; outro erro falha", async () => {
  const chamadas = [];
  const mk = (resp) => ({ client: { from() {}, rpc: async (n, a) => { chamadas.push([n, a]); return resp; } } });
  const lista = await criarDadosSupabase(mk({ data: [{ id: "t1", course_title: "C", modality: "Online", next_session_at: "2099-01-01T12:00:00Z", join_url: LINK, students: 3, join_opens_at: "2099-01-01T11:45:00Z", room_state: "aberta" }, { id: "", course_title: "x" }], error: null })).aulasDoProfessor();
  assert.deepEqual(chamadas, [["my_teaching_courses", undefined]]);
  assert.deepEqual(lista, [{ id: "t1", curso: "C", modalidade: "Online", proximaAula: "2099-01-01T12:00:00Z", linkAula: LINK, alunos: 3, abreEm: "2099-01-01T11:45:00Z", salaEstado: "aberta" }]);
  assert.deepEqual(await criarDadosSupabase(mk({ data: null, error: { code: "PGRST202" } })).aulasDoProfessor(), []);
  await assert.rejects(() => criarDadosSupabase(mk({ data: null, error: { code: "XX000", message: "x" } })).aulasDoProfessor());
});

test("antes da janela: aula visivel, SEM botao, diz quando a sala abre (professor e aluno), no fuso de Sao Paulo", () => {
  const antes = aula({ linkAula: null, salaEstado: "abre_depois", abreEm: "2099-01-01T11:45:00Z" });
  const prof = aulasDoProfessor([antes], new Date("2099-01-01T09:00:00Z"));
  assert.doesNotMatch(prof, /href=|Entrar na aula online/);
  assert.match(prof, /A sala abre hoje às 08:45, 15 minutos antes da aula/);
  assert.match(prof, /Próxima aula: <strong>hoje às 09:00<\/strong>/);
  const aluno = cursos.renderizar({ inscricoes: [{ id: "i1", curso: "Curso", modalidade: "Online", status: "proximo_encontro", proximaAula: "2099-01-01T12:00:00Z", linkAula: null, abreEm: "2099-01-01T11:45:00Z", salaEstado: "abre_depois" }], progressos: [], agora: new Date("2099-01-01T09:00:00Z") });
  assert.doesNotMatch(aluno, /Entrar na aula online/);
  assert.match(aluno, /A sala abre hoje às 08:45/);
  /* dentro da janela, com link: botao */
  assert.match(aulasDoProfessor([aula({ salaEstado: "aberta" })], new Date("2099-01-01T11:50:00Z")), /Entrar na aula online/);
});

test("fuso: 23:30 em Sao Paulo ainda e 'hoje' mesmo sendo o dia seguinte em UTC; dia seguinte e 'amanha'", () => {
  assert.equal(quandoNoFuso("2026-11-17T02:30:00Z", new Date("2026-11-16T15:00:00Z")), "hoje às 23:30");
  assert.equal(quandoNoFuso("2026-11-17T12:00:00Z", new Date("2026-11-16T15:00:00Z")), "amanhã às 09:00");
  assert.equal(quandoNoFuso("2026-11-16T21:45:00Z", new Date("2026-11-16T15:00:00Z")), "hoje às 18:45");
  assert.equal(quandoNoFuso("", new Date()), "");
});

test("o app carrega as aulas do professor sem criar matricula, pedido ou cobranca", () => {
  const app = readFileSync(new URL("../../outputs/js/conta/spa/app.js", import.meta.url), "utf8");
  assert.match(app, /sessao\.aulasDoProfessor\(\)/);
  const fonte = [
    "../../outputs/js/conta/spa/vistas/aulas-do-professor.js",
  ].map((p) => readFileSync(new URL(p, import.meta.url), "utf8")).join("\n");
  assert.doesNotMatch(fonte, /rpc\(|\.insert\(|\.update\(|enrollment|checkout|asaas/i);
  const adaptador = readFileSync(new URL("../../outputs/js/conta/adaptadores/supabase.js", import.meta.url), "utf8");
  const bloco = adaptador.slice(adaptador.indexOf("async aulasDoProfessor()"), adaptador.indexOf("async agendaProfissional("));
  assert.doesNotMatch(bloco, /insert|update|delete|upsert|confirm_course|register_manual/i);
});
