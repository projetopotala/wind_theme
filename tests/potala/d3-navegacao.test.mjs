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
      pedido("confirmado", "encerrada", { inicio: "2026-11-12T22:00:00Z" }),
      pedido("cancelado", "cancelada"),
    ],
    opcoesAtendimento: [], horariosAtendimento: [],
  });
  assert.match(html, /aria-label="Resumo dos atendimentos"/);
  assert.match(html, /id="mp-atendimentos-novo"[\s\S]*Solicitar um atendimento/);
  assert.match(html, /id="mp-atendimentos-pendentes"[\s\S]*Atendimento pendente/);
  assert.match(html, /id="mp-atendimentos-confirmados"[\s\S]*Atendimento confirmado/);
  assert.match(html, /id="mp-atendimentos-historico"[\s\S]*Atendimento cancelado/);
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
