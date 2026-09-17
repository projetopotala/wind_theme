import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMPOS_POR_FAMILIA, PREDEFINICOES, renderAgenda, renderConflito, renderDetalhes, renderEscolhaDeTipo,
  renderMenuDeAcoes, tabelaDaAgenda, visaoEfetiva,
} from "../../outputs/js/admin/operations/agenda-views.js";
import { verificarReserva } from "../../outputs/js/admin/operations/agenda-layout.js";

const AGORA = Date.parse("2026-09-16T15:12:00-03:00");
const local = (dia, hora) => new Date(`${dia}T${hora}:00-03:00`).toISOString();
const MAL = '<img src=x onerror="alert(1)">';

function estado(extra = []) {
  const item = (id, dia, inicio, fim, campos = {}) => ({ id, kind: "activity", mode: "presencial", status: "booked", participants: 1, starts_at: local(dia, inicio), ends_at: local(dia, fim), ...campos });
  return {
    rooms: [
      { id: "lotus", name: "Sala Lótus", capacity: 2, status: "available", opens_at: "07:00", closes_at: "22:30" },
      { id: "mandala", name: "Sala Mandala", capacity: 20, status: "available", opens_at: "07:00", closes_at: "22:30" },
      { id: "horizonte", name: "Sala Horizonte", capacity: 35, status: "available", opens_at: "07:00", closes_at: "22:30" },
    ],
    profiles: [{ id: "rita", display_name: "Rita Okada", roles: ["professional"] }, { id: "ana", display_name: "Ana Souza", roles: ["client"] }],
    activity_definitions: [], activity_offerings: [], schedule_participants: [], maintenance_orders: [],
    schedule_series: [{ id: "serie", rule: { frequency: "weekly" } }],
    schedule_items: [
      item("psico", "2026-09-16", "09:00", "10:00", { title: "Psicoterapia · Ana Souza", kind: "appointment", room_id: "lotus", client_id: "ana" }),
      item("online", "2026-09-16", "10:30", "11:30", { title: "Psicoterapia online", kind: "appointment", mode: "online" }),
      item("yoga", "2026-09-16", "18:00", "19:00", { title: "Yoga Integral", room_id: "mandala", professional_id: "rita", participants: 16, series_id: "serie" }),
      item("ciclo", "2026-09-17", "18:30", "21:00", { title: "Ciclo de Expansão", kind: "course", room_id: "horizonte" }),
      item("meditacao", "2026-09-17", "19:00", "20:00", { title: "Meditação guiada", room_id: "horizonte" }),
      item("workshop", "2026-09-15", "14:00", "16:00", { title: "Workshop", kind: "workshop", room_id: "horizonte", status: "completed" }),
      ...extra,
    ],
  };
}

const agenda = (view, extra = {}) => renderAgenda(estado(), { date: "2026-09-16", view, agora: AGORA, ...extra });

