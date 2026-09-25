import { renderToString } from "react-dom/server";
import BlocosDaCena from "./BlocosDaCena.jsx";
import { BLOCOS } from "./blocos.js";

/* Usado só no build (scripts/build-cenas-blocos.mjs), para pré-renderizar os blocos de cada cena. */
export const CENAS = Object.keys(BLOCOS);

export function renderizar(cena) {
  return renderToString(<BlocosDaCena cena={cena} />);
}
