// PAY-02: chave de exibicao do pagamento por Pix no Meu Potala.
// DESLIGADA. Enquanto for false, nenhuma parte do pagamento aparece, nenhuma leitura financeira e feita e nenhuma
// chamada e enviada ao servidor. Ligar esta chave NAO ativa cobrancas: o servidor tem travas proprias
// (PAYMENTS_ENABLED, PAYMENTS_PRODUCTION_ACK e a chave geral do banco) que continuam fechadas ate a autorizacao do Owner.
export const PAGAMENTOS_PIX_ATIVO = false;

// PAY-05: exibicao SOMENTE INFORMATIVA da situacao do pagamento (valor e estado), sem QR Code, sem Copia e Cola, sem botao
// e sem formulario. DESLIGADA por padrao: com false a tela publica nao muda. Nao gera cobranca nem chama o servidor financeiro;
// so le, quando ligada, as linhas de pagamento da propria pessoa (leitura protegida por RLS).
export const PAGAMENTOS_PIX_INFORMATIVO = false;