test("Semana e Dia são grades de horas, e a altura do bloco é a duração", () => {
  const semana = agenda("week");
  assert.doesNotMatch(semana, /<table/);
  assert.equal((semana.match(/class="ag-coluna/g) || []).length, 7);
  assert.match(semana, /data-op-coluna="2026-09-14"/, "a semana começa na segunda");
  assert.match(semana, /data-op-coluna="2026-09-20"/);
  assert.match(semana, /style="--topo:660;--altura:60;--faixa:0;--faixas:1"[^>]*>\s*<button[^>]*data-id="yoga"/, "18:00–19:00: 11h depois das 07:00, 60 minutos");
  assert.match(semana, /data-agenda-agora style="--topo:492"/, "a linha 'agora' fica às 15:12");
  assert.match(semana, /14 – 20 set 2026/);

  const dia = agenda("day");
  assert.equal((dia.match(/class="ag-coluna/g) || []).length, 1);
  assert.match(dia, /class="ag-faixa-semana"/);
  assert.notEqual(agenda("today"), "", "o antigo modo Hoje continua aceito e abre o Dia");
  assert.equal(visaoEfetiva("today", false), "day");
});

test("conflito de sala aparece no calendário, não só na hora de salvar", () => {
  const semana = agenda("week");
  assert.match(semana, /data-conflito="sala"[\s\S]*?data-id="ciclo"/);
  assert.match(semana, /data-conflito="sala"[\s\S]*?data-id="meditacao"/);
  assert.match(semana, /Conflito de sala/);
  assert.doesNotMatch(semana.slice(semana.indexOf('data-id="yoga"') - 400, semana.indexOf('data-id="yoga"')), /data-conflito/);
});

test("Mês é grade de segunda a domingo com +N, e clicar no dia abre o Dia", () => {
  const extras = ["08:00", "09:00", "10:00", "11:00"].map((hora, indice) => ({
    id: `extra-${indice}`, title: `Extra ${indice}`, kind: "activity", mode: "presencial", status: "booked", participants: 1,
    room_id: "horizonte", starts_at: local("2026-09-18", hora), ends_at: local("2026-09-18", `${hora.slice(0, 2)}:45`),
  }));
  const mes = renderAgenda(estado(extras), { date: "2026-09-16", view: "month", agora: AGORA });
  assert.doesNotMatch(mes, /<table/);
  assert.equal((mes.match(/class="ag-mes-dia/g) || []).length, 35);
  assert.ok(mes.indexOf('data-op-day="2026-08-31"') < mes.indexOf('data-op-day="2026-09-01"'), "31 de agosto antes do dia 1");
  assert.match(mes, /\+1<\/button>/, "quatro atividades mostram três e +1");
});

test("Lista continua tabela, com o evento clicável e ações no ⋯ em vez de Abrir/Concluir", () => {
  const lista = agenda("list");
  assert.match(lista, /<table class="ag-lista">/);
  assert.match(lista, /data-op-action="detalhes" data-id="yoga"/);
  assert.match(lista, /data-op-menu="yoga"/);
  assert.doesNotMatch(lista, />Abrir</);
  assert.doesNotMatch(tabelaDaAgenda(estado(), estado().schedule_items, { agora: AGORA }), />Concluir</);
});

test("Por sala é linha do tempo, com resumo, lotação e hora da linha 'agora'", () => {
  const sala = agenda("room");
  assert.doesNotMatch(sala, /<table/);
  assert.match(sala, /data-op-trilha="mandala"/);
  assert.match(sala, /3 de 3<\/strong> salas livres agora/);
  assert.match(sala, /Próximo: <strong>Yoga Integral<\/strong> às 18:00/);
  assert.match(sala, /Yoga Integral · 16\/20|16\/20/);
  assert.match(sala, /Clique para ver detalhes/);
  assert.match(sala, /class="ag-sala is-online"/, "atendimento online tem linha própria");
});

test("Ocupação traz números, ranking e mapa de calor de salas por hora", () => {
  const ocupacao = agenda("occupancy");
  assert.match(ocupacao, /salas livres agora/);
  assert.match(ocupacao, /horário mais disputado/);
  assert.equal((ocupacao.match(/class="ag-calor-celula" style="[^"]*" title=/g) || []).length, 3 * 16, "uma célula por sala e hora, fora a legenda");
});

test("no telefone Semana, Por sala e Ocupação abrem como Dia", () => {
  for (const visao of ["week", "room", "occupancy"]) assert.equal(visaoEfetiva(visao, true), "day");
  assert.equal(visaoEfetiva("list", true), "list");
  assert.match(renderAgenda(estado(), { date: "2026-09-16", view: "week", estreito: true, agora: AGORA }), /data-visao="day"/);
});

test("a busca filtra a grade e avisa quando nada foi encontrado", () => {
  const busca = agenda("week", { search: "rita" });
  assert.match(busca, /data-id="yoga"/);
  assert.doesNotMatch(busca, /data-id="psico"/);
  assert.match(agenda("week", { search: "nada disso" }), /Nenhuma atividade encontrada para “nada disso”/);
});

test("detalhes mostram o que importa, e o menu segue a ordem pedida", () => {
  const detalhe = renderDetalhes(estado(), "yoga", { agora: AGORA });
  assert.match(detalhe, /id="op-drawer-titulo"[^>]*>Yoga Integral</);
  assert.match(detalhe, /Toda quarta-feira/);
  assert.match(detalhe, /16 de 20/);
  assert.match(detalhe, /data-op-action="schedule" data-id="yoga">Editar/);
  assert.match(detalhe, /data-op-action="complete" data-id="yoga"/);

  const menu = renderMenuDeAcoes(estado(), "yoga");
  const ordem = [...menu.matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(ordem, ["Editar", "Concluir", "Reagendar", "Cancelar", "Duplicar"]);

  const concluida = renderDetalhes(estado(), "workshop", { agora: AGORA });
  assert.doesNotMatch(concluida, /data-op-action="complete"/);
  assert.match(concluida, /histórico/);
  assert.match(renderMenuDeAcoes(estado(), "workshop"), /data-op-action="complete" data-id="workshop" disabled/);
});

test("novo agendamento pergunta o tipo primeiro e cada tipo tem seus campos", () => {
  const escolha = renderEscolhaDeTipo();
  assert.match(escolha, /O que deseja agendar\?/);
  for (const tipo of ["atendimento", "curso", "atividade", "evento", "locacao", "online"]) {
    assert.match(escolha, new RegExp(`data-op-novo-tipo="${tipo}"`));
    assert.ok(CAMPOS_POR_FAMILIA[tipo].includes("starts_at"), `${tipo} sem horário`);
    assert.ok(PREDEFINICOES[tipo].kind, `${tipo} sem tipo predefinido`);
  }
  assert.ok(!CAMPOS_POR_FAMILIA.online.includes("room_id"), "online não pede sala");
  assert.ok(CAMPOS_POR_FAMILIA.online.includes("online_url"));
  assert.ok(!CAMPOS_POR_FAMILIA.atendimento.includes("extras"), "atendimento não mostra serviços adicionais");
});

test("aviso de conflito no formulário diz a sala e oferece horário e sala livres", () => {
  const s = estado();
  const html = renderConflito(verificarReserva(s, { room_id: "mandala", mode: "presencial", participants: 2, starts_at: "2026-09-16T18:30", ends_at: "2026-09-16T19:30" }));
  assert.match(html, /Sala ocupada\./);
  assert.match(html, /A Sala Mandala já está ocupada entre 18:00 e 19:00/);
  assert.match(html, /data-op-sugestao="horario" data-inicio="2026-09-16T19:00"/);
  assert.match(html, /data-op-sugestao="sala" data-sala="horizonte"/);
  assert.equal(renderConflito({ mensagens: [], sugestoes: [] }), "");
});

test("títulos, nomes e salas digitados não viram HTML em nenhuma visualização", () => {
  const s = estado();
  s.rooms[1].name = MAL;
  s.profiles[0].display_name = MAL;
  s.schedule_items[2].title = MAL;
  for (const view of ["day", "week", "month", "list", "room", "occupancy"]) {
    const html = renderAgenda(s, { date: "2026-09-16", view, agora: AGORA, search: "" });
    assert.doesNotMatch(html, /<img src=x/, view);
  }
  assert.doesNotMatch(renderDetalhes(s, "yoga", { agora: AGORA }), /<img src=x/);
  assert.doesNotMatch(renderMenuDeAcoes(s, "yoga"), /<img src=x/);
  assert.doesNotMatch(renderAgenda(s, { date: "2026-09-16", view: "week", search: MAL, agora: AGORA }), /<img src=x/);
});
