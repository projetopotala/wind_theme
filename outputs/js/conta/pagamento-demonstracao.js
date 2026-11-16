/*
 * DEMONSTRACAO DE PAGAMENTO DE CURSOS — nenhum pagamento real.
 *
 * Mostra o caminho do aluno (curso, valor, Pix ou cartao, aguardando,
 * aprovado, recusado, acesso ao curso) sem tocar em dinheiro, banco ou Asaas:
 * - so liga em ambiente local ou na Preview de branch da Vercel (protegida por
 *   login). No dominio oficial e nas URLs de deploy de Production fica desligada;
 * - vive inteira no navegador (sessionStorage), dentro da conta ficticia da
 *   demonstracao (?demo=pagamento). Nao chama Edge Function, RPC nem webhook;
 * - nunca pede numero de cartao nem gera codigo Pix pagavel.
 * A integracao real (create-course-payment-checkout + asaas-course-webhook)
 * continua intacta e e a unica que confirma pagamento, sempre no servidor.
 */

export const SELO_DEMONSTRACAO = "DEMONSTRAÇÃO — nenhum pagamento real";
export const CHAVE_PAGAMENTO_DEMO = "potala.demo.pagamento";
export const PEDIDO_DEMO_ID = "demo-pedido-curso";
export const PAGINA_PAGAMENTO_DEMO = "/pagamento-demonstracao.html";

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
/* So o alias de branch da Preview (wind-theme-git-<branch>-potala.vercel.app).
 * URLs de deploy com hash tambem servem Production, por isso ficam de fora. */
const PREVIEW_DE_BRANCH = /^wind-theme-git-[a-z0-9-]+-potala\.vercel\.app$/;

export function demonstracaoDePagamentoPermitida(local = globalThis.location) {
  const host = String(local?.hostname || "").toLowerCase();
  return HOSTS_LOCAIS.has(host) || PREVIEW_DE_BRANCH.test(host);
}

export const CURSO_DEMO = Object.freeze({
  titulo: "Meditação para o cotidiano (curso de demonstração)",
  modalidade: "online",
  precoCentavos: 48000,
  inicio: "Turma de demonstração — datas ilustrativas",
});

const ESTADOS = new Set(["aguardando", "aprovado", "recusado"]);

export function lerEstadoDemo(armazenamento = globalThis.sessionStorage) {
  try {
    const bruto = JSON.parse(armazenamento?.getItem(CHAVE_PAGAMENTO_DEMO) || "null");
    if (!bruto || bruto.ativo !== true) return null;
    return { ativo: true, estado: ESTADOS.has(bruto.estado) ? bruto.estado : null, metodo: bruto.metodo === "cartao" ? "cartao" : "pix" };
  } catch {
    return null;
  }
}

export function gravarEstadoDemo(parcial, armazenamento = globalThis.sessionStorage) {
  const atual = lerEstadoDemo(armazenamento) || { ativo: true, estado: null, metodo: "pix" };
  const proximo = { ...atual, ...parcial, ativo: true };
  try { armazenamento?.setItem(CHAVE_PAGAMENTO_DEMO, JSON.stringify(proximo)); } catch { /* sem armazenamento: so esta tela */ }
  return proximo;
}

export function ativarDemonstracaoDePagamento(local = globalThis.location, armazenamento = globalThis.sessionStorage) {
  if (!demonstracaoDePagamentoPermitida(local)) return false;
  if (!lerEstadoDemo(armazenamento)) gravarEstadoDemo({ estado: null, metodo: "pix" }, armazenamento);
  return true;
}

export function encerrarDemonstracaoDePagamento(armazenamento = globalThis.sessionStorage) {
  try { armazenamento?.removeItem(CHAVE_PAGAMENTO_DEMO); } catch { /* nada a limpar */ }
}

/* O "pedido" que o Meu Potala mostra na demonstracao. Nunca existe no banco. */
export function pedidoDemonstracao(estado) {
  const aprovado = estado?.estado === "aprovado";
  const notas = {
    aguardando: "Simulação: pagamento aguardando confirmação.",
    recusado: "Simulação: pagamento recusado. Você pode tentar de novo.",
    aprovado: "Simulação: pagamento aprovado e acesso liberado ao curso.",
  };
  return {
    id: PEDIDO_DEMO_ID,
    demonstracao: true,
    nota_demonstracao: notas[estado?.estado] || "Simulação: inscrição aprovada, falta o pagamento.",
    status: aprovado ? "matriculada" : "aguardando_pagamento",
    payment_status: null,
    checkout_url: null,
    course_title: CURSO_DEMO.titulo,
    mode: CURSO_DEMO.modalidade,
    price_cents: CURSO_DEMO.precoCentavos,
  };
}

export function reaisDemo(centavos) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
