import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { PAGAMENTOS_PIX_ATIVO, SUPORTE_PILOTO_PIX } from "../../outputs/js/conta/pagamentos/config.js";
import { AJUDA_EM_CASO_DE_ERRO, AVISO_PRAZO_ENCERRADO, corpoDoPedidoDePagamento, imagemDoQr, imagemQrDoCopiaECola, painelPix, resultadoDaResposta } from "../../outputs/js/conta/pagamentos/painel-pix.js";
import atendimentos from "../../outputs/js/conta/spa/vistas/atendimentos.js";

/* PAY-02 | Interface Pix do Meu Potala: pura, escapada, desligada por padrao e sem cobranca automatica. Sem rede. */
const ID = "11111111-1111-4111-8111-111111111111";
const PEDIDO = { id: ID, servico: "Atendimento teste", horario: "quarta-feira, 26 de novembro de 2026 às 10:00" };
const PIX = { copia_e_cola: "00020126580014br.gov.bcb.pix0136TESTE", imagem_base64: "aW1hZ2Vt", expira_em: "2026-12-01 10:00:00" };
const PAGO = { request_id: ID, status: "aguardando_pagamento", amount_cents: 15000, pix_copy_paste: "00020126580014br.gov.bcb.pix0136TESTE", pix_expires_at: "2026-12-01T13:00:00Z" };

test("chave de exibicao: DESLIGADA por padrao e a pagina nao a ativa sozinha", () => {
  assert.equal(PAGAMENTOS_PIX_ATIVO, false);
  assert.equal(SUPORTE_PILOTO_PIX, true, "capacidade piloto depende da autorizacao vazia no servidor");
});

test("painel | sem pagamento: mostra resumo e UM botao; nao chama nada, nao mostra Pix nem erro", () => {
  const h = painelPix({ pedido: PEDIDO });
  assert.match(h, /Pagar com Pix/);
  assert.match(h, /data-form="pagar-pix"/);
  assert.match(h, /Atendimento teste/); assert.match(h, /Será exibido ao gerar o Pix/); assert.match(h, /Pagamento ainda não iniciado/);
  for (const ausente of ["data-pix>", "data-pix-erro", "name=\"documento\"", "<img"]) assert.equal(h.includes(ausente), false, ausente);
  assert.ok(h.includes(AJUDA_EM_CASO_DE_ERRO));
});

test("painel | pedindo dados do pagador: campos de nome e documento VAZIOS, sem repetir o que foi digitado", () => {
  const h = painelPix({ pedido: PEDIDO, resultado: { needsPayer: true } });
  assert.match(h, /name="nome"/); assert.match(h, /name="documento"/); assert.match(h, /autocomplete="off"/);
  assert.equal(/name="documento"[^>]*value=/.test(h) || /name="nome"[^>]*value=/.test(h), false);
  assert.match(h, /Gerar Pix/);
  assert.match(painelPix({ pedido: PEDIDO, resultado: { payerInvalid: true } }), /Confira o nome completo/);
});

test("painel | Pix gerado: QR, Copia e Cola, valor, validade e instrucoes; o servidor e quem diz que aguarda", () => {
  const h = painelPix({ pedido: PEDIDO, pagamento: PAGO, resultado: { pix: PIX } });
  assert.match(h, /<img class="mp-pix-qr" src="data:image\/png;base64,aW1hZ2Vt"/);
  assert.match(h, /<textarea[^>]*readonly[^>]*>00020126580014br\.gov\.bcb\.pix0136TESTE<\/textarea>/);
  assert.match(h, /R\$\s?150,00/); assert.match(h, /Aguardando o pagamento/); assert.match(h, /Pague até/); assert.match(h, /data-acao="copiar-pix"/);
  assert.equal(h.includes("data-form=\"pagar-pix\""), false, "ja ha Pix: nao oferece gerar outro");
});

