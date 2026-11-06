import { test } from "node:test";
import assert from "node:assert/strict";
import vista from "../../outputs/js/conta/spa/vistas/atendimentos.js";

const base = { id: "9c1b3b81-47f3-4a3e-9190-c2b8d580d30e", servico: "Teste", modalidade: "online", status: "encerrada",
  reservaId: "r1", inicio: "2026-11-06T13:30:00Z", fim: "2026-11-06T14:15:00Z" };
const render = (pedido, agora) => vista.renderizar({ atendimentos: [pedido], opcoesAtendimento: [], horariosAtendimento: [],
  atendimentoDisponivel: false, parametros: {}, agora: new Date(agora) });
const confirmada = (html) => /id="mp-atendimentos-confirmados"[\s\S]*Entrar na sala[\s\S]*id="mp-atendimentos-historico"/.test(html);

test("online já iniciada continua em Consultas confirmadas com Entrar na sala", () => {
  assert.ok(confirmada(render(base, "2026-11-06T13:41:00Z")));
});
test("online continua até a sala fechar (fim + 30 min)", () => {
  assert.ok(confirmada(render(base, "2026-11-06T14:44:00Z")));
});
test("online vai para o histórico depois que a sala fecha", () => {
  const html = render(base, "2026-11-06T14:46:00Z");
  assert.ok(!confirmada(html));
  assert.ok(!html.includes("Entrar na sala"));
});
test("presencial sai das confirmadas no fim do horário, sem tolerância", () => {
  const p = { ...base, modalidade: "presencial" };
  assert.ok(/<strong>1<\/strong><span>Confirmados/.test(render(p, "2026-11-06T14:10:00Z")));
  assert.ok(/<strong>0<\/strong><span>Confirmados/.test(render(p, "2026-11-06T14:16:00Z")));
});
test("sem fim usa o início; sem datas vai para o histórico", () => {
  assert.ok(confirmada(render({ ...base, fim: null }, "2026-11-06T13:50:00Z")));
  assert.ok(!confirmada(render({ ...base, fim: null, inicio: null }, "2026-11-06T13:00:00Z")));
});
