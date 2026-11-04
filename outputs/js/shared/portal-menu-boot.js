/* Monta o menu global nas páginas da jornada (chegada, Travessia, Home).
   Se a página já tem um cabeçalho com ações (.topbar .top-actions), o botão entra nele. */
import { mountPortalMenu } from "./portal-menu.js";

const montar = () => mountPortalMenu({ host: document.querySelector(".topbar .top-actions") });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar, { once: true });
else montar();
