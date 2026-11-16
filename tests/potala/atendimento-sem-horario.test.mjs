import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import vista, { amanhaISO } from "../../outputs/js/conta/spa/vistas/atendimentos.js";

const OPCOES = [{ id: "of-1", service: "Atendimento meditação", professional: "Profissional", modality: "online" }];
const HORARIO = { id: "h-1", offering_id: "of-1", starts_at: "2099-01-10T13:00:00Z", ends_at: "2099-01-10T14:00:00Z" };
const render = (extra) => vista.renderizar({ atendimentoDisponivel: true, opcoesAtendimento: OPCOES, horariosAtendimento: [], agora: new Date("2026-11-16T06:00:00Z"), ...extra });

test("sem horarios: cliente ainda pode solicitar o servico publicado", () => {
  const html = render();
  assert.match(html, /data-form="atendimento-sem-horario"/);
  assert.match(html, /Solicitar atendimento/);
  assert.match(html, /value="of-1" data-modalidade="online"/);
  assert.match(html, /name="dataPreferida" min="2026-11-17"/);
  assert.doesNotMatch(html, /Nenhum horário de atendimento está disponível agora/);
  assert.doesNotMatch(html, /data-form="atendimento"[ >]/, "sem horario nao mostra o seletor de horario");
});

test("com horarios: mostra a reserva por horario e o pedido por preferencia", () => {
  const html = render({ horariosAtendimento: [HORARIO] });
  assert.match(html, /data-form="atendimento"/);
  assert.match(html, /data-form="atendimento-sem-horario"/);
  assert.match(html, /Prefere outro dia/);
});

test("sem servicos publicados: mensagem clara, sem formulario", () => {
  const html = render({ opcoesAtendimento: [] });
  assert.match(html, /Ainda não há serviços de atendimento publicados/);
  assert.doesNotMatch(html, /data-form="atendimento-sem-horario"/);
});

test("texto do servico e escapado", () => {
  const html = render({ opcoesAtendimento: [{ ...OPCOES[0], service: "<img src=x onerror=1>" }] });
  assert.doesNotMatch(html, /<img src=x/);
});

test("amanha no fuso de Sao Paulo", () => {
  assert.equal(amanhaISO(new Date("2026-11-16T02:30:00Z")), "2026-11-16"); /* 23h30 do dia 15 em SP */
});

test("app envia pelo pedido autenticado sem horario e nunca anuncia consulta confirmada", () => {
  const app = readFileSync(new URL("../../outputs/js/conta/spa/app.js", import.meta.url), "utf8");
  assert.match(app, /\[data-form='atendimento-sem-horario'\]/);
  assert.match(app, /await sessao\.solicitarAtendimento\(\{[\s\S]*?ofertaId: campos\.ofertaId[\s\S]*?\}\);\s*delete semHorario\.dataset\.idempotencia/);
  assert.match(app, /ainda não é uma consulta confirmada/);
});

test("REGRESSAO 16/11: consulta futura de pedido sem horario fica em Confirmadas, nao em anteriores", () => {
  const html = vista.renderizar({ atendimentoDisponivel: true, opcoesAtendimento: OPCOES, horariosAtendimento: [], agora: new Date("2026-11-16T07:30:00Z"),
    atendimentos: [{ id: "a199a61e-0000-4000-8000-000000000000", servico: "Meditação", modalidade: "online", status: "encerrada", reservaId: "deb94390", inicio: "2026-11-17T12:00:00Z", fim: "2026-11-17T13:00:00Z", dataPreferida: "2026-11-17", periodoPreferido: "manha" }] });
  const confirmadas = html.split('id="mp-atendimentos-confirmados"')[1].split('id="mp-atendimentos-historico"')[0];
  assert.match(confirmadas, /Meditação/);
  const anteriores = html.split('id="mp-atendimentos-historico"')[1].split('id="mp-atendimentos-cancelados"')[0];
  assert.doesNotMatch(anteriores, /Meditação/);
});

test("envio sem horario confere o minimo (amanha) e mostra a data enviada", () => {
  const app = readFileSync(new URL("../../outputs/js/conta/spa/app.js", import.meta.url), "utf8");
  assert.match(app, /String\(campos\.dataPreferida\) < minimo/);
  assert.match(app, /Solicitação recebida para \$\{diaEscolhido\}/);
});
