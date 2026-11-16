import assert from "node:assert/strict";
import test from "node:test";

import vista, { hojeISO, periodoEncerrado, ligacaoDaSala } from "../../outputs/js/conta/spa/vistas/atendimentos.js";
import { suggestedTime, reservationForm } from "../../outputs/js/admin/appointment-panel.js";
import { renderAtendimentos } from "../../outputs/js/admin/atendimentos-view.js";

const OPCOES = [{ id: "of-1", service: "Acolhimento", professional: "", modality: "online" }];
const render = (agora, extra = {}) => vista.renderizar({ atendimentoDisponivel: true, opcoesAtendimento: OPCOES, horariosAtendimento: [], agora, ...extra });

test("pedido para HOJE e oferecido (fuso de Sao Paulo), nao so amanha", () => {
  const agora = new Date("2026-11-16T15:00:00Z"); // 12:00 em SP
  assert.equal(hojeISO(agora), "2026-11-16");
  assert.equal(hojeISO(new Date("2026-11-17T02:30:00Z")), "2026-11-16", "23h30 de SP ainda e o dia 16");
  const html = render(agora);
  assert.match(html, /name="dataPreferida" min="2026-11-16" value="2026-11-16"/);
});

test("hoje so vale o periodo que ainda nao terminou; passado e rejeitado", () => {
  const meioDia = new Date("2026-11-16T15:00:00Z"); // 12:00 SP
  assert.equal(periodoEncerrado("2026-11-16", "manha", meioDia), true);
  assert.equal(periodoEncerrado("2026-11-16", "tarde", meioDia), false);
  assert.equal(periodoEncerrado("2026-11-16", "noite", meioDia), false);
  assert.equal(periodoEncerrado("2026-11-17", "manha", meioDia), false, "outro dia nao e afetado");
  const html = render(meioDia);
  assert.match(html, /<option value="manha" disabled>/);
  assert.match(html, /<option value="tarde">/);
});

test("depois do fim da noite no dia o formulario ja comeca no dia seguinte", () => {
  // 23:59 SP: noite (fim 24h) ainda nao terminou -> continua hoje
  assert.match(render(new Date("2026-11-17T02:59:00Z")), /value="2026-11-16"/);
});

test("consulta confirmada: antes da janela diz quando a sala abre; dentro dela mostra Entrar na sala", () => {
  const pedido = { id: "a199a61e-0000-4000-8000-000000000000", modalidade: "online", inicio: "2026-11-16T18:00:00Z", fim: "2026-11-16T19:00:00Z" };
  const cedo = ligacaoDaSala(pedido, "confirmada", new Date("2026-11-16T15:00:00Z"));
  assert.doesNotMatch(cedo, /Entrar na sala/);
  assert.match(cedo, /A sala abre hoje às 14:45/);
  const aberta = ligacaoDaSala(pedido, "confirmada", new Date("2026-11-16T17:50:00Z")); // 10 min antes
  assert.match(aberta, /Entrar na sala/);
  assert.match(aberta, /\/sala/);
  assert.equal(ligacaoDaSala({ ...pedido, modalidade: "presencial" }, "confirmada", new Date("2026-11-16T17:50:00Z")), "", "presencial nao tem sala online");
  assert.equal(ligacaoDaSala(pedido, "pedido", new Date("2026-11-16T17:50:00Z")), "", "pendente nao tem sala");
});

test("Owner: sugestao de horario para hoje nunca fica no passado", () => {
  const agora = new Date("2026-11-16T17:20:00Z"); // 14:20 SP
  const row = { id: "r", preferred_date: "2026-11-16", preferred_period: "manha" };
  assert.equal(suggestedTime(row, agora).start, "2026-11-16T15:00");
  assert.equal(suggestedTime({ ...row, preferred_date: "2026-11-18" }, agora).start, "2026-11-18T09:00", "outro dia segue o periodo");
});

test("Owner: consulta confirmada mostra o horario exato e nao 'horario a definir'", () => {
  const row = { id: "r1", requester_name: "Ana", service: "Acolhimento", modality: "online", status: "encerrada", reservation_schedule_id: "s1", professional_profile_id: "p1", preferred_date: "2026-11-16", preferred_period: "manha" };
  const operational = { profiles: [{ id: "p1", display_name: "Prof Um" }], schedule_items: [{ id: "s1", starts_at: "2026-11-16T18:00:00Z", ends_at: "2026-11-16T19:00:00Z" }] };
  const html = renderAtendimentos({ rows: [row], phase: "ready", message: "", busy: false, operationalState: operational, helpers: { suggestedTime, reservationForm, roomLink: () => "" } });
  const confirmadas = html.split('id="atend-confirmadas"')[1];
  assert.match(confirmadas, /16\/11\/2026 às 15:00 - até 16:00/);
  assert.match(confirmadas, /Prof Um/);
  assert.doesNotMatch(confirmadas, /horário a definir/);
  assert.doesNotMatch(html.split('id="atend-confirmadas"')[0].split('id="atend-solicitacoes"')[1], /Ana/, "confirmada nao fica em solicitacoes recebidas");
});