test("painel | depois de recarregar, Copia e Cola e QR sao recompostos localmente sem nova cobranca", () => {
  const fabrica = () => ({ addData: (texto, modo) => assert.deepEqual([texto, modo], [PAGO.pix_copy_paste, "Byte"]), make() {}, createDataURL: () => "data:image/gif;base64,aW1hZ2Vt" });
  assert.equal(imagemQrDoCopiaECola(PAGO.pix_copy_paste, fabrica), "data:image/gif;base64,aW1hZ2Vt");
  const anterior = globalThis.qrcode; globalThis.qrcode = fabrica;
  try {
    const h = painelPix({ pedido: PEDIDO, pagamento: PAGO });
    assert.match(h, /data-pix/); assert.match(h, /<img[^>]+data:image\/gif;base64,aW1hZ2Vt/); assert.equal(h.includes("pagar-pix"), false);
  } finally { globalThis.qrcode = anterior; }
  assert.equal(imagemQrDoCopiaECola("", fabrica), null);
  assert.equal(imagemQrDoCopiaECola("x", () => { throw new Error("falha"); }), null);
});

test("painel | Pix com prazo vencido nao reaparece como QR ou Copia e Cola valido", () => {
  const h = painelPix({ pedido: PEDIDO, pagamento: { ...PAGO, pix_expires_at: "2020-01-01T00:00:00Z" } });
  assert.equal(h.includes("data-pix>"), false);
  assert.equal(h.includes("data-pix-codigo"), false);
  assert.equal(h.includes("mp-pix-qr"), false);
  assert.equal(h.includes("pagar-pix"), false, "cobranca existente nao oferece outra cobranca");
});

/* PAY-08 UX | prazo do Pix encerrado no navegador: o texto nao manda pagar por um codigo que nao aparece. */
const PASSADO = "2020-01-01T00:00:00Z";
const FUTURO = "2099-01-01T00:00:00Z";
const INSTRUCAO_DE_PAGAR = /Pague pelo QR Code|Pague até|antes do prazo/;

test("painel | prazo encerrado com status aguardando: sem QR, sem codigo, sem instrucao de pagar; avisa que o prazo terminou", () => {
  const h = painelPix({ pedido: PEDIDO, pagamento: { ...PAGO, pix_expires_at: PASSADO } });
  for (const ausente of ["data-pix>", "data-pix-codigo", "mp-pix-qr", "copiar-pix", "pagar-pix", "<img", "<textarea"]) assert.equal(h.includes(ausente), false, ausente);
  assert.equal(INSTRUCAO_DE_PAGAR.test(h), false, "nao orienta a pagar por codigo expirado");
  assert.ok(h.includes(AVISO_PRAZO_ENCERRADO));
  assert.match(h, /O prazo deste Pix terminou\. Estamos aguardando a atualização da situação do pagamento\. Se precisar de ajuda, entre em contato com o Instituto Potala\./);
  assert.match(h, /<p class="mp-aviso" role="status" data-pix-prazo-encerrado>/);
  assert.match(h, /data-status="aguardando_pagamento"/, "o status continua sendo o que o servidor gravou");
  assert.match(h, /Aguardando o pagamento/);
});

test("painel | prazo encerrado vindo da resposta da tentativa (sem linha no banco) tambem nao orienta a pagar", () => {
  const h = painelPix({ pedido: PEDIDO, resultado: { pix: { ...PIX, expira_em: PASSADO } } });
  assert.ok(h.includes(AVISO_PRAZO_ENCERRADO));
  assert.equal(INSTRUCAO_DE_PAGAR.test(h), false);
  assert.equal(h.includes("mp-pix-qr"), false);
});

