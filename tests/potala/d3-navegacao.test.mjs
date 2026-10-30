import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import atendimentos from "../../outputs/js/conta/spa/vistas/atendimentos.js";
import { renderView } from "../../outputs/js/admin/operations/views.js";
import { COLECOES } from "../../outputs/js/admin/operations/motor.js";

const pedido = (id, status, extra = {}) => ({
  id, status, servico: `Atendimento ${id}`, modalidade: "online",
  dataPreferida: "2026-11-12", periodoPreferido: "noite",
  criadaEm: "2026-10-30T10:00:00Z", ...extra,
});

test("Meu Potala separa pendências, confirmados e histórico com ação principal", () => {
  const html = atendimentos.renderizar({
    atendimentoDisponivel: true,
    atendimentos: [
      pedido("pendente", "recebida"),
      pedido("confirmado", "encerrada", { inicio: new Date("2026-11-12T22:00:00Z"), reservaId: "reserva-1" }),
      pedido("anterior", "encerrada", { inicio: new Date("2026-10-20T22:00:00Z"), reservaId: "reserva-2" }),
      pedido("cancelado", "cancelada"),
    ],
    opcoesAtendimento: [], horariosAtendimento: [], agora: new Date("2026-10-30T12:00:00Z"),
  });
  assert.match(html, /aria-label="Resumo dos atendimentos"/);
  assert.match(html, /id="mp-atendimentos-novo"[\s\S]*Solicitar um atendimento/);
  assert.match(html, /id="mp-atendimentos-pendentes"[\s\S]*Atendimento pendente/);
  assert.match(html, /id="mp-atendimentos-confirmados"[\s\S]*Atendimento confirmado/);
  assert.match(html, /id="mp-atendimentos-historico"[\s\S]*Atendimento anterior/);
  assert.match(html, /id="mp-atendimentos-cancelados"[\s\S]*Atendimento cancelado/);
  assert.match(html, /não informa, sozinho, se o atendimento foi realizado/);
  for (const id of ["pendente", "confirmado", "anterior", "cancelado"]) {
    assert.equal((html.match(new RegExp(`Atendimento ${id}`, "g")) || []).length, 1, `${id} não pode ser duplicado`);
  }
});

test("horários confirmados usam São Paulo e encerrada futura não significa realizada", () => {
  const html = atendimentos.renderizar({
    atendimentoDisponivel: false, agora: new Date("2026-10-30T12:00:00Z"),
    atendimentos: [pedido("futuro", "encerrada", {
      inicio: new Date("2026-11-12T22:00:00Z"), fim: new Date("2026-11-12T23:00:00Z"), reservaId: "reserva-1",
    })],
  });
  assert.match(html, /12 de novembro de 2026 às 19:00/);
  assert.match(html, /Consultas confirmadas[\s\S]*Atendimento futuro/);
  assert.doesNotMatch(html, /realizad[oa]/i);
});

test("campos ausentes ou inválidos não inventam uma próxima consulta", () => {
  const html = atendimentos.renderizar({
    atendimentoDisponivel: false, agora: new Date("2026-10-30T12:00:00Z"),
    atendimentos: [
      pedido("sem-horario", "encerrada", { reservaId: "reserva-1", inicio: null }),
      pedido("horario-invalido", "encerrada", { reservaId: "reserva-2", inicio: "não-é-data" }),
      pedido("sem-reserva", "encerrada", { inicio: "2026-11-12T22:00:00Z", reservaId: null }),
      pedido("pendente-sem-horario", "recebida", { inicio: null }),
    ],
  });
  assert.match(html, /Consultas confirmadas[\s\S]*Quando uma consulta futura for confirmada/);
  assert.match(html, /Horários confirmados anteriores[\s\S]*Atendimento sem-horario/);
  assert.match(html, /Horários confirmados anteriores[\s\S]*Atendimento horario-invalido/);
  assert.match(html, /Horários confirmados anteriores[\s\S]*Atendimento sem-reserva/);
  assert.match(html, /Solicitações pendentes[\s\S]*Atendimento pendente-sem-horario/);
  for (const id of ["sem-horario", "horario-invalido", "sem-reserva", "pendente-sem-horario"]) {
    assert.equal((html.match(new RegExp(`Atendimento ${id}`, "g")) || []).length, 1);
  }
});

test("adaptador usa os nomes efetivamente devolvidos pela RPC de histórico", () => {
  const source = readFileSync(new URL("../../outputs/js/conta/adaptadores/supabase.js", import.meta.url), "utf8");
  assert.match(source, /horarioId: "slot_id"/);
  assert.match(source, /inicio: "starts_at"/);
  assert.match(source, /fim: "ends_at"/);
  assert.match(source, /reservaId: "reservation_schedule_id"/);
  assert.match(source, /rpc\("list_my_appointment_requests"\)/);
});

test("visão geral administrativa oferece atalhos para triagem e agenda", () => {
  const state = Object.fromEntries(COLECOES.map((nome) => [nome, []]));
  const html = renderView("dashboard", state, { date: "2026-10-30", view: "day" });
  assert.match(html, /aria-label="Ações prioritárias"/);
  assert.match(html, /href="#appointment-triage"/);
  assert.match(html, /data-op-action="goto-agenda"/);
  const panel = readFileSync(new URL("../../outputs/js/admin/appointment-panel.js", import.meta.url), "utf8");
  assert.match(panel, /id="appointment-triage"/);
});

test("correção móvel trata a caixa causadora sem esconder overflow global", () => {
  const especialistas = readFileSync(new URL("../../outputs/css/especialistas-redesign.css", import.meta.url), "utf8");
  const atendimentosCss = readFileSync(new URL("../../outputs/css/atendimentos-redesign.css", import.meta.url), "utf8");
  assert.match(especialistas, /\.com-page[\s\S]*box-sizing: border-box;[\s\S]*width: 100%;/);
  assert.match(especialistas, /\.com-ficha-corpo[\s\S]*min-width: 0/);
  assert.match(atendimentosCss, /\.care-page > :is\(section, header, footer\)[^}]*box-sizing: border-box[^}]*max-width: 100%[^}]*min-width: 0/);
  assert.doesNotMatch(`${especialistas}\n${atendimentosCss}`, /(?:html|body|\.care-page)\s*\{[^}]*overflow-x:\s*hidden/);
});
