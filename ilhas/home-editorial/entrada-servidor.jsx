import { renderToString } from "react-dom/server";
import Home from "./Home.jsx";

/* Usado só no build (scripts/build-home-editorial.mjs), para pré-renderizar a Home. */
export function renderizar() {
  return renderToString(<Home />);
}
