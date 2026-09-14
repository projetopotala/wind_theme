/*
 * NOTIFICAÇÕES.
 *
 * Duas partes: os avisos e o que a pessoa quer receber. A segunda pesa mais que
 * a primeira. Um portal contemplativo que chama a atenção a toda hora contradiz
 * o que promete, e é aqui que a pessoa decide o quanto quer ser chamada.
 */

import { naoLidas, notificacoesPermitidas, preferenciaAtiva, quandoLegivel } from "../../leituras.js";
import { TIPOS_DE_NOTIFICACAO } from "../../modelos.js";
import { e, secao, vazio } from "./comum.js";

function aviso(item, agora) {
  const titulo = item.href
    ? `<a href="${e(item.href)}" data-acao="abrir-aviso" data-id="${e(item.id)}">${e(item.titulo)}</a>`
    : e(item.titulo);
  return `<li class="mp-aviso-item${item.lidaEm ? "" : " is-novo"}">
    <span class="mp-aviso-marca" aria-hidden="true"></span>
    <div>
      <p class="mp-linha-quando"><time datetime="${e(item.criadaEm)}">${e(quandoLegivel(item.criadaEm, agora))}</time>${item.lidaEm ? "" : "<span class=\"mp-sr\"> · novo</span>"}</p>
      <h3 class="mp-aviso-titulo">${titulo}</h3>
      ${item.corpo ? `<p class="mp-cartao-detalhe">${e(item.corpo)}</p>` : ""}
    </div>
    ${item.lidaEm ? "" : `<button type="button" class="mp-link-botao" data-acao="marcar-lida" data-id="${e(item.id)}">Marcar como lido<span class="mp-sr">: ${e(item.titulo)}</span></button>`}
  </li>`;
}

export default {
  renderizar({ notificacoes, preferencias, agora }) {
    const avisos = notificacoesPermitidas(notificacoes, preferencias);
    const novos = naoLidas(avisos);
    const titulo = !avisos.length ? "Sem avisos" : novos ? `${novos} ${novos === 1 ? "aviso novo" : "avisos novos"}` : "Tudo lido";

    const lista = avisos.length
      ? `<ul class="mp-avisos">${avisos.map((item) => aviso(item, agora)).join("")}</ul>`
      : vazio({ texto: "Nenhum aviso. Quando algo pedir a sua atenção, aparece aqui." });

    const escolhas = `<p class="mp-texto">Dois tipos já vêm desligados: novos conteúdos e lembretes de atividade. São os que mais crescem com o uso, e preferimos avisar pouco. Ligue o que fizer sentido para você.</p>
      <ul class="mp-preferencias">${TIPOS_DE_NOTIFICACAO.map((tipo) => `
        <li><label class="mp-interruptor" for="mp-pref-${e(tipo.id)}">
          <span><strong>${e(tipo.rotulo)}</strong><small>${e(tipo.descricao)}</small></span>
          <input type="checkbox" role="switch" id="mp-pref-${e(tipo.id)}" data-preferencia="${e(tipo.id)}"${preferenciaAtiva(tipo.id, preferencias) ? " checked" : ""}>
        </label></li>`).join("")}</ul>`;

    return `${secao({
      id: "mp-avisos",
      kicker: "Avisos",
      titulo,
      acao: novos ? "<button type=\"button\" class=\"mp-link-botao\" data-acao=\"marcar-todas\">Marcar todos como lidos</button>" : "",
      corpo: `<div data-foco-reserva tabindex="-1">${lista}</div>`,
    })}
      ${secao({ id: "mp-preferencias", kicker: "O que você quer receber", titulo: "Avisar pouco, e só o que importa", corpo: escolhas })}`;
  },
};
