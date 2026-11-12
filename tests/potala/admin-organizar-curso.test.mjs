import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createOperationsClient } from "../../outputs/js/admin/operations/client.js";
import { estadoVazio } from "../../outputs/js/admin/operations/motor.js";
import { TAREFAS, executarTarefa } from "../../outputs/js/admin/admin-tarefas.js";
import {
  ESTADO_INICIAL, buscarPessoas, confirmarPasso, executarPlano, haHomonimos, idsPorColecao, montarPlanoCurso,
  pendencias, pendenciasDaAula, professorEfetivo, professoresAdequados, renderizarOrganizar, repetidoNoBanco,
  semelhancaDeCurso, simularPlano, turmaEfetiva, validarAula, validarEtapa,
} from "../../outputs/js/admin/organizar-curso.js";

const ler = (rel) => readFileSync(new URL(`../../outputs/${rel}`, import.meta.url), "utf8");

/*
 * P1C | Organizar um curso — sobre os comandos que já existem (definition/offering/schedule/enrollment.save).
 * Dados sintéticos "TESTE INTERNO". O banco aqui é um op_apply em memória com as mesmas garantias
 * (revisão, chave de repetição); o teste com o banco real (PGlite) está em admin-organizar-curso-banco.
 */
const agora = "2026-11-12T12:00:00.000Z";
function base() {
  const s = estadoVazio();
  s.revision = 1;
  s.rooms.push({ id: "sala1", code: "S01", name: "Sala 1", status: "available", capacity: 10, opens_at: "07:00", closes_at: "22:00" },
    { id: "sala2", code: "S02", name: "Sala 2", status: "unconfirmed", capacity: null });
  s.profiles.push(
    { id: "prof-ana", display_name: "TESTE INTERNO Ana Professora", email: "ana.prof@potala.test", roles: ["professional"], active: true },
    { id: "prof-ina", display_name: "TESTE INTERNO Inativo Prof", email: "", roles: ["professional"], active: false },
    { id: "prof-beto", display_name: "TESTE INTERNO Beto Professor", email: "beto.prof@potala.test", roles: ["professional", "client"], active: true },
    { id: "al-joao", display_name: "TESTE INTERNO João Silva", email: "joao.silva@potala.test", roles: ["student"], active: true },
    { id: "al-joao2", display_name: "TESTE INTERNO Joao Silva", email: "joao.outro@potala.test", roles: ["client"], active: true },
    { id: "al-maria", display_name: "TESTE INTERNO Maria Sem Email", email: "", roles: ["client"], active: true },
    { id: "al-velho", display_name: "TESTE INTERNO Cadastro Inativo", email: "velho@potala.test", roles: ["client"], active: false },
  );
  s.activity_definitions.push(
    { id: "def-med", title: "TESTE INTERNO Meditação para iniciantes", kind: "course" },
    { id: "def-yoga", title: "TESTE INTERNO Yoga restaurativa", kind: "workshop" },
  );
  s.activity_offerings.push({ id: "of-cheia", title: "Turma cheia", definition_id: "def-med", professional_id: "prof-ana", mode: "presencial", capacity: 2 },
    { id: "of-livre", title: "Turma noite", definition_id: "def-med", professional_id: null, mode: "online", capacity: null });
  s.enrollments.push({ id: "en1", profile_id: "al-joao", offering_id: "of-cheia", status: "active" },
    { id: "en2", profile_id: "al-maria", offering_id: "of-cheia", status: "active" });
  s.schedule_items.push({ id: "ag-ocupa", title: "TESTE INTERNO Outra atividade", kind: "activity", mode: "presencial", room_id: "sala1", professional_id: "prof-beto", status: "booked", starts_at: "2027-03-02T22:00:00.000Z", ends_at: "2027-03-03T00:00:00.000Z", participants: 1, setup_minutes: 0, teardown_minutes: 0, requirements: [], extras: [] });
  return s;
}
const plano = (mudar) => { const e = ESTADO_INICIAL(); mudar(e); return e; };
const aula = (extra = {}) => ({ chave: "a1", data: "2027-03-02", inicio: "19:00", fim: "21:00", modo: "presencial", salaId: "sala1", link: "", repetirAte: "", ...extra });

