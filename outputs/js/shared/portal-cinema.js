/*
 * CAMADA CINEMATOGRÁFICA — parte JavaScript (mínima)
 *
 *  1. Paralaxe de ponteiro: duas variáveis CSS (--cine-x, --cine-y, de -1 a 1) escritas SÓ
 *     nos elementos que as usam, com suavização e um laço rAF que para quando o valor assenta.
 *     Em toque, sem ponteiro fino ou com movimento reduzido, nada disso roda.
 *  2. Título da Chegada: recolhe quando a pessoa começa a agir.
 *
 * Nada aqui escuta a rolagem, bloqueia eventos ou depende de rede.
 */

const reduz = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const ponteiroFino = () => window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

const ALVOS = ".journey-prologue";

export function iniciarParalaxe(janela = window) {
  if (reduz() || !ponteiroFino()) return () => {};
  const doc = janela.document;
  let alvo = { x: 0, y: 0 };
  let atual = { x: 0, y: 0 };
  let quadro = 0;
  let elementos = [];

  const procurar = () => { elementos = [...doc.querySelectorAll(ALVOS)]; };
  const escrever = () => {
    quadro = 0;
    atual.x += (alvo.x - atual.x) * 0.08;
    atual.y += (alvo.y - atual.y) * 0.08;
    if (!elementos.length || elementos.some((e) => !e.isConnected)) procurar();
    for (const e of elementos) {
      e.style.setProperty("--cine-x", atual.x.toFixed(3));
      e.style.setProperty("--cine-y", atual.y.toFixed(3));
    }
    if (Math.abs(alvo.x - atual.x) > 0.002 || Math.abs(alvo.y - atual.y) > 0.002) quadro = janela.requestAnimationFrame(escrever);
  };
  const mover = (e) => {
    alvo = { x: (e.clientX / janela.innerWidth - 0.5) * 2, y: (e.clientY / janela.innerHeight - 0.5) * 2 };
    if (!quadro) quadro = janela.requestAnimationFrame(escrever);
  };
  janela.addEventListener("pointermove", mover, { passive: true });
  return () => { janela.removeEventListener("pointermove", mover); if (quadro) janela.cancelAnimationFrame(quadro); };
}

export function iniciarTituloDaChegada(doc = document) {
  if (!doc.querySelector(".cine-title")) return () => {};
  const calar = () => doc.documentElement.classList.add("cine-quieto");
  const tipos = ["wheel", "touchstart", "pointerdown", "keydown"];
  for (const t of tipos) window.addEventListener(t, calar, { passive: true, once: true });
  return () => { for (const t of tipos) window.removeEventListener(t, calar); };
}

function montar() {
  iniciarParalaxe();
  iniciarTituloDaChegada();
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar, { once: true });
  else montar();
}
