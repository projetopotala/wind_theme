import { hydrateRoot } from "react-dom/client";
import Home from "./Home.jsx";
import "./estilos/home.css";

/*
 * O HTML já chegou pronto (pré-renderizado no build): o React só assume essa
 * marcação e liga a coreografia. Nada é redesenhado.
 */
const raiz = document.getElementById("home-editorial");
if (raiz) hydrateRoot(raiz, <Home />);
