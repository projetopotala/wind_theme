/*
 * HISTÓRICO.
 *
 * Hoje, Ontem, Esta semana, Antes. A pessoa apaga uma linha ou tudo — e "tudo"
 * pede um segundo toque, porque não há como desfazer. Só entra aqui o que foi
 * visitado com a conta aberta.
 */

import { agruparHistorico, quandoLegivel } from "../../leituras.js";
import { TIPOS_DE_ITEM } from "../../modelos.js";
import { e, secao, vazio } from "./comum.js";

/* Dentro de "Hoje" e "Ontem" o dia já foi dito: basta a hora. */
function quando(item, grupo, agora) {
  if (grupo !== "hoje" && grupo !== "ontem") return quandoLegivel(item.visitadoEm, agora);
  const data = new Date(item.visitadoEm);
  const minutos = data.getMinutes();
  return minutos ? `${data.getHours()}h${String(minutos).padStart(2, "0")}` : `${data.getHours()}h`;
}

export default {
  renderizar({ historico, agora }) {
    const grupos = agruparHistorico(historico, agora);
    if (!grupos.length) {
      return secao({
        id: "mp-historico",
        kicker: "Histórico",
        titulo: "Nada por aqui ainda",
        corpo: vazio({ texto: "Os textos, cursos e páginas que você visitar com a conta aberta aparecem aqui, do mais recente ao mais antigo.", link: { href: "/transcendido.html", texto: "Voltar à travessia" } }),
      });
    }

    const corpo = grupos.map((grupo) => `
      <section class="mp-historico-grupo" aria-labelledby="mp-hist-${grupo.id}">
        <h3 class="mp-grupo-titulo" id="mp-hist-${grupo.id}">${e(grupo.rotulo)}</h3>
        <ul class="mp-lista-historico">${grupo.itens.map((item) => `
          <li>
            <time datetime="${e(item.visitadoEm)}">${e(quando(item, grupo.id, agora))}</time>
            <div>
              <p class="mp-cartao-tipo">${e(TIPOS_DE_ITEM[item.tipo])}</p>
              <a href="${e(item.href)}">${e(item.titulo)}</a>
              ${item.progresso > 0 && item.progresso < 1 ? `<p class="mp-cartao-detalhe">${Math.round(item.progresso * 100)}% percorrido</p>` : ""}
            </div>
            <button type="button" class="mp-link-botao" data-acao="remover-historico" data-id="${e(item.id)}">Remover<span class="mp-sr"> ${e(item.titulo)} do histórico</span></button>
          </li>`).join("")}</ul>
      </section>`).join("");

    return secao({
      id: "mp-historico",
      kicker: "Histórico",
      titulo: "Por onde você andou",
      acao: "<button type=\"button\" class=\"mp-link-botao\" id=\"mp-limpar-historico\" data-acao=\"limpar-historico\">Limpar histórico</button>",
      corpo: `<div data-foco-reserva tabindex="-1">${corpo}</div>`,
    });
  },
};
