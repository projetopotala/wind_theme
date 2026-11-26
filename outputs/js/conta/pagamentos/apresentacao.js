// PAY-01: textos e formatacao da situacao financeira de um atendimento no Meu Potala.
// Modulo puro e AINDA NAO LIGADO a nenhuma tela (nenhuma tela existente foi substituida; PAY-02 o conecta, atras de flag).
// O navegador apenas MOSTRA o estado que o servidor gravou; nunca decide que um pagamento foi confirmado.

const REAL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarReais(centavos) {
  if (!Number.isInteger(centavos) || centavos < 0) return "Valor indisponível";
  return REAL.format(centavos / 100);
}

const SITUACOES = {
  criando: { titulo: "Preparando o pagamento", descricao: "Estamos gerando o seu Pix.", proximoPasso: "Aguarde alguns segundos.", tom: "neutro", pagoComSucesso: false },
  aguardando_pagamento: { titulo: "Aguardando o pagamento", descricao: "O Pix foi gerado e ainda não foi pago.", proximoPasso: "Pague pelo QR Code ou pelo Pix Copia e Cola antes do prazo.", tom: "atencao", pagoComSucesso: false },
  em_processamento: { titulo: "Pagamento em análise", descricao: "Recebemos o seu pagamento e ele está sendo conferido.", proximoPasso: "Não é preciso pagar de novo. Avisaremos quando terminar.", tom: "neutro", pagoComSucesso: false },
  confirmado: { titulo: "Pagamento identificado", descricao: "O banco informou o pagamento; falta a compensação final.", proximoPasso: "Seu horário continua reservado. Avisaremos quando for confirmado.", tom: "neutro", pagoComSucesso: false },
  recebido: { titulo: "Pagamento recebido", descricao: "O valor foi recebido pelo Instituto.", proximoPasso: "A confirmação do atendimento segue o fluxo do profissional.", tom: "sucesso", pagoComSucesso: true },
  vencido: { titulo: "Pagamento vencido", descricao: "O prazo para pagar terminou.", proximoPasso: "Se você já pagou, aguarde: conferimos pagamentos tardios. Se não, peça um novo horário.", tom: "atencao", pagoComSucesso: false },
  cancelado: { titulo: "Cobrança cancelada", descricao: "Esta cobrança não está mais ativa.", proximoPasso: "Se precisar, solicite o atendimento novamente.", tom: "atencao", pagoComSucesso: false },
  estornado: { titulo: "Pagamento estornado", descricao: "O valor foi devolvido.", proximoPasso: "A devolução aparece na forma de pagamento usada, no prazo do seu banco.", tom: "neutro", pagoComSucesso: false },
  em_contestacao: { titulo: "Pagamento em contestação", descricao: "O pagamento está sendo analisado por contestação.", proximoPasso: "Fale com o Instituto se precisar de ajuda.", tom: "atencao", pagoComSucesso: false },
  divergente: { titulo: "Pagamento em conferência", descricao: "Encontramos uma diferença que a equipe precisa conferir.", proximoPasso: "Não pague de novo. A equipe do Instituto entrará em contato.", tom: "atencao", pagoComSucesso: false },
};

export function situacaoFinanceira(estado) {
  return SITUACOES[estado] ?? { titulo: "Situação indisponível", descricao: "Não foi possível ler a situação do pagamento.", proximoPasso: "Tente novamente em instantes ou fale com o Instituto.", tom: "atencao", pagoComSucesso: false };
}

// Resumo exibido ao cliente: servico, profissional, data/horario, valor, forma, situacao, o que acontece depois e o que fazer em caso de erro.
export function resumoCobranca({ servico, profissional, inicio, valorCentavos, estado }) {
  const s = situacaoFinanceira(estado);
  const quando = inicio ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(inicio)) : "Data a confirmar";
  return {
    servico: servico || "Atendimento", profissional: profissional || "Profissional a confirmar", quando,
    valor: formatarReais(valorCentavos), forma: "Pix", situacao: s.titulo, explicacao: s.descricao, proximoPasso: s.proximoPasso, tom: s.tom,
    emCasoDeErro: "Se algo não funcionar, não pague de novo: fale com o Instituto e informe o seu atendimento.",
  };
}

// Pix Copia e Cola: o texto e copiado como esta; nunca reescrito nem montado no navegador.
export function textoParaCopiar(pagamento) {
  return typeof pagamento?.pix_copy_paste === "string" && pagamento.pix_copy_paste.length > 0 ? pagamento.pix_copy_paste : null;
}
