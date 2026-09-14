/*
 * MINHA AGENDA POTALA.
 *
 * Uma linha do tempo, e não uma grade de calendário. A grade mostra com a mesma
 * força os dias vazios e os cheios — e quase todos os dias de quem faz uma aula
 * por semana são vazios. A linha mostra só o que existe, em ordem, com "Hoje" e
 * "Amanhã" ditos por extenso.
 *
 * Duas origens convivem: o que vem do Instituto (aulas e eventos em que a pessoa
 * se inscreveu) e o que ela mesma anota. Só o que é dela sai por aqui; o resto
 * muda quando muda a inscrição — e quem garante isso é o banco, não esta tela.
 */

import { agruparAgenda } from "../../leituras.js";
import { TIPOS_DE_COMPROMISSO } from "../../modelos.js";
import { e, secao, vazio } from "./comum.js";

function hora(valor) {
  const data = new Date(valor);
  const minutos = data.getMinutes();
  return minutos ? `${data.getHours()}h${String(minutos).padStart(2, "0")}` : `${data.getHours()}h`;
}

/* O dia de hoje no formato do <input type="date">, no fuso de quem está vendo. */
function diaDoCampo(agora) {
  const data = new Date(agora);
  return [data.getFullYear(), String(data.getMonth() + 1).padStart(2, "0"), String(data.getDate()).padStart(2, "0")].join("-");
}

function compromisso(item) {
  const origem = item.origem === "instituto" ? "Do Instituto" : "Anotado por você";
  const titulo = item.fonteHref ? `<a href="${e(item.fonteHref)}">${e(item.titulo)}</a>` : e(item.titulo);
  return `<li data-origem="${e(item.origem)}">
    <span class="mp-linha-marco" aria-hidden="true"></span>
    <p class="mp-linha-quando"><time datetime="${e(item.inicio)}">${e(hora(item.inicio))}</time>${item.fim ? ` – <time datetime="${e(item.fim)}">${e(hora(item.fim))}</time>` : ""}</p>
    <p class="mp-linha-titulo">${titulo}</p>
    <p class="mp-cartao-detalhe">${e([TIPOS_DE_COMPROMISSO[item.tipo], item.local, origem].filter(Boolean).join(" · "))}</p>
    ${item.origem === "pessoal" ? `<button type="button" class="mp-link-botao" data-acao="remover-compromisso" data-id="${e(item.id)}">Remover<span class="mp-sr"> ${e(item.titulo)} da agenda</span></button>` : ""}
  </li>`;
}

export default {
  renderizar({ agenda, agora }) {
    const grupos = agruparAgenda(agenda, agora);
    const linha = grupos.length
      ? `<ol class="mp-agenda">${grupos.map((grupo) => `
        <li>
          <h3 class="mp-agenda-data">${grupo.relativo ? `<span>${e(grupo.relativo)}</span> · ` : ""}${e(grupo.rotulo)}</h3>
          <ol class="mp-linha">${grupo.itens.map(compromisso).join("")}</ol>
        </li>`).join("")}</ol>`
      : vazio({ texto: "Nenhum compromisso pela frente.", link: { href: "/programacao.html", texto: "Ver a programação" } });

    const anotar = `<p class="mp-texto">As aulas e os eventos em que você se inscreve entram sozinhos. Aqui você anota o que é só seu — uma prática em casa, um encontro, uma leitura marcada.</p>
      <form class="mp-form mp-form-compromisso" data-form="compromisso" novalidate>
        <div class="mp-campo mp-campo-largo"><label for="mp-comp-titulo">O quê</label><input id="mp-comp-titulo" name="titulo" maxlength="160" required></div>
        <div class="mp-campo"><label for="mp-comp-data">Dia</label><input id="mp-comp-data" name="data" type="date" min="${diaDoCampo(agora)}" required></div>
        <div class="mp-campo"><label for="mp-comp-hora">Hora</label><input id="mp-comp-hora" name="hora" type="time" required></div>
        <div class="mp-campo mp-campo-largo"><label for="mp-comp-local">Onde <small>(opcional)</small></label><input id="mp-comp-local" name="local" maxlength="120"></div>
        <p class="mp-status-form" data-form-status role="status" aria-live="polite"></p>
        <button type="submit" class="mp-botao">Anotar na agenda</button>
      </form>`;

    return `${secao({ id: "mp-agenda", kicker: "Minha agenda Potala", titulo: "O que vem por aí", corpo: `<div data-foco-reserva tabindex="-1">${linha}</div>` })}
      ${secao({ id: "mp-agenda-anotar", classe: "mp-secao-discreta", kicker: "Anotar", titulo: "Um compromisso seu", corpo: anotar })}`;
  },
};
