/*
 * Abertura de Atendimentos: pausa a cena quando ela sai da tela.
 *
 * O movimento é todo CSS (css/atendimentos-hero-vivo.css). Este arquivo só marca a cena com
 * `fora-de-cena` enquanto ela não está visível, para o navegador não compor camadas que
 * ninguém vê. Não ouve a rolagem, não cria botão e não faz nada com movimento reduzido.
 */

export function iniciarCenaViva(janela = window) {
  if (janela.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {};
  if (typeof janela.IntersectionObserver !== "function") return () => {};
  const cena = janela.document.querySelector(".cena-viva");
  if (!cena) return () => {};
  const observador = new janela.IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) entrada.target.classList.toggle("fora-de-cena", !entrada.isIntersecting);
    },
    { rootMargin: "60px 0px" },
  );
  observador.observe(cena);
  return () => observador.disconnect();
}

if (typeof window !== "undefined" && typeof document !== "undefined") iniciarCenaViva();
