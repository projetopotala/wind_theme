/*
 * Seções com imagem da Home: pausa a deriva das imagens que estão fora da tela.
 *
 * O movimento em si é CSS (css/secoes-imagem.css). Este arquivo só marca com `fora-de-vista` o
 * que não está visível, para a animação não gastar nada fora da tela. Não ouve a rolagem (usa
 * IntersectionObserver), não cria botão e não faz nada com movimento reduzido.
 */

const ALVOS = ".materia-slides, .portal-window, .people-scene";

export function iniciarSecoesImagem(janela = window) {
  const reduz = janela.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduz || typeof janela.IntersectionObserver !== "function") return () => {};
  const observador = new janela.IntersectionObserver((entradas) => {
    for (const entrada of entradas) entrada.target.classList.toggle("fora-de-vista", !entrada.isIntersecting);
  }, { rootMargin: "80px 0px" });
  const alvos = [...janela.document.querySelectorAll(ALVOS)];
  alvos.forEach((alvo) => {
    alvo.classList.add("fora-de-vista");
    observador.observe(alvo);
  });
  return () => observador.disconnect();
}

if (typeof window !== "undefined" && typeof document !== "undefined") iniciarSecoesImagem();