test("painel | Pix dentro do prazo: QR, codigo, copiar e instrucoes seguem iguais; nenhum aviso de prazo encerrado", () => {
  const h = painelPix({ pedido: PEDIDO, pagamento: { ...PAGO, pix_expires_at: FUTURO }, resultado: { pix: PIX } });
  assert.match(h, /mp-pix-qr/); assert.match(h, /data-pix-codigo/); assert.match(h, /data-acao="copiar-pix"/);
  assert.match(h, /Pague pelo QR Code/); assert.match(h, /Pague até/);
  assert.equal(h.includes("data-pix-prazo-encerrado"), false);
  assert.equal(h.includes(AVISO_PRAZO_ENCERRADO), false);
});

test("painel | Pix valido sem prazo informado ou com data ilegivel nao e tratado como encerrado", () => {
  const semPrazo = { ...PAGO, pix_expires_at: null };
  assert.equal(painelPix({ pedido: PEDIDO, pagamento: semPrazo }).includes("data-pix-prazo-encerrado"), false);
  assert.equal(painelPix({ pedido: PEDIDO, pagamento: { ...PAGO, pix_expires_at: "nao-e-data" } }).includes("data-pix-prazo-encerrado"), false);
});

test("painel | vencido/recebido pelo servidor: continuam com o texto do status, sem o aviso de prazo do navegador", () => {
  const vencido = painelPix({ pedido: PEDIDO, pagamento: { ...PAGO, status: "vencido", pix_expires_at: PASSADO } });
  assert.match(vencido, /Pagamento vencido/); assert.match(vencido, /O prazo para pagar terminou/);
  assert.equal(vencido.includes("data-pix-prazo-encerrado"), false);
  const recebido = painelPix({ pedido: PEDIDO, pagamento: { ...PAGO, status: "recebido", pix_expires_at: PASSADO } });
  assert.match(recebido, /Pagamento recebido/); assert.match(recebido, /O valor foi recebido pelo Instituto/);
  assert.equal(recebido.includes("data-pix-prazo-encerrado"), false);
  assert.equal(recebido.includes("mp-pix-qr"), false);
});

test("painel | reload com QR ainda valido recompoe o QR localmente; apos o prazo, some e mostra so o aviso", () => {
  const fabrica = () => ({ addData() {}, make() {}, createDataURL: () => "data:image/gif;base64,aW1hZ2Vt" });
  const anterior = globalThis.qrcode; globalThis.qrcode = fabrica;
  try {
    const valido = painelPix({ pedido: PEDIDO, pagamento: { ...PAGO, pix_expires_at: FUTURO } });
    assert.match(valido, /<img[^>]+data:image\/gif;base64,aW1hZ2Vt/); assert.equal(valido.includes("data-pix-prazo-encerrado"), false);
    const vencido = painelPix({ pedido: PEDIDO, pagamento: { ...PAGO, pix_expires_at: PASSADO } });
    assert.equal(vencido.includes("<img"), false); assert.ok(vencido.includes("data-pix-prazo-encerrado"));
  } finally { globalThis.qrcode = anterior; }
});

