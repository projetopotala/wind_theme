import test from "node:test";
import assert from "node:assert/strict";
import {
  JANELA, conflitos, distribuir, familiaDe, filtrarAgenda, gradeDoMes, inicioDaSemana, mapaDeCalor,
  periodoDaVisao, posicaoNaLinha, rotuloDoPeriodo, rotuloExterno, semanaDe, situacaoDe, somarMeses,
  verificarReserva,
} from "../../outputs/js/admin/operations/agenda-layout.js";

const local = (dia, hora) => new Date(`${dia}T${hora}:00-03:00`).toISOString();
const item = (id, dia, inicio, fim, extra = {}) => ({
  id, title: id, kind: "activity", mode: "presencial", status: "booked", participants: 1,
  starts_at: local(dia, inicio), ends_at: local(dia, fim), room_id: "mandala", ...extra,
});
const sala = (id, name, capacity, extra = {}) => ({ id, name, capacity, status: "available", opens_at: "07:00", closes_at: "22:30", ...extra });
const estado = (itens = []) => ({
  rooms: [sala("lotus", "Sala Lótus", 2), sala("aurora", "Sala Aurora", 3), sala("mandala", "Sala Mandala", 20), sala("horizonte", "Sala Horizonte", 35)],
  profiles: [
    { id: "rita", display_name: "Rita Okada", roles: ["professional"] },
    { id: "ana", display_name: "Ana Souza", roles: ["client"] },
    { id: "joao", display_name: "João Ferreira", roles: ["client"] },
  ],
  activity_definitions: [{ id: "def-yoga", title: "Yoga" }],
  activity_offerings: [{ id: "turma", title: "Turma de quarta", definition_id: "def-yoga", capacity: 20 }],
  schedule_participants: [{ schedule_id: "yoga", profile_id: "joao", status: "confirmed" }],
  maintenance_orders: [],
  schedule_items: itens,
});

test("a semana começa na segunda, e setembro de 2026 abre na segunda 31 de agosto", () => {
  assert.equal(inicioDaSemana("2026-09-16"), "2026-09-14");
  assert.equal(inicioDaSemana("2026-09-20"), "2026-09-14", "domingo fecha a semana, não abre outra");
  assert.deepEqual(semanaDe("2026-09-16"), ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]);

  const mes = gradeDoMes("2026-09-16");
  assert.equal(mes[0][0].dia, "2026-08-31");
  assert.equal(mes[0][0].doMes, false);
  assert.equal(mes[0][1].dia, "2026-09-01", "dia 1 de setembro cai na coluna da terça");
  assert.ok(mes.every((semana) => semana.length === 7));
  assert.equal(mes.at(-1).at(-1).dia, "2026-10-04");
  assert.equal(somarMeses("2026-01-31", 1), "2026-02-28");
});

test("cada visualização navega pelo próprio período", () => {
  assert.deepEqual(periodoDaVisao("week", "2026-09-16"), { inicio: "2026-09-14", fim: "2026-09-21" });
  assert.deepEqual(periodoDaVisao("day", "2026-09-16"), { inicio: "2026-09-16", fim: "2026-09-17" });
  assert.deepEqual(periodoDaVisao("month", "2026-09-16"), { inicio: "2026-08-31", fim: "2026-10-05" });
  assert.equal(rotuloDoPeriodo("week", "2026-09-16"), "14 – 20 set 2026");
  assert.equal(rotuloDoPeriodo("day", "2026-09-16"), "qua, 16 set 2026");
  assert.equal(rotuloDoPeriodo("month", "2026-09-16"), "setembro de 2026");
});

test("tipo e situação vêm do dado, não da cor", () => {
  assert.equal(familiaDe({ kind: "appointment", mode: "online" }), "online");
  assert.equal(familiaDe({ kind: "appointment", mode: "presencial" }), "atendimento");
  assert.equal(familiaDe({ kind: "workshop" }), "evento");
  assert.equal(familiaDe({ kind: "rental" }), "locacao");

  const yoga = item("yoga", "2026-09-16", "18:00", "19:00");
  assert.equal(situacaoDe(yoga, Date.parse(local("2026-09-16", "15:00"))), "agendada");
  assert.equal(situacaoDe(yoga, Date.parse(local("2026-09-16", "18:30"))), "andamento");
  assert.equal(situacaoDe(yoga, Date.parse(local("2026-09-16", "19:30"))), "pendente", "passou da hora e ninguém concluiu");
  assert.equal(situacaoDe({ ...yoga, status: "completed" }), "concluida");
  assert.equal(situacaoDe({ ...yoga, status: "cancelled" }), "cancelada");
});

test("eventos simultâneos dividem a coluna, e a posição sai do minuto", () => {
  const blocos = distribuir([
    item("kungfu", "2026-09-16", "19:00", "20:30", { room_id: "celeiro" }),
    item("danca", "2026-09-16", "19:30", "21:00", { room_id: "horizonte" }),
    item("yoga", "2026-09-16", "18:00", "19:00"),
  ]);
  const por = Object.fromEntries(blocos.map((b) => [b.item.id, b]));
  assert.equal(por.yoga.topo, 18 * 60 - JANELA.inicio);
  assert.equal(por.yoga.altura, 60);
  assert.equal(por.yoga.faixas, 1, "a yoga termina quando o kung fu começa: não se sobrepõem");
  assert.equal(por.kungfu.faixas, 2);
  assert.notEqual(por.kungfu.faixa, por.danca.faixa);
});

