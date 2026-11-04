/* Monta o menu global nas páginas da jornada (chegada, Travessia, Home) e, sem criar outro menu,
   nos cabeçalhos próprios do Blog público (.cad-cabecalho) e do Meu Potala (.mp-topo).
   Se a página já tem um cabeçalho com ações (.topbar .top-actions), o botão entra nele. */
import { mountPortalMenu } from "./portal-menu.js";

function opcoes() {
  const topbar = document.querySelector(".topbar .top-actions");
  if (topbar) return { host: topbar };
  const caderno = document.querySelector(".cad-cabecalho");
  if (caderno) return { host: caderno };
  const conta = document.querySelector(".mp-topo");
  /* O Meu Potala responde também por subrotas (/meu-potala/salvos): destinos absolutos. */
  if (conta) return { host: conta, antes: conta.querySelector("[data-conta-gatilho]"), base: "/" };
  return {};
}

const montar = () => mountPortalMenu(opcoes());
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar, { once: true });
else montar();
