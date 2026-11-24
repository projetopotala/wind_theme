/*
 * AULAS QUE VOCÊ MINISTRA (área profissional).
 *
 * Quem é o professor da turma — vínculo decidido no banco por my_teaching_courses() — vê as turmas
 * e entra na aula online sem inscrição e sem pagamento. O botão só existe quando o banco entregou
 * um link https válido DENTRO da janela (15 min antes até 30 min depois do fim); este arquivo não
 * concede nada nem calcula a janela: só mostra o que o banco devolveu.
 */

import { e, secao } from "./comum.js";

const FUSO = "America/Sao_Paulo";
const LINK_HTTPS = /^https:\/\/[a-z0-9][^\s<>"'\\]*$/i;
const diaNoFuso = (data) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(data);
const horaNoFuso = (data) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(data);

/* "hoje às 18:45", "amanhã às 09:00" ou "seg., 17 de nov. às 19:00", sempre em America/Sao_Paulo. */
export function quandoNoFuso(valor, agora = new Date()) {
  const data = new Date(valor);
  if (!valor || Number.isNaN(data.getTime())) return "";
  const hoje = Date.parse(`${diaNoFuso(agora)}T00:00:00Z`);
  const dias = Math.round((Date.parse(`${diaNoFuso(data)}T00:00:00Z`) - hoje) / 86400000);
  const hora = horaNoFuso(data);
  if (dias === 0) return `hoje às ${hora}`;
  if (dias === 1) return `amanhã às ${hora}`;
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short", day: "numeric", month: "short" }).format(data);
  return `${dia} às ${hora}`;
}

/* Sem link: antes da janela diz quando a sala abre; dentro dela, sem link cadastrado, avisa. */
export function avisoDeSala({ salaEstado, abreEm, proximaAula }, agora = new Date()) {
  if (salaEstado === "abre_depois" && abreEm) {
    return `<p class="mp-cartao-detalhe mp-aviso-aula">A sala abre ${e(quandoNoFuso(abreEm, agora))}, 15 minutos antes da aula. Atualize a página nesse horário.</p>`;
  }
  return proximaAula ? `<p class="mp-cartao-detalhe mp-aviso-aula">Link da aula ainda não disponível.</p>` : "";
}

export function acessoDaAulaDoProfessor(aula, agora = new Date()) {
  if (String(aula?.modalidade || "").toLowerCase() !== "online") return "";
  const link = String(aula.linkAula || "");
  if (link && link.length <= 2000 && LINK_HTTPS.test(link)) {
    return `<a class="mp-botao mp-botao-pequeno mp-botao-aula" href="${e(link)}" target="_blank" rel="noopener noreferrer">Entrar na aula online<span class="mp-sr"> de ${e(aula.curso)} (abre em nova aba)</span></a>`;
  }
  return avisoDeSala(aula, agora);
}

export function aulasDoProfessor(aulas = [], agora = new Date()) {
  const lista = (Array.isArray(aulas) ? aulas : []).filter((aula) => aula && aula.id);
  if (!lista.length) return "";
  const itens = lista.map((aula) => {
    const detalhe = [aula.modalidade, Number.isInteger(aula.alunos) ? `${aula.alunos} ${aula.alunos === 1 ? "aluno matriculado" : "alunos matriculados"}` : ""].filter(Boolean).join(" · ");
    return `<li class="mp-cartao mp-cartao-curso mp-cartao-professor" data-aula-professor="${e(aula.id)}">
    <div class="mp-cartao-corpo">
      <p class="mp-status" data-status="${e(aula.proximaAula ? "proximo_encontro" : "sem_aula")}">${aula.proximaAula ? "Próxima aula marcada" : "Nenhuma aula marcada"}</p>
      <h3 class="mp-cartao-titulo">${e(aula.curso)}</h3>
      ${detalhe ? `<p class="mp-cartao-detalhe">${e(detalhe)}</p>` : ""}
      ${aula.proximaAula ? `<p class="mp-cartao-detalhe mp-aula-quando">Próxima aula: <strong>${e(quandoNoFuso(aula.proximaAula, agora))}</strong></p>` : ""}
      ${acessoDaAulaDoProfessor(aula, agora)}
    </div>
  </li>`;
  }).join("");
  return secao({
    id: "mp-aulas-do-professor",
    classe: "mp-secao-profissional",
    kicker: "Como professor",
    titulo: "Aulas que você ministra",
    corpo: `<ul class="mp-lista-cartoes">${itens}</ul>`,
  });
}