test("conflito de sala considera preparação e desmontagem, e cancelado não conta", () => {
  const ciclo = item("ciclo", "2026-09-17", "18:30", "21:00", { room_id: "horizonte", professional_id: "clara" });
  const meditacao = item("meditacao", "2026-09-17", "21:00", "22:00", { room_id: "horizonte", setup_minutes: 15 });
  const outraSala = item("outra", "2026-09-17", "19:00", "20:00", { room_id: "mandala", professional_id: "clara" });
  const cancelado = item("cancelado", "2026-09-17", "19:00", "20:00", { room_id: "horizonte", status: "cancelled" });
  const online = item("online", "2026-09-17", "19:00", "20:00", { mode: "online", room_id: null });
  const mapa = conflitos([ciclo, meditacao, outraSala, cancelado, online]);
  assert.deepEqual([...mapa.get("ciclo")].sort(), ["profissional", "sala"]);
  assert.deepEqual([...mapa.get("meditacao")], ["sala"]);
  assert.deepEqual([...mapa.get("outra")], ["profissional"]);
  assert.equal(mapa.has("cancelado"), false);
  assert.equal(mapa.has("online"), false);
});

test("a busca encontra atividade, profissional, cliente, sala e curso, sem depender de acento", () => {
  const s = estado([
    item("yoga", "2026-09-16", "18:00", "19:00", { title: "Yoga Integral", professional_id: "rita", offering_id: "turma" }),
    item("psico", "2026-09-16", "09:00", "10:00", { title: "Psicoterapia", kind: "appointment", room_id: "lotus", client_id: "ana" }),
  ]);
  const ids = (busca, extra = {}) => filtrarAgenda(s, s.schedule_items, { busca, ...extra }).map((i) => i.id);
  assert.deepEqual(ids("rita"), ["yoga"]);
  assert.deepEqual(ids("ana souza"), ["psico"]);
  assert.deepEqual(ids("joao"), ["yoga"], "participante inscrito também é encontrado");
  assert.deepEqual(ids("lotus"), ["psico"]);
  assert.deepEqual(ids("turma de quarta"), ["yoga"]);
  assert.deepEqual(ids("", { familia: "atendimento" }), ["psico"]);
  assert.deepEqual(ids("", { sala: "mandala" }), ["yoga"]);
});

test("reserva em conflito explica o horário ocupado e sugere outro horário e outra sala", () => {
  const s = estado([item("ciclo", "2026-09-17", "18:30", "20:00", { title: "Ciclo de Expansão", room_id: "lotus" })]);
  const resultado = verificarReserva(s, {
    room_id: "lotus", mode: "presencial", participants: 2,
    starts_at: "2026-09-17T19:00", ends_at: "2026-09-17T20:00",
  });
  assert.equal(resultado.mensagens[0], "A Sala Lótus já está ocupada entre 18:30 e 20:00 (“Ciclo de Expansão”).");
  const horario = resultado.sugestoes.find((s) => s.tipo === "horario");
  assert.deepEqual([horario.inicio.slice(11, 16), horario.fim.slice(11, 16)], ["20:00", "21:00"]);
  const outra = resultado.sugestoes.find((s) => s.tipo === "sala");
  assert.equal(outra.sala.id, "aurora", "a menor sala livre que comporta 2 pessoas");

  const livre = verificarReserva(s, { room_id: "lotus", mode: "presencial", participants: 1, starts_at: "2026-09-17T20:00", ends_at: "2026-09-17T21:00" });
  assert.deepEqual(livre, { mensagens: [], sugestoes: [] });
});

test("linha do tempo por sala: posição proporcional e título fora do bloco estreito só quando há espaço", () => {
  const janela = { inicio: 7 * 60, fim: 23 * 60 };
  const psico = item("psico", "2026-09-16", "09:00", "10:00", { room_id: "lotus" });
  const pos = posicaoNaLinha(psico, janela);
  assert.equal(pos.esquerda.toFixed(3), (120 / 960 * 100).toFixed(3));
  assert.equal(pos.largura.toFixed(3), (60 / 960 * 100).toFixed(3));

  const danca = item("danca", "2026-09-16", "19:30", "21:00", { room_id: "horizonte" });
  const roda = item("roda", "2026-09-16", "20:30", "21:30", { room_id: "horizonte" });
  assert.equal(rotuloExterno(psico, [psico], janela), true);
  assert.equal(rotuloExterno(danca, [danca, roda], janela), false, "a roda começa logo depois");
});

test("mapa de calor mede a fração ocupada de cada hora", () => {
  const s = estado([item("yoga", "2026-09-16", "18:00", "18:30")]);
  const mapa = mapaDeCalor(s, "2026-09-16", [17, 18, 19]);
  const mandala = mapa.find((linha) => linha.sala.id === "mandala");
  assert.deepEqual(mandala.horas.map((h) => h.fracao), [0, 0.5, 0]);
});
