/*
 * AULAS QUE VOCÊ MINISTRA (área profissional).
 *
 * Quem é o professor da turma — vínculo decidido no banco por my_teaching_courses() — vê as turmas
 * e entra na aula online sem inscrição e sem pagamento. O botão só existe quando o banco entregou
 * um link https válido da próxima aula; este arquivo não concede nada.
 */

import { quandoLegivel } from "../../leituras.js";
import { e, secao } from "./comum.js";

const LINK_HTTPS = /^https:\/\/[a-z0-9][^\s<>"'\\]*$/i;

export function acessoDaAulaDoProfessor(aula) {
  if (String(aula?.modalidade || "").toLowerCase() !== "online") return "";
  const link = String(aula.linkAula || "");
  if (link && link.length <= 2000 && LINK_HTTPS.test(link)) {
    return `<a class="mp-botao mp-botao-pequeno mp-botao-aula" href="${e(link)}" target="_blank" rel="noopener noreferrer">Entrar na aula online<span class="mp-sr"> de ${e(aula.curso)} (abre em nova aba)</span></a>`;
  }
  return aula.proximaAula ? `<p class="mp-cartao-detalhe mp-aviso-aula">Link da aula ainda não disponível.</p>` : "";
}

export function aulasDoProfessor(aulas = [], agora = new Date()) {
  const lista = (Array.isArray(aulas) ? aulas : []).filter((aula) => aula && aula.id);
  if (!lista.length) return "";
  const itens = lista.map((aula) => {
    const detalhe = [aula.modalidade, Number.isInteger(aula.alunos) ? `${aula.alunos} ${aula.alunos === 1 ? "aluno matriculado" : "alunos matriculados"}` : ""].filter(Boolean).join(" · ");
    return `<li class="mp-cartao mp-cartao-curso" data-aula-professor="${e(aula.id)}">
    <div class="mp-cartao-corpo">
      <p class="mp-status" data-status="${e(aula.proximaAula ? "proximo_encontro" : "sem_aula")}">${aula.proximaAula ? "Próxima aula marcada" : "Nenhuma aula marcada"}</p>
      <h3 class="mp-cartao-titulo">${e(aula.curso)}</h3>
      ${detalhe ? `<p class="mp-cartao-detalhe">${e(detalhe)}</p>` : ""}
      ${aula.proximaAula ? `<p class="mp-cartao-detalhe">Próxima aula: <strong>${e(quandoLegivel(aula.proximaAula, agora))}</strong></p>` : ""}
      ${acessoDaAulaDoProfessor(aula)}
    </div>
  </li>`;
  }).join("");
  return secao({
    id: "mp-aulas-do-professor",
    kicker: "Como professor",
    titulo: "Aulas que você ministra",
    corpo: `<ul class="mp-lista-cartoes">${itens}</ul>`,
  });
}
