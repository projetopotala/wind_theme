/*
 * AS PALAVRAS QUE A CONTA USA QUANDO ALGO NÃO DÁ CERTO.
 *
 * Um erro chega com um código — do Supabase, da validação daqui, da rede — e a
 * pessoa precisa de uma frase. Cada código tem a sua porque cada um pede uma
 * saída diferente: "senha errada" manda tentar de novo, "e-mail não confirmado"
 * manda abrir a caixa de entrada, "tentativas demais" manda esperar. Uma frase
 * única para todos faz a pessoa repetir o gesto que não vai funcionar.
 */

export class ErroDeConta extends Error {
  constructor(codigo, causa = null) {
    super(mensagemDoCodigo(codigo));
    this.name = "ErroDeConta";
    this.codigo = codigo;
    this.causa = causa;
  }
}

/*
 * O banco ainda não tem as tabelas pessoais.
 *
 * Não é uma falha da pessoa nem da rede: é um passo de implantação que não
 * aconteceu. Tem classe própria para ser reconhecível nos registros, mas NÃO
 * troca nada por dados de demonstração (MP-04): a tela diz que esta parte do
 * espaço ainda não está disponível, e o que é da pessoa nunca se mistura com o
 * que é fictício.
 */
export class DadosIndisponiveis extends Error {
  constructor(causa = null) {
    super(mensagemDoCodigo("DADOS_INDISPONIVEIS"));
    this.name = "DadosIndisponiveis";
    this.codigo = "DADOS_INDISPONIVEIS";
    this.causa = causa;
  }
}

const PADRAO = "Algo não saiu como esperado. Tente de novo em instantes.";

const MENSAGENS = new Map([
  ["CAMPOS_OBRIGATORIOS", "Preencha todos os campos."],
  ["NOME_OBRIGATORIO", "Diga como podemos te chamar."],
  ["EMAIL_INVALIDO", "Confira o e-mail: ele parece incompleto."],
  ["SENHA_CURTA", "Use uma senha com pelo menos 8 caracteres."],
  ["SENHAS_DIFERENTES", "As duas senhas não coincidem."],
  ["SEM_SESSAO", "Entre na sua conta para continuar."],
  ["SEM_CONEXAO", "Não conseguimos falar com o Potala agora. Confira sua conexão."],
  ["DADOS_INDISPONIVEIS", "Esta parte do seu espaço ainda não está disponível. Tente de novo mais tarde."],
  ["ATENDIMENTO_SEM_RECIBO", "Não conseguimos confirmar o recebimento da solicitação. Tente enviar de novo: o mesmo pedido não é duplicado. Nenhuma consulta foi confirmada."],
  ["ATENDIMENTO_ALTERADO", "A solicitação mudou desde a última tentativa. Revise os dados e envie de novo."],
  ["ATENDIMENTO_LIMITE", "Recebemos muitas solicitações agora. Tente de novo em instantes: o mesmo pedido não é duplicado."],
  ["ATENDIMENTO_SEM_PERMISSAO", "Para solicitar atendimento, entre na sua conta com o e-mail já confirmado."],
  ["ATENDIMENTO_RECUSADO", "Esta solicitação não pôde ser registrada. Revise o serviço, a modalidade e a data, ou fale com a Recepção."],
  ["invalid_credentials", "E-mail ou senha não conferem."],
  ["email_not_confirmed", "Seu e-mail ainda não foi confirmado. Procure a mensagem que enviamos."],
  ["user_already_exists", "Já existe uma conta com este e-mail. Tente entrar."],
  ["weak_password", "Essa senha é fácil de adivinhar. Tente uma mais longa."],
  ["over_request_rate_limit", "Muitas tentativas seguidas. Espere alguns minutos e tente de novo."],
  ["over_email_send_rate_limit", "Enviamos e-mails demais agora há pouco. Espere alguns minutos."],
  ["signup_disabled", "Novos cadastros estão pausados no momento."],
  ["email_address_invalid", "Este endereço de e-mail não é aceito."],
]);

export function mensagemDoCodigo(codigo) {
  return MENSAGENS.get(codigo) || PADRAO;
}

/*
 * O código de um erro, venha ele de onde vier.
 *
 * O Supabase nem sempre manda `code`: versões e rotas diferentes devolvem só a
 * mensagem em inglês. Ler a mensagem é o último recurso, e só para os casos em
 * que confundir a causa mandaria a pessoa para a saída errada.
 */
export function codigoDoErro(erro) {
  if (!erro) return null;
  if (erro.codigo) return erro.codigo;
  const codigo = erro.code || erro.error_code || null;
  if (codigo && MENSAGENS.has(codigo)) return codigo;
  const texto = String(erro.message || "");
  if (/already registered|already exists/i.test(texto)) return "user_already_exists";
  if (/email not confirmed/i.test(texto)) return "email_not_confirmed";
  if (/invalid login credentials/i.test(texto)) return "invalid_credentials";
  if (erro.name === "TypeError" && /fetch|network/i.test(texto)) return "SEM_CONEXAO";
  return codigo;
}

export function mensagemDoErro(erro) {
  return mensagemDoCodigo(codigoDoErro(erro));
}