/* op_apply em memória: confere revisão (PT409), reaproveita resultado pela chave e aplica as mudanças. */
function bancoFalso(inicial, falhas = {}) {
  let st = structuredClone(inicial);
  const chaves = new Map();
  const log = { aplicados: 0 };
  return {
    log, estado: () => st,
    mexer(fn) { fn(st); st.revision += 1; },
    async rpc(nome, args = {}) {
      if (nome === "op_snapshot") return falhas.snapshot?.() ? { data: null, error: { message: "Failed to fetch" } } : { data: structuredClone(st), error: null };
      if (nome !== "op_apply") return { data: null, error: { message: "desconhecida" } };
      if (falhas.antes?.(args)) return { data: null, error: { message: "Failed to fetch" } };
      if (falhas.permissao) return { data: null, error: { code: "42501", message: "permission denied for op_apply" } };
      if (chaves.has(args.p_idempotency_key)) return { data: chaves.get(args.p_idempotency_key), error: null };
      if (args.p_revision !== st.revision) return { data: null, error: { code: "PT409", message: "revision mismatch" } };
      for (const { table, id, after } of args.p_changes) {
        const linhas = (st[table] ||= []); const i = linhas.findIndex((l) => l.id === id);
        if (after == null) linhas.splice(i, 1); else if (i >= 0) linhas[i] = after; else linhas.push(after);
      }
      st.revision += 1; log.aplicados += 1;
      const data = { result: args.p_result, revision: st.revision };
      chaves.set(args.p_idempotency_key, data);
      if (falhas.depois?.(args)) return { data: null, error: { message: "Failed to fetch" } };
      return { data, error: null };
    },
  };
}
async function cliente(banco) { const op = createOperationsClient({ client: banco, agora: () => agora }); await op.refresh(); return op; }

/* ------------------------------------------------------------ etapas 1 e 2: curso e turma */

test("curso: mesmo nome é repetido (qualquer tipo); nome parecido só avisa e exige confirmação", () => {
  const s = base();
  assert.deepEqual(semelhancaDeCurso(s.activity_definitions, "teste interno MEDITACAO para Iniciantes").iguais.map((d) => d.id), ["def-med"]);
  assert.deepEqual(semelhancaDeCurso(s.activity_definitions, "TESTE INTERNO Meditação avançada").parecidos.map((d) => d.id), ["def-med"]);
  assert.deepEqual(semelhancaDeCurso(s.activity_definitions, "Cerâmica japonesa"), { iguais: [], parecidos: [] });
  const dup = plano((e) => { e.curso = { modo: "novo", titulo: "TESTE INTERNO Yoga Restaurativa", confirmaSemelhante: true }; });
  assert.match(validarEtapa(1, dup, s), /Já existe .*Workshop.*Use o cadastro existente/, "atividade equivalente de outro tipo também bloqueia");
  const parecido = plano((e) => { e.curso = { modo: "novo", titulo: "TESTE INTERNO Meditação avançada" }; });
  assert.match(validarEtapa(1, parecido, s), /nome parecido/);
  parecido.curso.confirmaSemelhante = true;
  assert.equal(validarEtapa(1, parecido, s), "");
  assert.match(validarEtapa(1, plano((e) => { e.curso = { modo: "existente", id: "def-yoga-nao" }; }), s), /Escolha um curso/);
  assert.equal(validarEtapa(1, plano((e) => { e.curso = { modo: "existente", id: "def-med" }; }), s), "");
});

test("turma: existente ou nova; nome repetido no mesmo curso é recusado; capacidade validada", () => {
  const s = base();
  const e = plano((x) => { x.curso = { modo: "existente", id: "def-med" }; x.turma = { modo: "nova", titulo: " turma NOITE ", modalidade: "online", capacidade: "" }; });
  assert.match(validarEtapa(2, e, s), /já tem uma turma com este nome/);
  e.turma.titulo = "Turma de março"; e.turma.capacidade = "0";
  assert.match(validarEtapa(2, e, s), /capacidade/i);
  e.turma.capacidade = "12";
  assert.equal(validarEtapa(2, e, s), "");
  assert.match(validarEtapa(2, plano((x) => { x.curso = { modo: "existente", id: "def-med" }; x.turma = { modo: "existente", id: "of-de-outro" }; }), s), /Escolha uma turma/);
});

