import assert from "node:assert/strict";
import test from "node:test";

import { criarDadosSupabase } from "../../outputs/js/conta/adaptadores/supabase.js";
import { ErroDeConta, mensagemDoErro } from "../../outputs/js/conta/mensagens.js";
import vista from "../../outputs/js/conta/spa/vistas/atendimentos.js";

/* Front: o cliente recebe a frase certa para cada recusa do limite, e o seletor de servico mostra a escolha. */
const PEDIDO = { idempotencia: "dddddddd-0000-4000-8000-000000000001", ofertaId: "of-1", modalidade: "online", dataPreferida: "2099-01-10", periodoPreferido: "tarde" };
const dados = (resposta) => criarDadosSupabase({ client: { from() { throw new Error("este teste nao le tabelas"); }, rpc: async () => resposta } });

test("PT429 'Limite de recebimento' (teto em 24h) tem frase propria, diferente da carga momentanea", async () => {
  await assert.rejects(dados({ data: null, error: { code: "PT429", message: "Limite de recebimento atingido. Tente mais tarde." } }).solicitarAtendimento(PEDIDO), (e) => e.codigo === "ATENDIMENTO_LIMITE_DIA");
  await assert.rejects(dados({ data: null, error: { code: "PT429", message: "Recebimento ocupado. Tente novamente com a mesma chave." } }).solicitarAtendimento(PEDIDO), (e) => e.codigo === "ATENDIMENTO_LIMITE");
  await assert.rejects(dados({ data: null, error: { code: "PT429", message: "x" } }).solicitarAtendimento(PEDIDO), (e) => e.codigo === "ATENDIMENTO_LIMITE");
  assert.match(mensagemDoErro(new ErroDeConta("ATENDIMENTO_LIMITE_DIA")), /24 horas/);
  assert.notEqual(mensagemDoErro(new ErroDeConta("ATENDIMENTO_LIMITE_DIA")), mensagemDoErro(new ErroDeConta("ATENDIMENTO_LIMITE")));
  assert.doesNotMatch(mensagemDoErro(new ErroDeConta("ATENDIMENTO_LIMITE_DIA")), /em instantes/, "nao promete que tentar de novo agora resolve");
});

test("resposta do backend: sucesso devolve o recibo; erro generico nao vira 'muitas solicitacoes'", async () => {
  const ok = await dados({ data: { id: "11111111-1111-4111-8111-111111111111", status: "recebida" }, error: null }).solicitarAtendimento(PEDIDO);
  assert.equal(ok.status, "recebida");
  await assert.rejects(dados({ data: null, error: { code: "XX000", message: "boom" } }).solicitarAtendimento(PEDIDO), (e) => !["ATENDIMENTO_LIMITE", "ATENDIMENTO_LIMITE_DIA"].includes(e.codigo));
});

test("seletor de servico: placeholder sem escolha e opcao marcada quando pre-selecionada", () => {
  const opcoes = [{ id: "of-1", service: "TESTE INTERNO Cadastro de Servico", professional: "", modality: "online" }];
  const base = { atendimentoDisponivel: true, opcoesAtendimento: opcoes, horariosAtendimento: [], agora: new Date("2026-11-17T12:00:00Z") };
  const sem = vista.renderizar({ ...base, parametros: new URLSearchParams("") });
  assert.match(sem, /<option value="">Escolha o serviço<\/option>/);
  assert.doesNotMatch(sem, /value="of-1"[^>]* selected/);
  const com = vista.renderizar({ ...base, parametros: new URLSearchParams("atendimento=of-1") });
  assert.match(com, /value="of-1"[^>]* selected/);
  assert.match(com, /TESTE INTERNO Cadastro de Servico · Online/);
});
