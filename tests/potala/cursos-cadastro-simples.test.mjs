import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { cursosParecidos, dadosDoCurso, montarPlanoNovoCurso, normalizarNome, novoFormulario, renderizarNovoCurso, validarNovoCurso } from "../../outputs/js/admin/novo-curso.js";
import { renderizarCursosPainel, resumoDosCursos } from "../../outputs/js/admin/cursos-painel.js";
import { simularPlano } from "../../outputs/js/admin/organizar-curso.js";

/* Espelha o caso real: um rascunho e um publicado com nomes quase iguais (dados ficticios, so no teste). */
const S = {
  activity_definitions: [
    { id: "d-rascunho-0001", title: "Curso Meditação Potala", kind: "course" },
    { id: "d-publicado-002", title: "Curso de Meditação Potala", kind: "course", published: true, summary: "Resumo", price_cents: 15000 },
    { id: "d-aberto", title: "Respiração", kind: "course", published: true, summary: "R", price_cents: 0 },
    { id: "d-atend", title: "Acupuntura", kind: "appointment" },
  ],
  activity_offerings: [{ id: "o-aberto", title: "Respiração", definition_id: "d-aberto", published: true, professional_id: "prof", mode: "online", capacity: 5 }],
  profiles: [{ id: "prof", display_name: "Professora", roles: ["professional"], active: true }],
  rooms: [], enrollments: [], schedule_items: [], offering_professionals: [],
};

test("nomes parecidos sao detectados sem bloquear (sem mesclar nada)", () => {
  assert.equal(normalizarNome("Curso de Meditação Potala"), normalizarNome("Curso Meditação Potala"));
  assert.deepEqual(cursosParecidos(S, "curso  meditacao potala!").map((d) => d.id), ["d-rascunho-0001", "d-publicado-002"]);
  assert.deepEqual(cursosParecidos(S, "Curso de Meditação Potala", "d-publicado-002").map((d) => d.id), ["d-rascunho-0001"]);
  const html = renderizarNovoCurso(dadosDoCurso(S, "d-publicado-002"), S);
  assert.match(html, /nome parecido/);
  assert.match(html, /data-nc-editar="d-rascunho-0001"/);
  assert.match(html, /código …o-0001/, "codigo curto distingue as versoes");
});

test("editar um curso que ja tinha nome repetido continua possivel; criar outro igual nao", () => {
  const S2 = { ...S, activity_definitions: [...S.activity_definitions, { id: "d-dup", title: "Respiração", kind: "course" }] };
  assert.deepEqual(validarNovoCurso({ ...dadosDoCurso(S2, "d-dup"), descricao: "x" }, S2), []);
  assert.match(validarNovoCurso({ ...novoFormulario(), nome: "respiração" }, S2).join(), /Já existe/);
  assert.match(validarNovoCurso({ ...dadosDoCurso(S2, "d-rascunho-0001"), nome: "Respiração" }, S2).join(), /Já existe/, "renomear para nome existente bloqueia");
});

test("publicar exige so nome, descricao e preco (ou gratuito); professor, data e vagas nao", () => {
  const base = { ...novoFormulario(), nome: "Yoga suave", descricao: "Para iniciantes", publicar: true };
  assert.match(validarNovoCurso(base, S).join(), /preço ou marque/);
  assert.deepEqual(validarNovoCurso({ ...base, precoTipo: "gratuito", valor: "0" }, S), []);
  assert.deepEqual(validarNovoCurso({ ...base, precoTipo: "pago", valor: "120" }, S), []);
  const passos = montarPlanoNovoCurso({ ...base, precoTipo: "pago", valor: "120" }, S);
  assert.deepEqual(passos.map((p) => p.tipo), ["definition.save", "definition.save"], "so o curso; nenhuma turma");
  assert.equal(passos[0].payload.price_cents, 12000);
  assert.equal(simularPlano(S, passos).ok, true);
});

test("tela: botoes claros e avancado recolhido", () => {
  const novo = renderizarNovoCurso(novoFormulario(), S);
  assert.match(novo, /data-nc-acao="rascunho">Salvar rascunho/);
  assert.match(novo, /data-nc-acao="publicar">Publicar curso/);
  assert.match(novo, /<details class="nc-avancado" data-nc-inscricoes>/, "inscricoes recolhidas");
  assert.doesNotMatch(novo, /name="professorId"/);
  assert.match(renderizarNovoCurso({ ...novoFormulario(), comTurma: true }, S), /<details class="nc-avancado" data-nc-inscricoes open>[\s\S]*name="professorId"/);
  const publicado = renderizarNovoCurso(dadosDoCurso(S, "d-publicado-002"), S);
  assert.match(publicado, /Salvar alterações/);
  assert.match(publicado, /Tirar do site/);
  assert.doesNotMatch(publicado, /Publicar curso/);
  const imgs = renderizarNovoCurso(novoFormulario(), S, { imagens: [{ arquivo: "capa.webp" }] });
  assert.match(imgs, /data-nc-imagem="media\/capa\.webp"/);
  assert.match(imgs, /src="\/media\/capa\.webp"/);
});

test("lista do Owner: preco, estado, contagens e acoes; aviso de nome parecido", () => {
  const r = resumoDosCursos(S, {
    interessados: [{ course_id: "d-publicado-002" }, { course_id: "d-publicado-002" }, { course_id: "d-aberto" }],
    pedidos: [{ offering_id: "o-aberto", status: "solicitada" }, { offering_id: "o-aberto", status: "matriculada" }],
  });
  assert.deepEqual(r.map((c) => c.id), ["d-publicado-002", "d-aberto", "d-rascunho-0001"], "so cursos; publicados primeiro");
  const pub = r.find((c) => c.id === "d-publicado-002");
  assert.equal(pub.interessados, 2); assert.equal(pub.pedidos, 0); assert.match(pub.preco, /150,00/);
  const aberto = r.find((c) => c.id === "d-aberto");
  assert.equal(aberto.preco, "Gratuito"); assert.equal(aberto.pedidos, 2); assert.equal(aberto.pedidosPendentes, 1); assert.equal(aberto.inscricoesAbertas, true);
  assert.equal(r.find((c) => c.id === "d-rascunho-0001").preco, "Preço não informado");
  const html = renderizarCursosPainel(r);
  assert.match(html, /2 interessados · 0 pedidos de inscrição/);
  assert.match(html, /1 interessado · 2 pedidos de inscrição \(1 aguardando\)/);
  assert.match(html, /data-novo-curso="d-publicado-002">Editar/);
  assert.match(html, /data-novo-curso="d-publicado-002" data-nc-ver-interessados>Ver interessados/);
  assert.match(html, /data-novo-curso="d-publicado-002" data-nc-abrir-inscricoes>Abrir inscrições/);
  assert.match(html, /data-inscricoes-cursos="">Gerenciar inscrições/);
  assert.match(html, /Nome parecido com: Curso Meditação Potala \(rascunho\)/);
  assert.doesNotMatch(renderizarCursosPainel([{ ...r[0], titulo: "<script>" }]), /<script>/);
});

test("a lista so le: nenhuma escrita, nenhuma RPC de decisao", () => {
  const src = readFileSync(new URL("../../outputs/js/admin/cursos-painel.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /command\(|admin_decide|\.insert\(|\.update\(|\.delete\(/);
  assert.match(readFileSync(new URL("../../outputs/js/admin/admin-entry.js", import.meta.url), "utf8"), /cursosPainel\?\.render\(\)/);
});
