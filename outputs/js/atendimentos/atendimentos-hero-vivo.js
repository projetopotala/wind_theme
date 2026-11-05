/*
 * Abertura de Atendimentos: pausa a cena quando ela sai da tela.
 *
 * Na Home, o movimento vem do vídeo real e este arquivo só define o `src` quando a pessoa não
 * pediu movimento reduzido. Nas demais cenas, continua pausando as camadas CSS fora da tela.
 * Não ouve a rolagem e não cria botão.
 */

export function iniciarCenaViva(janela = window) {
  if (janela.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {};
  const cena = janela.document.querySelector(".cena-viva");
  if (!cena) return () => {};
  const video = cena.querySelector(".cena-viva__video[data-src]");
  let descartada = false;

  const ativarVideo = () => {
    if (!video || descartada) return;
    cena.classList.add("cena-viva--video-ativo");
    video.play().catch(() => {});
  };

  const falharVideo = () => cena.classList.remove("cena-viva--video-ativo");

  if (video) {
    video.addEventListener("loadeddata", ativarVideo, { once: true });
    video.addEventListener("error", falharVideo);
    video.src = video.dataset.src;
    video.load();
  }

  if (typeof janela.IntersectionObserver !== "function") {
    return () => {
      descartada = true;
      video?.pause();
    };
  }
  const observador = new janela.IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        entrada.target.classList.toggle("fora-de-cena", !entrada.isIntersecting);
        if (!video) continue;
        if (entrada.isIntersecting) video.play().catch(() => {});
        else video.pause();
      }
    },
    { rootMargin: "60px 0px" },
  );
  observador.observe(cena);
  return () => {
    descartada = true;
    observador.disconnect();
    video?.pause();
    video?.removeEventListener("error", falharVideo);
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") iniciarCenaViva();
