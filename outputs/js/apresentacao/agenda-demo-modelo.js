/*
 * AGENDA DE ATENDIMENTOS (SIMULAÇÃO PARA APRESENTAÇÃO).
 *
 * Modelo puro, sem rede e sem gravação. Serviço -> Profissional -> Data -> Horário
 * -> Resumo -> Confirmação simulada. As datas e os horários abaixo são de EXEMPLO:
 * não existem na agenda oficial, não bloqueiam nenhuma vaga e nada é enviado.
 * Serviços e responsáveis vêm do catálogo de demonstração (programação pública).
 */
import { formatarPreco, gerarProtocolo } from "../ofertas/ofertas-modelo.js";

export const PASSOS = Object.freeze(["servico", "profissional", "data", "horario", "resumo", "confirmacao"]);

export const ROTULO_DOS_PASSOS = Object.freeze({
  servico: "Serviço",
  profissional: "Profissional",
  data: "Data",
  horario: "Horário",
  resumo: "Resumo",
  confirmacao: "Confirmação",
});

export const AVISO_DA_AGENDA = "SIMULAÇÃO: nenhum horário foi reservado, nenhuma cobrança foi feita e nada foi enviado.";

export const DATAS_DE_EXEMPLO = Object.freeze([
  Object.freeze({ id: "2026-11-17", rotulo: "Terça, 17/11" }),
  Object.freeze({ id: "2026-11-18", rotulo: "Quarta, 18/11" }),
  Object.freeze({ id: "2026-11-19", rotulo: "Quinta, 19/11" }),
]);

export const HORARIOS_DE_EXEMPLO = Object.freeze([
  Object.freeze({ id: "09:00", rotulo: "9h", disponivel: true }),
  Object.freeze({ id: "10:30", rotulo: "10h30", disponivel: false }),
  Object.freeze({ id: "14:00", rotulo: "14h", disponivel: true }),
  Object.freeze({ id: "15:30", rotulo: "15h30", disponivel: true }),
]);

/* Atendimentos individuais e a Sessão de Clareza: o que o catálogo oferece com horário agendado. */
export function servicosDeAtendimento(ofertas = []) {
  return ofertas.filter((o) => o?.modalidade === "atendimento" || o?.id === "solidario-sessao-de-clareza");
}

/* Profissional vem do campo "responsavel" do catálogo; não se inventa ninguém. */
export function profissionaisDoServico(servico) {
  if (!servico?.responsavel) return [];
  return [{ id: String(servico.responsavel).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), nome: servico.responsavel }];
}

export function estadoInicial() {
  return { indice: 0, servico: null, profissional: null, data: null, horario: null, protocolo: "" };
}

export function escolhaDoPasso(estado, passo) {
  return { servico: estado.servico, profissional: estado.profissional, data: estado.data, horario: estado.horario }[passo] || null;
}

/* Só avança com a escolha do passo feita; Resumo e Confirmação não pedem escolha. */
export function podeAvancar(estado) {
  const passo = PASSOS[estado.indice];
  if (passo === "resumo" || passo === "confirmacao") return true;
  return Boolean(escolhaDoPasso(estado, passo));
}

/* Trocar uma escolha anterior descarta as seguintes, para o resumo nunca misturar caminhos. */
export function escolher(estado, passo, valor) {
  const proximo = { ...estado, [passo]: valor };
  for (const p of PASSOS.slice(PASSOS.indexOf(passo) + 1)) if (p in proximo && p !== "protocolo") proximo[p] = null;
  return proximo;
}

export function resumoDaSimulacao(estado) {
  const { servico, profissional, data, horario } = estado;
  if (!servico || !profissional || !data || !horario) return null;
  return {
    servico: servico.titulo,
    profissional: profissional.nome,
    data: data.rotulo,
    horario: horario.rotulo,
    formato: servico.formato === "online" ? "Online" : "Presencial",
    valor: `${formatarPreco(servico)} (ilustrativo)`,
  };
}

export function confirmar(estado, instante = Date.now(), aleatorio = Math.random()) {
  if (!resumoDaSimulacao(estado)) throw new Error("Escolha serviço, profissional, data e horário antes de confirmar.");
  return { ...estado, indice: PASSOS.indexOf("confirmacao"), protocolo: gerarProtocolo(estado.servico, instante, aleatorio) };
}
