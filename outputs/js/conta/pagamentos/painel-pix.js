// PAY-02: painel de pagamento por Pix de um atendimento (Meu Potala). Modulo PURO: recebe dados, devolve HTML.
//
// Regras:
//   * Nao cria cobranca: so desenha o formulario. Quem chama o servidor e o clique do cliente (app.js).
//   * O navegador nunca decide que um pagamento foi confirmado: mostra apenas o estado que o servidor gravou.
//   * Nunca desenha CPF/CNPJ de volta; o campo e sempre vazio e o valor digitado nao e guardado no painel.
//   * Todo texto vindo de fora e escapado; a imagem do QR so entra se for base64 puro.
import { formatarReais, situacaoFinanceira, textoParaCopiar } from "./apresentacao.js";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
const esc = (valor) => String(valor ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const ESTADOS_ABERTOS = new Set(["criando", "aguardando_pagamento"]);
const ESTADOS_COM_PIX = new Set(["aguardando_pagamento"]);

export const AJUDA_EM_CASO_DE_ERRO = "Se algo não funcionar, não pague de novo: fale com o Instituto e informe o seu atendimento.";

function quandoExpira(valor) {
  const data = valor ? new Date(valor) : null;
  return data && !Number.isNaN(data.valueOf())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(data)
    : "";
}

// Imagem do QR: so base64 puro e de tamanho razoavel; qualquer outra coisa e ignorada (o Copia e Cola continua valendo).
export function imagemDoQr(base64) {
  return typeof base64 === "string" && base64.length > 0 && base64.length <= 60000 && BASE64.test(base64)
    ? `data:image/png;base64,${base64}` : null;
}

function formularioDoPagador(pedidoId, invalido) {
  return `<p class="mp-nota">Para gerar o Pix precisamos do seu nome completo e do seu CPF ou CNPJ. O documento é enviado ao Asaas, nosso processador de pagamentos, e não fica guardado no Portal.</p>
    ${invalido ? "<p class=\"mp-aviso\" role=\"alert\">Confira o nome completo e o CPF ou CNPJ informados.</p>" : ""}
    <label>Nome completo
      <input type="text" name="nome" autocomplete="name" maxlength="120" required>
    </label>
    <label>CPF ou CNPJ
      <input type="text" name="documento" inputmode="numeric" autocomplete="off" maxlength="18" required>
    </label>`;
}

function blocoDoPix(pagamento, resultado) {
  const copia = textoParaCopiar(pagamento) ?? (typeof resultado?.pix?.copia_e_cola === "string" && resultado.pix.copia_e_cola ? resultado.pix.copia_e_cola : null);
  if (!copia) return "";
  const imagem = imagemDoQr(resultado?.pix?.imagem_base64);
  const expira = quandoExpira(pagamento?.pix_expires_at || resultado?.pix?.expira_em);
  return `<div class="mp-pix" data-pix>
    ${imagem ? `<img class="mp-pix-qr" src="${esc(imagem)}" alt="QR Code do Pix para pagar o atendimento" width="200" height="200">` : ""}
    <label>Pix Copia e Cola
      <textarea class="mp-pix-codigo" readonly rows="4" data-pix-codigo>${esc(copia)}</textarea>
    </label>
    <button class="mp-botao" type="button" data-acao="copiar-pix" data-id="${esc(pagamento?.request_id || "")}">Copiar código Pix</button>
    ${expira ? `<p class="mp-nota">Pague até ${esc(expira)}. Depois disso o horário volta a ficar disponível.</p>` : ""}
  </div>`;
}

/*
 * pedido: { id, servico, profissional, inicio }  — o atendimento (so para o resumo)
 * pagamento: linha lida do banco (RLS: so a propria) ou null
 * resultado: resposta da ultima tentativa nesta tela: { pix, needsPayer, payerInvalid, mensagem, carregando } ou undefined
 */
export function painelPix({ pedido, pagamento = null, resultado = undefined } = {}) {
  const pedidoId = pedido?.id || "";
  const estado = pagamento?.status ?? (resultado?.pix ? "aguardando_pagamento" : null);
  const valor = Number.isInteger(pagamento?.amount_cents) ? formatarReais(pagamento.amount_cents) : null;
  const situacao = estado ? situacaoFinanceira(estado) : null;
  const carregando = resultado?.carregando === true;
  const podeGerar = !estado || (estado === "criando") || (ESTADOS_ABERTOS.has(estado) && !textoParaCopiar(pagamento) && !resultado?.pix);
  const linhas = [
    pedido?.servico ? `<li><span>Atendimento</span> ${esc(pedido.servico)}</li>` : "",
    pedido?.profissional ? `<li><span>Profissional</span> ${esc(pedido.profissional)}</li>` : "",
    pedido?.horario ? `<li><span>Horário</span> ${esc(pedido.horario)}</li>` : "",
    `<li><span>Valor</span> ${esc(valor ?? "Será exibido ao gerar o Pix")}</li>`,
    "<li><span>Forma de pagamento</span> Pix</li>",
    `<li><span>Situação</span> ${esc(situacao ? situacao.titulo : "Pagamento ainda não iniciado")}</li>`,
  ].join("");

  const pix = estado && ESTADOS_COM_PIX.has(estado) || resultado?.pix ? blocoDoPix(pagamento, resultado) : "";
  const explicacao = situacao ? `<p class="mp-nota">${esc(situacao.descricao)} ${esc(situacao.proximoPasso)}</p>` : "";
  const erro = resultado?.mensagem && !resultado?.needsPayer && !resultado?.payerInvalid
    ? `<p class="mp-aviso" role="alert" data-pix-erro>${esc(resultado.mensagem)} ${esc(AJUDA_EM_CASO_DE_ERRO)}</p>` : "";
  const formulario = podeGerar ? `<form class="mp-form mp-pix-form" data-form="pagar-pix" data-pedido="${esc(pedidoId)}" novalidate>
    ${resultado?.needsPayer || resultado?.payerInvalid ? formularioDoPagador(pedidoId, resultado.payerInvalid) : ""}
    <p class="mp-form-status" data-form-status role="status"></p>
    <button class="mp-botao" type="submit"${carregando ? " disabled aria-busy=\"true\"" : ""}>${resultado?.needsPayer || resultado?.payerInvalid ? "Gerar Pix" : "Pagar com Pix"}</button>
  </form>` : "";

  return `<section class="mp-pagamento" data-pagamento-pix data-status="${esc(estado || "nenhum")}" aria-label="Pagamento por Pix">
    <h4>Pagamento</h4>
    <ul class="mp-pagamento-resumo">${linhas}</ul>
    ${explicacao}${pix}${erro}${formulario}
    <p class="mp-nota">${esc(AJUDA_EM_CASO_DE_ERRO)}</p>
  </section>`;
}

// Corpo enviado a create-appointment-payment. So o que o servidor aceita; o valor e o servico nunca saem do navegador.
export function corpoDoPedidoDePagamento({ pedidoId, idempotencia, nome, documento }) {
  const corpo = { request_id: pedidoId, idempotency_key: idempotencia };
  if (typeof nome === "string" && nome.trim() && typeof documento === "string" && documento.trim()) corpo.payer = { nome: nome.trim(), cpf_cnpj: documento.trim() };
  return corpo;
}

// Traduz a resposta do servidor no estado exibido; nunca promove "pago" a partir de algo que o servidor nao gravou.
export function resultadoDaResposta(status, corpo) {
  const b = corpo && typeof corpo === "object" ? corpo : {};
  if (status === 200 && b.pix_ready === true && b.pix && typeof b.pix.copia_e_cola === "string") return { pix: b.pix, estado: b.status };
  if (status === 200) return { estado: b.status, mensagem: "O Pix ainda está sendo preparado. Aguarde alguns instantes e atualize a página." };
  if (status === 422 && b.needs_payer) return { needsPayer: true };
  if (status === 422 && b.payer_invalid) return { payerInvalid: true };
  if (status === 401) return { mensagem: "Entre na sua conta para pagar." };
  if (status === 503) return { mensagem: "O pagamento ainda não está disponível." };
  if (status === 409) return { mensagem: "Seu pagamento anterior está sendo conferido. Aguarde antes de tentar de novo." };
  if (b.retry_same_request === true) return { mensagem: typeof b.message === "string" ? b.message : "O Pix ainda não está disponível. Tente de novo em instantes." };
  return { mensagem: "Não foi possível preparar o pagamento agora." };
}

// PAY-05: painel INFORMATIVO. Nunca desenha QR Code, Copia e Cola, botao nem formulario: so mostra valor e situacao que o servidor gravou.
const AGUARDANDO = new Set(["criando", "aguardando_pagamento", "em_processamento", "confirmado"]);

export function categoriaDoPagamento(pagamento, { leituraFalhou = false } = {}) {
  if (leituraFalhou) return "indisponivel";
  if (!pagamento || typeof pagamento.status !== "string") return "indisponivel";
  if (pagamento.status === "recebido") return "confirmado";
  if (pagamento.status === "vencido") return "expirado";
  if (AGUARDANDO.has(pagamento.status)) return "pendente";
  return "outro";
}

const TEXTOS_INFORMATIVOS = {
  pendente: { situacao: "Pagamento pendente", nota: "O pagamento deste atendimento ainda não foi concluído. Se você já pagou, aguarde: não é preciso pagar de novo." },
  confirmado: { situacao: "Pagamento confirmado", nota: "O Instituto recebeu o pagamento deste atendimento." },
  expirado: { situacao: "Pagamento expirado", nota: "O prazo para pagar terminou. Se você já pagou, aguarde a conferência; se não, fale com o Instituto." },
};

export function painelPixInformativo({ pedido, pagamento = null, leituraFalhou = false } = {}) {
  const categoria = categoriaDoPagamento(pagamento, { leituraFalhou });
  const valor = Number.isInteger(pagamento?.amount_cents) ? formatarReais(pagamento.amount_cents) : null;
  let situacao; let nota;
  if (categoria === "indisponivel") {
    situacao = "Pagamento por Pix ainda não disponível";
    nota = leituraFalhou
      ? "Não foi possível ver a situação do pagamento agora. Tente de novo em instantes."
      : "Quando o pagamento por Pix for liberado, avisaremos aqui. Você não precisa pagar nada agora.";
  } else if (categoria === "outro") {
    const s = situacaoFinanceira(pagamento.status);
    situacao = s.titulo; nota = `${s.descricao} ${s.proximoPasso}`;
  } else ({ situacao, nota } = TEXTOS_INFORMATIVOS[categoria]);
  const linhas = [
    pedido?.servico ? `<li><span>Atendimento</span> ${esc(pedido.servico)}</li>` : "",
    `<li><span>Valor</span> ${esc(valor ?? "Será informado antes de qualquer pagamento")}</li>`,
    "<li><span>Forma de pagamento</span> Pix</li>",
    `<li><span>Situação</span> ${esc(situacao)}</li>`,
  ].join("");
  return `<section class="mp-pagamento" data-pagamento-informativo data-categoria="${esc(categoria)}" data-status="${esc(pagamento?.status || "nenhum")}" aria-label="Situação do pagamento">
    <h4>Pagamento</h4>
    <ul class="mp-pagamento-resumo">${linhas}</ul>
    <p class="mp-nota">${esc(nota)}</p>
    <p class="mp-nota">${esc(AJUDA_EM_CASO_DE_ERRO)}</p>
  </section>`;
}
