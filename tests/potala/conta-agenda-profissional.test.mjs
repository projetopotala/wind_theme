import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { criarDadosSupabase } from "../../outputs/js/conta/adaptadores/supabase.js";
import atendimentos, { acessoDaConsultaProfissional } from "../../outputs/js/conta/spa/vistas/atendimentos.js";

const EU = "3e71dce3-0000-4000-8000-000000000001";
const OUTRA = "211c6fe7-0000-4000-8000-000000000002";
const PEDIDO_MEU = "5dbe93f4-53ec-4fac-af66-95428b589430";
const PEDIDO_ALHEIO = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PEDIDO_COMO_CLIENTE = "11111111-2222-4333-8444-555555555555";

/* Cliente falso: grava a consulta montada e responde à RPC por pedido. */
function clienteFalso({ linhas, contextos, erroTabela = null }) {
  const chamadas = { from: [], select: null, filtros: [], rpc: [] };
  const consulta = {
    select(colunas) { chamadas.select = colunas; return this; },
    not(coluna, op, valor) { chamadas.filtros.push(["not", coluna, op, valor]); return this; },
    eq(coluna, valor) { chamadas.filtros.push(["eq", coluna, valor]); return this; },
    order() { return this; },
    limit(n) { chamadas.filtros.push(["limit", n]); return Promise.resolve({ data: erroTabela ? null : linhas, error: erroTabela }); },
  };
  return {
    chamadas,
    client: {
      from(tabela) { chamadas.from.push(tabela); return consulta; },
      async rpc(nome, args) {
        chamadas.rpc.push([nome, args]);
        const resposta = contextos[args.p_request_id];
        return resposta instanceof Error ? { data: null, error: { code: "XX000" } } : { data: resposta ?? null, error: null };
      },
    },
  };
}

const linha = (id, requester) => ({ id, service: "Reiki", modality: "online", requester_name: "Cliente E2E", status: "encerrada", requester_user_id: requester, reservation_confirmed_at: "2026-11-06T08:34:00Z" });
const contexto = (role, state = "open") => ({ role, state, service: "TESTE INTERNO — Atendimento online E2E", requester_name: "Cliente E2E",
  starts_at: "2026-11-06T13:00:00Z", ends_at: "2026-11-06T13:45:00Z", opens_at: "2026-11-06T12:45:00Z", closes_at: "2026-11-06T14:15:00Z" });

test("a agenda de quem atende só guarda o que o banco reconhece como papel de profissional", async () => {
  const { client, chamadas } = clienteFalso({
    linhas: [linha(PEDIDO_MEU, OUTRA), linha(PEDIDO_ALHEIO, OUTRA), linha(PEDIDO_COMO_CLIENTE, EU)],
    contextos: { [PEDIDO_MEU]: contexto("professional"), [PEDIDO_ALHEIO]: { state: "denied" } },
  });
  const agenda = await criarDadosSupabase({ client }).agendaProfissional(EU);
  assert.deepEqual(agenda.map((item) => item.id), [PEDIDO_MEU], "fica só a consulta em que a pessoa é a profissional");
  assert.equal(agenda[0].estado, "open");
  assert.equal(agenda[0].modalidade, "online");
  assert.equal(agenda[0].abre, "2026-11-06T12:45:00Z");
  // O pedido feito como cliente não passa pela checagem de profissional: fica na lista de cliente.
  assert.ok(!chamadas.rpc.some(([, args]) => args.p_request_id === PEDIDO_COMO_CLIENTE));
  assert.deepEqual(chamadas.from, ["appointment_requests"]);
  assert.ok(chamadas.rpc.every(([nome]) => nome === "appointment_room_context"));
});

test("a leitura usa só colunas liberadas, só consultas confirmadas e um teto", async () => {
  const { client, chamadas } = clienteFalso({ linhas: [], contextos: {} });
  await criarDadosSupabase({ client }).agendaProfissional(EU);
  const colunas = chamadas.select.split(",");
  for (const proibida of ["contact", "contact_type", "preferred_date", "*"]) assert.ok(!colunas.includes(proibida), proibida);
  assert.deepEqual(chamadas.filtros.find(([op, coluna]) => op === "not" && coluna === "professional_profile_id"), ["not", "professional_profile_id", "is", null]);
  assert.deepEqual(chamadas.filtros.find(([op, coluna]) => op === "eq" && coluna === "status"), ["eq", "status", "encerrada"]);
  assert.ok(chamadas.filtros.some(([op, n]) => op === "limit" && n > 0 && n <= 50));
});

test("administração sem consulta própria não vira profissional; falhas da RPC não vazam linhas", async () => {
  const { client } = clienteFalso({
    linhas: [linha(PEDIDO_MEU, OUTRA), linha(PEDIDO_ALHEIO, OUTRA)],
    contextos: { [PEDIDO_MEU]: { state: "denied" }, [PEDIDO_ALHEIO]: new Error("falhou") },
  });
  assert.deepEqual(await criarDadosSupabase({ client }).agendaProfissional(EU), []);
});