test("plano de curso novo: curso, turma, aula e inscrição, nesta ordem, encadeados pelo id gravado", () => {
  const s = base();
  const e = plano((x) => {
    x.curso = { modo: "novo", titulo: "TESTE INTERNO Cerâmica" };
    x.turma = { modo: "nova", titulo: "Turma A", modalidade: "presencial", capacidade: "8" };
    x.professor = { id: "prof-ana", semProfessor: false };
    x.aulas = [aula({ inicio: "14:00", fim: "16:00" })];
    x.inscricoes = [{ perfilId: "al-joao", status: "active" }];
  });
  const passos = montarPlanoCurso(e, s);
  assert.deepEqual(passos.map((p) => p.tipo), ["definition.save", "offering.save", "schedule.save", "enrollment.save"]);
  assert.deepEqual(passos[0].payload, { title: "TESTE INTERNO Cerâmica", kind: "course" });
  assert.deepEqual(passos[1].payload.definition_id, { ref: "curso" });
  assert.equal(passos[1].payload.capacity, 8);
  assert.equal(passos[2].payload.professional_id, "prof-ana");
  assert.equal(passos[2].payload.kind, "course");
  assert.equal(passos[2].payload.participants, 8, "participantes = vagas da turma, limitado pela sala");
  const sim = simularPlano(s, passos);
  assert.equal(sim.ok, true, sim.erro);
  const turma = sim.estado.activity_offerings.find((o) => o.id === sim.refs.turma);
  assert.equal(turma.definition_id, sim.refs.curso);
  assert.equal(sim.estado.enrollments.find((x) => x.offering_id === turma.id).profile_id, "al-joao");
  assert.equal(s.activity_definitions.length, 2, "a simulação não toca no estado original");
});

test("curso existente: nada a gravar sobre o curso; turma existente sem mudança não é regravada", () => {
  const s = base();
  const e = plano((x) => { x.curso = { modo: "existente", id: "def-med" }; x.turma = { modo: "existente", id: "of-cheia" }; x.professor = { id: "prof-ana" }; });
  assert.deepEqual(montarPlanoCurso(e, s), []);
  assert.equal(repetidoNoBanco(e, s), "");
});

/* ------------------------------------------------------------ etapa 3: professor */

test("professor: só profissionais ativos; trocar o professor de turma existente é um item explícito; 'depois' não retira", () => {
  const s = base();
  assert.deepEqual(professoresAdequados(s).map((p) => p.id), ["prof-ana", "prof-beto"]);
  const e = plano((x) => { x.curso = { modo: "existente", id: "def-med" }; x.turma = { modo: "existente", id: "of-cheia" }; x.professor = { id: "prof-ina" }; });
  assert.match(validarEtapa(3, e, s), /não está ativo como profissional/);
  e.professor = { id: "al-joao" };
  assert.match(validarEtapa(3, e, s), /não está ativo como profissional/, "aluno não vira professor");
  e.professor = { id: "prof-beto" };
  const [troca] = montarPlanoCurso(e, s);
  assert.equal(troca.tipo, "offering.save");
  assert.equal(troca.payload.id, "of-cheia");
  assert.equal(troca.payload.professional_id, "prof-beto");
  assert.equal(troca.payload.capacity, 2, "os outros campos da turma seguem como estão");
  e.professor = { id: "", semProfessor: true };
  assert.equal(professorEfetivo(e, turmaEfetiva(e, s)), "prof-ana");
  assert.deepEqual(montarPlanoCurso(e, s), [], "“definir depois” em turma com professor não retira ninguém");
  const semProf = plano((x) => { x.curso = { modo: "existente", id: "def-med" }; x.turma = { modo: "existente", id: "of-livre" }; });
  assert.match(validarEtapa(3, semProf, s), /Definir o professor depois/);
  semProf.professor.semProfessor = true;
  assert.equal(validarEtapa(3, semProf, s), "");
  assert.ok(pendencias(semProf, s).some((p) => /sem professor/.test(p)));
});

