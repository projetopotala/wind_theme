// PAY-02: validacao de CPF/CNPJ e nome do pagador, no BACKEND. Funcoes puras, sem I/O e sem log.
// O documento completo so existe em memoria durante a requisicao: e enviado ao Asaas na criacao do cliente e
// descartado. O banco guarda apenas o tipo e os 4 ultimos digitos (ver pay_payer_profiles).

export type Documento = { tipo: "cpf" | "cnpj"; digitos: string; ultimos4: string };

const soDigitos = (v: string) => v.replace(/[.\-/\s]/g, "");

function digitoCpf(base: string, pesoInicial: number): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  return digitoCpf(d.slice(0, 9), 10) === Number(d[9]) && digitoCpf(d.slice(0, 10), 11) === Number(d[10]);
}

function digitoCnpj(base: string): number {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function cnpjValido(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  return digitoCnpj(d.slice(0, 12)) === Number(d[12]) && digitoCnpj(d.slice(0, 13)) === Number(d[13]);
}

// Aceita so texto; formatos com pontuacao comum sao normalizados. Qualquer outra coisa (numero, objeto, letras) falha.
export function validarDocumento(bruto: unknown): Documento | null {
  if (typeof bruto !== "string" || bruto.length === 0 || bruto.length > 24) return null;
  const limpo = soDigitos(bruto);
  if (!/^\d+$/.test(limpo)) return null;
  if (limpo.length === 11 && cpfValido(limpo)) return { tipo: "cpf", digitos: limpo, ultimos4: limpo.slice(-4) };
  if (limpo.length === 14 && cnpjValido(limpo)) return { tipo: "cnpj", digitos: limpo, ultimos4: limpo.slice(-4) };
  return null;
}

// Nome do pagador: 3 a 120 caracteres, ao menos duas palavras, sem controle nem digitos em excesso.
export function validarNomePagador(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const nome = bruto.normalize("NFC").replace(/\s+/g, " ").trim();
  if (nome.length < 3 || nome.length > 120) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(nome) || (nome.match(/\d/g) ?? []).length > 4) return null;
  return nome.split(" ").length >= 2 ? nome : null;
}