test("painel | aviso de prazo encerrado nao cria botao de novo Pix e usa apenas o estilo de aviso ja responsivo do Portal", () => {
  const h = painelPix({ pedido: PEDIDO, pagamento: { ...PAGO, pix_expires_at: PASSADO } });
  assert.equal(/<button/.test(h), false, "sem botao: gerar outro Pix exige prova de seguranca no backend");
  const css = readFileSync(new URL("../../outputs/css/conta.css", import.meta.url), "utf8");
  assert.match(css, /\.mp-aviso\b/);
  assert.match(css, /\.mp-pagamento \{[^}]*min-width: 0/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.mp-pagamento \.mp-botao \{ width: 100%/);
});

test("painel | biblioteca vendorizada gera um QR real do payload persistido e corresponde ao SRI da pagina", () => {
  const arquivo = readFileSync(new URL("../../outputs/vendor/qrcode-generator-1.4.4.js", import.meta.url));
  const contextoQr = {};
  runInNewContext(arquivo.toString("utf8"), contextoQr);
  const imagem = imagemQrDoCopiaECola(PAGO.pix_copy_paste, contextoQr.qrcode);
  assert.match(imagem, /^data:image\/gif;base64,/);
  assert.ok(imagem.length > 500, "imagem contem a matriz QR, nao um placeholder");
  const sri = `sha256-${createHash("sha256").update(arquivo).digest("base64")}`;
  const html = readFileSync(new URL("../../outputs/meu-potala.html", import.meta.url), "utf8");
  assert.match(html, /\/vendor\/qrcode-generator-1\.4\.4\.js/);
  assert.ok(html.includes(`integrity="${sri}"`), "SRI fixa exatamente o arquivo auditado");
});

test("painel | estados: confirmado/recebido/vencido/cancelado/divergente nao oferecem novo Pix e nao pedem pagar de novo", () => {
  for (const status of ["em_processamento", "confirmado", "recebido", "vencido", "cancelado", "estornado", "em_contestacao", "divergente"]) {
    const h = painelPix({ pedido: PEDIDO, pagamento: { ...PAGO, status, pix_copy_paste: null } });
    assert.equal(h.includes("pagar-pix"), false, status);
    assert.equal(h.includes("data-pix>"), false, status);
    assert.match(h, new RegExp(`data-status="${status}"`));
  }
  assert.match(painelPix({ pedido: PEDIDO, pagamento: { ...PAGO, status: "recebido" } }), /Pagamento recebido/);
  assert.match(painelPix({ pedido: PEDIDO, pagamento: { ...PAGO, status: "divergente" } }), /Não pague de novo/);
});

test("painel | cobranca ainda 'criando' ou aberta sem Pix permite repetir o MESMO pedido (recuperacao), sem duplicar", () => {
  for (const status of ["criando", "aguardando_pagamento"]) {
    const h = painelPix({ pedido: PEDIDO, pagamento: { ...PAGO, status, pix_copy_paste: null } });
    assert.match(h, /data-form="pagar-pix"/, status);
  }
});

test("painel | erro mostra a mensagem e a orientacao de nao pagar de novo; botao fica desabilitado enquanto envia", () => {
  const e = painelPix({ pedido: PEDIDO, resultado: { mensagem: "O pagamento ainda não está disponível." } });
  assert.match(e, /data-pix-erro/); assert.match(e, /O pagamento ainda não está disponível\./); assert.ok(e.includes("não pague de novo"));
  assert.match(painelPix({ pedido: PEDIDO, resultado: { carregando: true } }), /<button[^>]*type="submit" disabled aria-busy="true"/);
});

test("painel | tudo que vem de fora e escapado; imagem do QR so se for base64 puro", () => {
  const h = painelPix({ pedido: { id: "\"><script>x</script>", servico: "<img src=x onerror=alert(1)>", horario: "<b>" }, pagamento: { ...PAGO, pix_copy_paste: "</textarea><script>1</script>" }, resultado: { pix: { imagem_base64: "\"onerror=\"alert(1)", copia_e_cola: "x" }, mensagem: "<i>erro</i>" } });
  for (const cru of ["<script>", "<img", "</textarea><script", "<b>", "<i>erro"]) assert.equal(h.includes(cru), false, cru);
  assert.ok(h.includes("&lt;img src=x onerror=alert(1)&gt;"), "o texto aparece escapado, nao interpretado");
  assert.equal(/<[a-z]+[^>]*\sonerror=/i.test(h), false, "nenhum atributo onerror em tag real");
  assert.equal(imagemDoQr("\"onerror=\"x"), null);
  assert.equal(imagemDoQr("javascript:alert(1)"), null);
  assert.equal(imagemDoQr("A".repeat(60001)), null);
  assert.equal(imagemDoQr(""), null); assert.equal(imagemDoQr(null), null); assert.equal(imagemDoQr({}), null);
  assert.equal(imagemDoQr("aW1hZ2Vt"), "data:image/png;base64,aW1hZ2Vt");
});

test("pedido ao servidor | so request_id, idempotency_key e, se houver, payer {nome, cpf_cnpj}; nunca valor, servico ou status", () => {
  assert.deepEqual(corpoDoPedidoDePagamento({ pedidoId: ID, idempotencia: "k" }), { request_id: ID, idempotency_key: "k" });
  assert.deepEqual(corpoDoPedidoDePagamento({ pedidoId: ID, idempotencia: "k", nome: " Maria da Silva ", documento: " 529.982.247-25 " }), { request_id: ID, idempotency_key: "k", payer: { nome: "Maria da Silva", cpf_cnpj: "529.982.247-25" } });
  assert.deepEqual(corpoDoPedidoDePagamento({ pedidoId: ID, idempotencia: "k", nome: "Maria da Silva", documento: "" }), { request_id: ID, idempotency_key: "k" });
  assert.deepEqual(Object.keys(corpoDoPedidoDePagamento({ pedidoId: ID, idempotencia: "k", nome: "A B", documento: "1", amount: 1, status: "recebido" })).sort(), ["idempotency_key", "payer", "request_id"]);
});

test("resposta do servidor | so 'pago' o que o servidor gravou; erros viram mensagens seguras", () => {
  assert.deepEqual(resultadoDaResposta(200, { pix_ready: true, status: "aguardando_pagamento", pix: PIX }), { pix: PIX, estado: "aguardando_pagamento" });
  assert.match(resultadoDaResposta(200, { pix_ready: false, status: "criando" }).mensagem, /sendo preparado/);
  assert.deepEqual(resultadoDaResposta(422, { needs_payer: true }), { needsPayer: true });
  assert.deepEqual(resultadoDaResposta(422, { payer_invalid: true }), { payerInvalid: true });
  assert.match(resultadoDaResposta(503, {}).mensagem, /ainda não está disponível/);
  assert.match(resultadoDaResposta(409, {}).mensagem, /sendo conferido/);
  assert.match(resultadoDaResposta(401, {}).mensagem, /Entre na sua conta/);
  assert.match(resultadoDaResposta(502, { retry_same_request: true, message: "tente" }).mensagem, /tente/);
  for (const [s, c] of [[500, null], [502, "texto"], [200, null], [418, []]]) assert.ok(resultadoDaResposta(s, c).mensagem, `${s}`);
  // um corpo hostil nunca produz Pix sem copia e cola
  assert.equal(resultadoDaResposta(200, { pix_ready: true, pix: { copia_e_cola: 1 } }).pix, undefined);
});

/* ---------------- Integracao com a tela de atendimentos ---------------- */
const pedidoPendente = { id: ID, status: "recebida", servico: "Atendimento teste", modalidade: "online", dataPreferida: "2026-11-28", periodoPreferido: "manha", inicio: null };
const contexto = (extra = {}) => ({ atendimentos: [pedidoPendente], atendimentoDisponivel: false, agora: new Date("2026-11-25T12:00:00Z"), ...extra });

test("tela | chave desligada (sem 'pagamentosPix'): a tela e IDENTICA a de antes e nao tem nada de pagamento", () => {
  const sem = atendimentos.renderizar(contexto());
  assert.equal(sem.includes("mp-pagamento"), false);
  assert.equal(sem.includes("pagar-pix"), false);
  assert.equal(atendimentos.renderizar(contexto({ pagamentosPix: null })), sem);
  assert.equal(atendimentos.renderizar(contexto({ pagamentosPix: { ativo: false, porPedido: {} } })), sem);
});

test("tela | chave ligada: painel so em pedido aguardando; confirmados, anteriores e cancelados nao ganham painel", () => {
  const pix = { ativo: true, porPedido: {}, resultados: {} };
  const html = atendimentos.renderizar(contexto({ pagamentosPix: pix }));
  assert.equal((html.match(/data-pagamento-pix/g) || []).length, 1);
  const outros = [{ ...pedidoPendente, id: "a", status: "cancelada" }, { ...pedidoPendente, id: "b", status: "encerrada", reservaId: null }];
  assert.equal(atendimentos.renderizar(contexto({ atendimentos: outros, pagamentosPix: pix })).includes("data-pagamento-pix"), false);
});

test("tela | piloto mostra o pagamento somente no pedido explicitamente autorizado pelo servidor", () => {
  const outro = { ...pedidoPendente, id: "22222222-2222-4222-8222-222222222222", servico: "Outro" };
  const html = atendimentos.renderizar(contexto({ atendimentos: [pedidoPendente, outro], pagamentosPix: { ativo: false, pedidosAutorizados: [ID], porPedido: {}, resultados: {} } }));
  assert.equal((html.match(/data-pagamento-pix/g) || []).length, 1);
  assert.match(html, new RegExp(`data-pedido="${ID}"`));
  assert.equal(html.includes(`data-pedido="${outro.id}"`), false);
});

test("tela | abrir a tela NUNCA gera cobranca: o painel e so HTML com botao; o servidor so e chamado no envio do formulario", () => {
  const pix = { ativo: true, porPedido: { [ID]: PAGO }, resultados: {} };
  const html = atendimentos.renderizar(contexto({ pagamentosPix: pix }));
  assert.match(html, /data-pix/);
  const app = readFileSync(new URL("../../outputs/js/conta/spa/app.js", import.meta.url), "utf8");
  const usos = [...app.matchAll(/criarPagamentoPix\(/g)];
  assert.equal(usos.length, 1, "uma unica chamada em app.js");
  const bloco = app.slice(app.indexOf("[data-form='pagar-pix']") - 300, app.indexOf("[data-form='pagar-pix']") + 1800);
  assert.ok(bloco.includes("criarPagamentoPix(") && bloco.includes("evento.preventDefault()"), "dentro do tratador do envio");
  assert.ok(app.includes("(PAGAMENTOS_PIX_ATIVO || SUPORTE_PILOTO_PIX) ? evento.target.closest?.(\"[data-form='pagar-pix']\")"), "tratador aceita apenas painel global ou piloto desenhado pelo servidor");
  assert.ok(app.includes("PAGAMENTOS_PIX_ATIVO || PAGAMENTOS_PIX_INFORMATIVO || SUPORTE_PILOTO_PIX"), "leitura segura contempla o piloto (PAY-08)");
  assert.ok(app.includes("sessao.pilotosPix()"), "elegibilidade vem do servidor");
});

test("adaptador de demonstracao nunca cobra: sem pagamentos e resposta de indisponivel, sem rede", () => {
  const src = readFileSync(new URL("../../outputs/js/conta/adaptadores/demonstracao.js", import.meta.url), "utf8");
  assert.ok(src.includes("async pagamentosPix() { return []; }"));
  assert.ok(src.includes("async pilotosPix() { return []; }"));
  assert.ok(src.includes("async criarPagamentoPix() { return { mensagem:"));
  assert.equal(/functions\.invoke|fetch\(/.test(src.slice(src.indexOf("async pagamentosPix()"), src.indexOf("async cancelarAtendimento()"))), false);
});

test("nada financeiro no navegador: sem chave Asaas, sem URL do provedor, sem calculo de valor", () => {
  for (const arq of ["pagamentos/painel-pix.js", "pagamentos/config.js", "pagamentos/apresentacao.js"]) {
    const src = readFileSync(new URL(`../../outputs/js/conta/${arq}`, import.meta.url), "utf8");
    for (const proibido of ["asaas.com", "access_token", "ASAAS_API_KEY", "api_key", "$aact_"]) assert.equal(src.includes(proibido), false, `${arq}: ${proibido}`);
  }
});