test("professor inexistente: a tela diz isso e oferece o cadastro guiado (P1B), sem criar nada", () => {
  const s = base();
  s.profiles = s.profiles.filter((p) => !p.roles.includes("professional"));
  const e = plano((x) => { x.etapa = 3; x.curso = { modo: "novo", titulo: "X" }; x.turma = { modo: "nova", titulo: "T", modalidade: "presencial" }; });
  const html = renderizarOrganizar(e, s);
  assert.match(html, /data-oc-sem-professor>Não há profissionais ativos cadastrados/);
  assert.match(html, /data-oc-cadastrar-professor>Cadastrar profissional \(cadastro guiado\)/);
  assert.match(html, /não cria contas, não dá acesso administrativo e não publica perfis/);
});

/* ------------------------------------------------------------ etapa 4: aulas */

test("aulas: presencial exige sala; online não leva sala; conflitos reais de sala e de professor são detectados", () => {
  const s = base();
  assert.match(validarAula(aula({ salaId: "" })), /precisa de uma sala/);
  assert.match(validarAula(aula({ fim: "18:00" })), /término/);
  assert.match(validarAula(aula({ modo: "online", salaId: "", link: "meet.exemplo" })), /https/);
  const e = plano((x) => { x.curso = { modo: "existente", id: "def-med" }; x.turma = { modo: "nova", titulo: "Turma B", modalidade: "presencial", capacidade: "4" }; x.professor = { id: "prof-ana" }; });
  e.aulas = [aula()];
  const sala = simularPlano(s, montarPlanoCurso(e, s));
  assert.equal(sala.ok, false);
  assert.match(sala.erro, /Conflito de sala/);
  e.aulas = [aula({ inicio: "08:00", fim: "09:00", salaId: "sala2" })];
  assert.match(simularPlano(s, montarPlanoCurso(e, s)).erro, /Sala indisponível/, "sala sem cadastro confirmado");
  e.professor = { id: "prof-beto" };
  e.aulas = [aula({ modo: "online", salaId: "", link: "https://reuniao.exemplo/abc" })];
  const prof = simularPlano(s, montarPlanoCurso(e, s));
  assert.match(prof.erro, /Conflito de profissional/);
  e.professor = { id: "prof-ana" };
  const ok = simularPlano(s, montarPlanoCurso(e, s));
  assert.equal(ok.ok, true, ok.erro);
  const item = ok.estado.schedule_items.find((i) => i.offering_id === ok.refs.turma);
  assert.equal(item.room_id, null);
  assert.equal(item.online_url, "https://reuniao.exemplo/abc");
});

