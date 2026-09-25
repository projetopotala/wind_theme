/*
 * As três leituras da página. Movimento reduzido não entra em nenhuma das
 * duas primeiras: com ele, nenhuma timeline é criada e a página fica estática.
 */
export const CONSULTAS = {
  computador: "(min-width: 861px) and (prefers-reduced-motion: no-preference)",
  celular: "(max-width: 860px) and (prefers-reduced-motion: no-preference)",
  reduzido: "(prefers-reduced-motion: reduce)",
};

export function movimentoReduzido() {
  return typeof matchMedia === "function" && matchMedia(CONSULTAS.reduzido).matches;
}