test("erro de leitura da tabela é erro, não agenda vazia silenciosa", async () => {
  const { client } = clienteFalso({ linhas: [], contextos: {}, erroTabela: { code: "42501", message: "negado" } });
  await assert.rejects(() => criarDadosSupabase({ client }).agendaProfissional(EU));
});

test("profissional vê a própria agenda, sem o formulário de cliente", () => {
  const html = atendimentos.renderizar({
    atendimentos: [], agendaProfissional: [{ id: PEDIDO_MEU, servico: "TESTE INTERNO", modalidade: "online", cliente: "Cliente E2E", estado: "open",
      inicio: "2026-11-06T13:00:00Z", fim: "2026-11-06T13:45:00Z", abre: "2026-11-06T12:45:00Z", fecha: "2026-11-06T14:15:00Z" }],
    atendimentoDisponivel: true, opcoesAtendimento: [], horariosAtendimento: [],
  });
  assert.match(html, /Sua agenda de atendimentos/);
  assert.match(html, /Como profissional/);
  assert.match(html, new RegExp(`/sala-atendimento\\.html\\?pedido=${PEDIDO_MEU}`));
  assert.match(html, /Cliente E2E/);
  assert.doesNotMatch(html, /Solicitar um atendimento/);
  assert.doesNotMatch(html, /data-form="atendimento"/);
});

test("fora da janela a tela não oferece a sala", () => {
  const base = { id: PEDIDO_MEU, servico: "X", modalidade: "online", estado: "too_early", abre: "2026-11-06T12:45:00Z", fecha: "2026-11-06T14:15:00Z" };
  assert.doesNotMatch(acessoDaConsultaProfissional(base), /sala-atendimento/);
  assert.match(acessoDaConsultaProfissional(base), /A sala abre às 09:45/);
  for (const estado of ["expired", "closed", "cancelled", "not_confirmed", "denied"]) {
    assert.equal(acessoDaConsultaProfissional({ ...base, estado }), "", estado);
  }
  // Presencial nunca ganha link de sala, nem com a janela aberta.
  assert.equal(acessoDaConsultaProfissional({ ...base, estado: "open", modalidade: "presencial" }), "");
  const html = atendimentos.renderizar({ agendaProfissional: [{ ...base, estado: "expired", inicio: "2026-11-06T08:55:00Z" }] });
  assert.match(html, /Consultas anteriores/);
  assert.match(html, /Nenhuma consulta futura atribuída a você/);
  assert.doesNotMatch(html, /sala-atendimento/);
});

test("quem atende e também é cliente vê as duas partes; cliente comum continua igual", () => {
  const pedidoDeCliente = { id: PEDIDO_COMO_CLIENTE, servico: "Acupuntura", modalidade: "online", status: "recebida", dataPreferida: "2026-11-20", periodoPreferido: "manha" };
  const ambos = atendimentos.renderizar({ atendimentos: [pedidoDeCliente], agendaProfissional: [{ id: PEDIDO_MEU, servico: "X", modalidade: "online", estado: "too_early", inicio: "2026-11-06T13:00:00Z", abre: "2026-11-06T12:45:00Z" }], atendimentoDisponivel: true });
  assert.match(ambos, /Sua agenda de atendimentos/);
  assert.match(ambos, /Solicitações pendentes/);
  const cliente = atendimentos.renderizar({ atendimentos: [pedidoDeCliente], atendimentoDisponivel: true, opcoesAtendimento: [], horariosAtendimento: [] });
  assert.doesNotMatch(cliente, /Sua agenda de atendimentos/);
  assert.match(cliente, /Solicitar um atendimento/);
});

test("nome de serviço e de cliente vêm escapados", () => {
  const html = atendimentos.renderizar({ agendaProfissional: [{ id: PEDIDO_MEU, servico: "<img src=x onerror=alert(1)>", modalidade: "online", cliente: "<b>c</b>", estado: "too_early", inicio: "2026-11-06T13:00:00Z", abre: "2026-11-06T12:45:00Z" }] });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<b>c<\/b>/);
});

test("o painel carrega a agenda de quem atende pela sessão e a demonstração não inventa profissional", async () => {
  const app = await readFile(new URL("../../outputs/js/conta/spa/app.js", import.meta.url), "utf8");
  assert.match(app, /sessao\.agendaProfissional\(\)/);
  assert.match(app, /dados\.agendaProfissional \|\|= \[\]/);
  const { criarDadosDemonstracao } = await import("../../outputs/js/conta/adaptadores/demonstracao.js").catch(() => ({}));
  const demo = await readFile(new URL("../../outputs/js/conta/adaptadores/demonstracao.js", import.meta.url), "utf8");
  assert.match(demo, /async agendaProfissional\(\) \{ return \[\]; \}/);
  void criarDadosDemonstracao;
});