test("aula online sem link é gravável, mas fica como pendência clara; http não aparece ao aluno", () => {
  assert.match(pendenciasDaAula(aula({ modo: "online", salaId: "" }))[0], /sem link/);
  assert.match(pendenciasDaAula(aula({ modo: "online", salaId: "", link: "http://x.exemplo" }))[0], /https:\/\//);
  assert.deepEqual(pendenciasDaAula(aula({ modo: "online", salaId: "", link: "https://x.exemplo" })), []);
  const s = base();
  const e = plano((x) => { x.curso = { modo: "existente", id: "def-med" }; x.turma = { modo: "existente", id: "of-livre" }; x.professor = { semProfessor: true }; x.aulas = [aula({ modo: "online", salaId: "" })]; });
  assert.equal(simularPlano(s, montarPlanoCurso(e, s)).ok, true);
  assert.ok(pendencias(e, s).some((p) => /sem link/.test(p)));
});

test("aula semanal: um item na revisão, várias ocorrências na Agenda pela recorrência existente", () => {
  const s = base();
  const e = plano((x) => { x.curso = { modo: "existente", id: "def-med" }; x.turma = { modo: "existente", id: "of-livre" }; x.professor = { semProfessor: true }; x.aulas = [aula({ modo: "online", salaId: "", link: "https://x.exemplo", repetirAte: "2027-03-23" })]; });
  const passos = montarPlanoCurso(e, s);
  assert.deepEqual(passos[0].payload.recurrence, { frequency: "weekly", interval: 1, until: "2027-03-23" });
  const sim = simularPlano(s, passos);
  assert.equal(sim.estado.schedule_items.filter((i) => i.offering_id === "of-livre").length, 4);
});

/* ------------------------------------------------------------ etapa 5: inscrições */

test("inscrições: busca por nome ou e-mail, homônimos avisados, já inscrito e cadastro inativo não podem ser escolhidos", () => {
  const s = base();
  const r = buscarPessoas(s, "joao silva", { turmaId: "of-cheia" });
  assert.deepEqual(r.map((x) => x.perfil.id), ["al-joao", "al-joao2"]);
  assert.equal(haHomonimos(r), true);
  assert.equal(r[0].inscricao.status, "active");
  assert.equal(buscarPessoas(s, "joao.outro@", {})[0].perfil.id, "al-joao2");
  assert.equal(buscarPessoas(s, "j", {}).length, 0, "uma letra não lista ninguém");
  const e = plano((x) => { x.etapa = 5; x.curso = { modo: "existente", id: "def-med" }; x.turma = { modo: "existente", id: "of-cheia" }; x.busca = "silva"; });
  const html = renderizarOrganizar(e, s);
  assert.match(html, /data-oc-homonimos/);
  assert.match(html, /Já tem inscrição \(Ativa\)/);
  assert.match(html, /data-oc-escolher="al-joao2" aria-label="Escolher TESTE INTERNO Joao Silva, joao\.outro@potala\.test"/, "a escolha mostra o e-mail");
  assert.match(html, /Turma cheia \(2 de 2\)/);
  e.busca = "inativo";
  assert.match(renderizarOrganizar(e, s), /Cadastro inativo/);
});

test("turma sem vagas: inscrição ativa é recusada pelo motor; lista de espera é aceita; inscrição repetida é recusada", () => {
  const s = base();
  const e = plano((x) => { x.curso = { modo: "existente", id: "def-med" }; x.turma = { modo: "existente", id: "of-cheia" }; x.professor = { id: "prof-ana" }; });
  e.inscricoes = [{ perfilId: "al-joao2", status: "active" }];
  assert.match(simularPlano(s, montarPlanoCurso(e, s)).erro, /Capacidade da oferta esgotada/);
  e.inscricoes = [{ perfilId: "al-joao2", status: "waitlist" }];
  assert.equal(simularPlano(s, montarPlanoCurso(e, s)).ok, true);
  e.inscricoes = [{ perfilId: "al-joao", status: "waitlist" }];
  assert.match(simularPlano(s, montarPlanoCurso(e, s)).erro, /já possui inscrição/);
  const semEmail = plano((x) => { x.etapa = 5; x.curso = { modo: "existente", id: "def-med" }; x.turma = { modo: "existente", id: "of-livre" }; x.inscricoes = [{ perfilId: "al-maria", status: "active" }]; });
  assert.match(renderizarOrganizar(semEmail, s), /só verá o curso no Meu Potala se tiver conta vinculada/);
});

/* ------------------------------------------------------------ gravação: falhas e retomada */

function planoCompleto() {
  return plano((x) => {
    x.curso = { modo: "novo", titulo: "TESTE INTERNO Cerâmica" };
    x.turma = { modo: "nova", titulo: "Turma A", modalidade: "online", capacidade: "1" };
    x.professor = { id: "prof-ana" };
    x.aulas = [aula({ modo: "online", salaId: "", link: "https://reuniao.exemplo/a" })];
    x.inscricoes = [{ perfilId: "al-joao", status: "active" }];
  });
}
const conta = (st, col, f) => st[col].filter(f).length;

test("gravação completa: cada item uma vez; resultado conferido no banco", async () => {
  const banco = bancoFalso(base());
  const op = await cliente(banco);
  const e = planoCompleto();
  const feitos = [];
  const r = await executarPlano({ operations: op, passos: montarPlanoCurso(e, op.snapshot), idsAntes: idsPorColecao(op.snapshot), aoGravar: (p, id) => feitos.push([p.chave, id]) });
  assert.equal(r.ok, true);
  assert.equal(banco.log.aplicados, 4);
  assert.deepEqual(feitos.map(([k]) => k), ["curso", "turma", "aula:a1", "insc:al-joao"]);
  assert.ok(feitos.every(([, id]) => id));
  const st = banco.estado();
  assert.equal(conta(st, "enrollments", (x) => x.offering_id === r.refs.turma), 1);
});

test("falha de rede antes do banco: conferido que nada foi gravado; nova tentativa grava uma vez só", async () => {
  let falhar = true;
  const banco = bancoFalso(base(), { antes: () => falhar && !(falhar = false) });
  const op = await cliente(banco);
  const idsAntes = idsPorColecao(op.snapshot);
  const e = planoCompleto();
  const r = await executarPlano({ operations: op, passos: montarPlanoCurso(e, op.snapshot), idsAntes });
  assert.equal(r.ok, false);
  assert.equal(r.falha.conferido, true);
  assert.equal(r.falha.passo.chave, "curso");
  assert.equal(banco.log.aplicados, 0);
  const r2 = await executarPlano({ operations: op, passos: montarPlanoCurso(e, op.snapshot), idsAntes });
  assert.equal(r2.ok, true);
  assert.equal(conta(banco.estado(), "activity_definitions", (d) => d.title === "TESTE INTERNO Cerâmica"), 1);
});

test("resposta perdida depois de gravar: o fluxo confere, segue em frente e não duplica", async () => {
  let perder = true;
  const banco = bancoFalso(base(), { depois: (a) => a.p_action === "offering.save" && perder && !(perder = false) });
  const op = await cliente(banco);
  const r = await executarPlano({ operations: op, passos: montarPlanoCurso(planoCompleto(), op.snapshot), idsAntes: idsPorColecao(op.snapshot) });
  assert.equal(r.ok, true, "a turma gravada foi reconhecida pela conferência");
  const st = banco.estado();
  assert.equal(conta(st, "activity_offerings", (o) => o.title === "Turma A"), 1);
  assert.equal(conta(st, "schedule_items", (i) => i.offering_id === r.refs.turma), 1, "a aula usa a turma conferida");
});

test("sem resposta e sem conseguir reler: gravação incerta; ao continuar, confere antes e não repete", async () => {
  let cair = true;
  let semLeitura = false;
  const banco = bancoFalso(base(), { depois: (a) => a.p_action === "schedule.save" && cair && !(cair = false) && (semLeitura = true), snapshot: () => semLeitura });
  const op = await cliente(banco);
  const idsAntes = idsPorColecao(op.snapshot);
  const e = planoCompleto();
  const feitos = [];
  const r = await executarPlano({ operations: op, passos: montarPlanoCurso(e, op.snapshot), idsAntes, aoGravar: (p) => feitos.push(p.chave) });
  assert.equal(r.ok, false);
  assert.equal(r.falha.conferido, false, "não afirma nem que gravou, nem que não gravou");
  assert.deepEqual(feitos, ["curso", "turma"], "gravação parcial visível");
  semLeitura = false;
  await op.refresh();
  assert.ok(confirmarPasso(r.falha.passo, op.snapshot, { idsAntes, refs: r.falha.refs }), "na retomada, a conferência encontra a aula gravada");
  assert.equal(conta(banco.estado(), "schedule_items", (i) => i.offering_id === r.refs.turma), 1);
});

test("gravação parcial por vaga ocupada em outra janela: para, informa e a retomada não duplica o que já foi", async () => {
  const banco = bancoFalso(base());
  const op = await cliente(banco);
  const idsAntes = idsPorColecao(op.snapshot);
  const e = planoCompleto();
  e.inscricoes = [{ perfilId: "al-joao", status: "active" }, { perfilId: "al-joao2", status: "active" }];
  e.turma.capacidade = "2";
  const passos = montarPlanoCurso(e, op.snapshot);
  const feitos = [];
  const r = await executarPlano({
    operations: op, passos, idsAntes,
    aoGravar: (p, id) => { feitos.push(p.chave); if (p.chave === "insc:al-joao") banco.mexer((st) => st.enrollments.push({ id: "outra-janela", profile_id: "al-maria", offering_id: id && st.enrollments.find((x) => x.id === id).offering_id, status: "active" })); },
  });
  assert.equal(r.ok, false);
  assert.match(r.falha.motivo, /Capacidade da oferta esgotada/);
  assert.equal(r.falha.conferido, true);
  assert.deepEqual(feitos, ["curso", "turma", "aula:a1", "insc:al-joao"]);
  const st = banco.estado();
  assert.equal(conta(st, "enrollments", (x) => x.profile_id === "al-joao2"), 0);
  /* Retomada como o painel faz: o que foi gravado sai do plano (curso e turma viram existentes). */
  const depois = { ...e, curso: { modo: "existente", id: r.refs.curso }, turma: { ...e.turma, modo: "existente", id: r.refs.turma }, aulas: [], inscricoes: [{ perfilId: "al-joao2", status: "waitlist" }] };
  const resto = montarPlanoCurso(depois, op.snapshot);
  assert.deepEqual(resto.map((p) => p.tipo), ["enrollment.save"]);
  assert.equal((await executarPlano({ operations: op, passos: resto, refs: r.refs, idsAntes })).ok, true);
  assert.equal(conta(banco.estado(), "activity_definitions", (d) => d.title === "TESTE INTERNO Cerâmica"), 1);
  assert.equal(conta(banco.estado(), "schedule_items", (i) => i.offering_id === r.refs.turma), 1);
});

test("PT409 (outra janela gravou no meio): uma nova tentativa sobre o estado relido, sem duplicar", async () => {
  const banco = bancoFalso(base());
  const op = await cliente(banco);
  banco.mexer((st) => st.rooms.push({ id: "sala9", code: "S09", name: "Sala 9", status: "unconfirmed", capacity: null }));
  const r = await executarPlano({ operations: op, passos: montarPlanoCurso(planoCompleto(), op.snapshot), idsAntes: idsPorColecao(op.snapshot) });
  assert.equal(r.ok, true);
  assert.equal(conta(banco.estado(), "activity_definitions", (d) => d.title === "TESTE INTERNO Cerâmica"), 1);
});

test("falha de permissão: nada é gravado e a mensagem diz o motivo", async () => {
  const banco = bancoFalso(base(), { permissao: true });
  const op = await cliente(banco);
  const r = await executarPlano({ operations: op, passos: montarPlanoCurso(planoCompleto(), op.snapshot), idsAntes: idsPorColecao(op.snapshot) });
  assert.equal(r.ok, false);
  assert.match(r.falha.motivo, /Seu acesso não permite/);
  assert.equal(r.falha.passo.chave, "curso");
  assert.equal(banco.log.aplicados, 0);
});

test("curso criado em outra janela com o mesmo nome antes de gravar: não cria repetido", () => {
  const s = base();
  const e = planoCompleto();
  s.activity_definitions.push({ id: "def-outra", title: "teste interno ceramica", kind: "course" });
  assert.match(repetidoNoBanco(e, s), /mesmo nome de curso/);
});

/* ------------------------------------------------------------ telas e integração */

test("revisão: o que será gravado, em ordem; não é transação única; pendências e o que não muda", () => {
  const s = base();
  const e = planoCompleto();
  e.etapa = 6;
  e.simulacao = simularPlano(s, montarPlanoCurso(e, s));
  const html = renderizarOrganizar(e, s);
  assert.match(html, /data-oc-plano/);
  assert.match(html, /Cadastrar o curso “TESTE INTERNO Cerâmica”[\s\S]*Criar a turma “Turma A”[\s\S]*Agendar a aula de 02\/03\/2027[\s\S]*Inscrever TESTE INTERNO João Silva/);
  assert.match(html, /São gravações independentes/);
  assert.match(html, /data-oc-conferido/);
  assert.match(html, /Não muda: cadastros e papéis das pessoas, contas de acesso, permissões/);
  assert.match(html, />Gravar</);
  e.registro = [{ chave: "curso", descricao: "Cadastrar o curso" }];
  e.falha = { titulo: "Gravação parcial.", texto: "x" };
  const parcial = renderizarOrganizar(e, s);
  assert.match(parcial, /data-oc-gravados/);
  assert.match(parcial, /Continuar gravação/);
  assert.match(parcial, /role="alert" data-oc-falha/);
});

test("telas: indicador de etapas, Voltar/Continuar/Cancelar, curso x turma explicado, sem campos sem persistência", () => {
  const s = base();
  const e = ESTADO_INICIAL();
  const html = renderizarOrganizar(e, s);
  assert.match(html, /aria-label="Etapas para organizar o curso"/);
  assert.match(html, /aria-current="step"><span>1<\/span>Curso/);
  assert.match(html, /<strong>Curso<\/strong> é o que se ensina[\s\S]*<strong>Turma<\/strong> é cada edição/);
  assert.match(html, /data-oc-fechar>Cancelar/);
  assert.match(html, /type="submit" class="op-primary">Continuar/);
  for (const n of [2, 3, 4, 5]) assert.match(renderizarOrganizar({ ...planoCompleto(), etapa: n }, s), /data-oc-voltar/);
  const todas = [1, 2, 3, 4, 5, 6].map((n) => renderizarOrganizar({ ...planoCompleto(), etapa: n }, s)).join("");
  assert.doesNotMatch(todas, /name="(preco|price|descricao|especialidade|bio|pagamento)"/i, "nenhum campo que o cadastro não guarda");
  assert.match(renderizarOrganizar({ ...planoCompleto(), etapa: 4 }, s), /Este fluxo não gera links/);
});

test("segurança: só comandos operacionais existentes; nenhuma conta, papel, RPC administrativa ou service_role", () => {
  const js = ler("js/admin/organizar-curso.js").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(js, /\.rpc\(|service_role|admin_|person\.save|my_course_enrollments|supabase|fetch\(/i);
  const comandos = new Set([...js.matchAll(/tipo: "([a-z.]+)"/g)].map((m) => m[1]));
  assert.deepEqual([...comandos].sort(), ["definition.save", "enrollment.save", "offering.save", "schedule.save"]);
  assert.doesNotMatch(js, /roles\s*[:=]|published\s*[:=]/, "não muda papéis nem publicação");
});

test("integração: painel liga o fluxo, limpa o rascunho ao sair ou trocar de conta, e os formulários antigos continuam", () => {
  const entrada = ler("js/admin/admin-entry.js");
  assert.match(entrada, /import \{ createOrganizarCurso \} from "\.\/organizar-curso\.js";/);
  assert.match(entrada, /cadastroGuiado\?\.limpar\(\); organizarCurso\?\.limpar\(\); \}/g);
  assert.equal((entrada.match(/organizarCurso\?\.limpar\(\)/g) || []).length, 2, "logout e troca de conta");
  assert.match(entrada, /organizarCurso\?\.professorCadastrado\(id\)/);
  assert.match(entrada, /createCadastroGuiado\(/, "P1B preservado");
  const views = ler("js/admin/operations/views.js");
  assert.match(views, /data-organizar-curso>Organizar um curso<\/button>/);
  assert.match(views, /action\('Novo tipo de atividade','definition'\)\+action\('Nova turma \/ oferta','offering'\)/);
  assert.match(views, /action\('Inscrever','enrollment'/);
  assert.match(ler("admin.html"), /<link rel="stylesheet" href="\/css\/organizar-curso\.css">/);
  const css = ler("css/organizar-curso.css");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media \(max-width: 560px\)/);
});

test("P1A: Cadastrar curso, Criar turma e Inscrever aluno abrem o fluxo guiado com a intenção; sem ele, o formulário antigo", () => {
  for (const [id, intencao] of [["curso", "curso"], ["turma", "turma"], ["inscrever", "inscrever"]]) {
    const t = TAREFAS.find((x) => x.id === id);
    assert.equal(t.guiado, "[data-organizar-curso]");
    assert.equal(t.intencao, intencao);
  }
  assert.equal(TAREFAS.find((x) => x.id === "curso").formulario, "definition", "formulário antigo segue como alternativa");
  const atributos = new Map();
  let clicado = "";
  const guiado = { setAttribute: (k, v) => atributos.set(k, v), removeAttribute: (k) => atributos.delete(k), click: () => { clicado = atributos.get("data-organizar-intencao"); } };
  const navBotao = { hidden: false, disabled: false, getAttribute: () => null, click() {} };
  const area = { querySelector: (sel) => (sel === "[data-organizar-curso]" ? guiado : null), querySelectorAll: () => [] };
  const root = { querySelector: (sel) => (sel.includes("data-section") ? navBotao : sel.includes("data-admin-workspace") ? area : null) };
  assert.equal(executarTarefa(root, "turma"), true);
  assert.equal(clicado, "turma");
  assert.equal(atributos.size, 0, "o atributo temporário é retirado");
});
