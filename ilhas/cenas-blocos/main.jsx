import { hydrateRoot } from "react-dom/client";
import BlocosDaCena from "./BlocosDaCena.jsx";

/*
 * Os blocos de cada cena já chegaram prontos no HTML (pré-renderizados por
 * scripts/build-cenas-blocos.mjs): o React só assume essa marcação e liga a
 * luz e o ícone animado. Nada é redesenhado, e a página não muda de altura.
 */
document.querySelectorAll("[data-blocos-cena]").forEach((raiz) => {
  hydrateRoot(raiz, <BlocosDaCena cena={raiz.dataset.blocosCena} />);
});
