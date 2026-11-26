import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGAMENTOS_PIX_ATIVO, PAGAMENTOS_PIX_INFORMATIVO } from "../../outputs/js/conta/pagamentos/config.js";
import { categoriaDoPagamento, painelPixInformativo } from "../../outputs/js/conta/pagamentos/painel-pix.js";
import atendimentos from "../../outputs/js/conta/spa/vistas/atendimentos.js";

/* PAY-05 | Painel Pix somente informativo: nunca desenha acao de pagar, QR Code nem Copia e Cola. Sem rede, sem banco. */
const ID = "11111111-1111-4111-8111-111111111111";
const PEDIDO = { id: ID, servico: "Atendimento teste" };
const LINHA = { request_id: ID, status: "aguardando_pagamento", amount_cents: 15000, pix_copy_paste: "00020126580014br.gov.bcb.pix0136TESTE", pix_expires_at: "2026-12-01T13:00:00Z" };
const PROIBIDOS = ["<form", "<button", "<img", "<textarea", "<input", "data-pix", "pagar-pix", "copiar-pix", "00020126", "Pagar com Pix", "base64"];

test("chaves: pagamento e exibicao informativa DESLIGADAS por padrao", () => {
  assert.equal(PAGAMENTOS_PIX_ATIVO, false);
  assert.equal(PAGAMENTOS_PIX_INFORMATIVO, false);
});

test("categorias: pendente, confirmado, expirado e indisponivel", () => {
  assert.equal(categoriaDoPagamento(null), "indisponivel");
  assert.equal(categoriaDoPagamento(LINHA, { leituraFalhou: true }), "indisponivel");
  for (const s of ["criando", "aguardando_pagamento", "em_processamento", "confirmado"]) assert.equal(categoriaDoPagamento({ status: s }), "pendente", s);
  assert.equal(categoriaDoPagamento({ status: "recebido" }), "confirmado");
  assert.equal(categoriaDoPagamento({ status: "vencido" }), "expirado");
  assert.equal(categoriaDoPagamento({ status: "divergente" }), "outro");
});

test("painel informativo | nenhum estado desenha acao, formulario, QR ou codigo Pix", () => {
  for (const pagamento of [null, ...["criando", "aguardando_pagamento", "em_processamento", "confirmado", "recebido", "vencido", "cancelado", "estornado", "em_contestacao", "divergente", "desconhecido"].map((status) => ({ ...LINHA, status }))]) {
    const h = painelPixInformativo({ pedido: PEDIDO, pagamento });
    for (const proibido of PROIBIDOS) assert.equal(h.includes(proibido), false, `${pagamento?.status}: ${proibido}`);
    assert.match(h, /não fale|fale com o Instituto/i);
  }
});

test("painel informativo | mensagens simples por estado e valor so quando o servidor gravou", () => {
  assert.match(painelPixInformativo({ pedido: PEDIDO }), /Pagamento por Pix ainda não disponível/);
  assert.match(painelPixInformativo({ pedido: PEDIDO }), /Será informado antes de qualquer pagamento/);
  assert.match(painelPixInformativo({ pedido: PEDIDO }), /não precisa pagar nada agora/);
  assert.match(painelPixInformativo({ pedido: PEDIDO, pagamento: LINHA }), /Pagamento pendente/);
  assert.match(painelPixInformativo({ pedido: PEDIDO, pagamento: LINHA }), /R\$\s?150,00/);
  assert.match(painelPixInformativo({ pedido: PEDIDO, pagamento: { ...LINHA, status: "recebido" } }), /Pagamento confirmado/);
  assert.match(painelPixInformativo({ pedido: PEDIDO, pagamento: { ...LINHA, status: "vencido" } }), /Pagamento expirado/);
  assert.match(painelPixInformativo({ pedido: PEDIDO, leituraFalhou: true }), /Não foi possível ver a situação/);
  assert.match(painelPixInformativo({ pedido: PEDIDO, pagamento: { ...LINHA, amount_cents: -1 } }), /Valor indisponível/);
});

test("painel informativo | texto de fora e escapado", () => {
  const h = painelPixInformativo({ pedido: { servico: "<img src=x onerror=alert(1)>" }, pagamento: { ...LINHA, status: "<script>1</script>" } });
  assert.equal(/<img|<script/.test(h), false);
});

const pedidoPendente = { id: ID, status: "recebida", servico: "Atendimento teste", modalidade: "online", dataPreferida: "2026-11-28", periodoPreferido: "manha", inicio: null };
const contexto = (extra = {}) => ({ atendimentos: [pedidoPendente], atendimentoDisponivel: false, agora: new Date("2026-11-25T12:00:00Z"), ...extra });

test("tela | sem a chave informativa a tela e IDENTICA a de antes", () => {
  const sem = atendimentos.renderizar(contexto());
  assert.equal(atendimentos.renderizar(contexto({ pagamentosPix: null })), sem);
  assert.equal(atendimentos.renderizar(contexto({ pagamentosPix: { ativo: false, porPedido: {} } })), sem);
  assert.equal(sem.includes("mp-pagamento"), false);
});

test("tela | com a chave informativa: so painel de leitura, em pedido aguardando, sem acao de pagar", () => {
  const html = atendimentos.renderizar(contexto({ pagamentosPix: { ativo: false, informativo: true, porPedido: { [ID]: LINHA } } }));
  assert.equal((html.match(/data-pagamento-informativo/g) || []).length, 1);
  for (const proibido of PROIBIDOS) assert.equal(html.includes(proibido), false, proibido);
  const outros = [{ ...pedidoPendente, id: "a", status: "cancelada" }, { ...pedidoPendente, id: "b", status: "encerrada", reservaId: null }];
  assert.equal(atendimentos.renderizar(contexto({ atendimentos: outros, pagamentosPix: { ativo: false, informativo: true, porPedido: {} } })).includes("data-pagamento-informativo"), false);
});

test("tela | erro de leitura e estado vazio nao quebram a tela", () => {
  const falha = atendimentos.renderizar(contexto({ pagamentosPix: { ativo: false, informativo: true, leituraFalhou: true, porPedido: {} } }));
  assert.match(falha, /Não foi possível ver a situação/);
  const vazio = atendimentos.renderizar(contexto({ atendimentos: [], pagamentosPix: { ativo: false, informativo: true, porPedido: {} } }));
  assert.equal(vazio.includes("data-pagamento-informativo"), false);
});

test("tela | chave de pagamento ligada continua mandando: painel completo, nao o informativo", () => {
  const html = atendimentos.renderizar(contexto({ pagamentosPix: { ativo: true, informativo: true, porPedido: {}, resultados: {} } }));
  assert.match(html, /data-pagamento-pix/); assert.equal(html.includes("data-pagamento-informativo"), false);
});
