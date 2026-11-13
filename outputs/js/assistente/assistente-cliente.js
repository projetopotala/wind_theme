/*
 * ASSISTENTE POTALA — cliente do navegador (IA-01).
 *
 * Fala só com a Edge Function assistente-potala, com a chave PUBLICÁVEL. A chave da
 * OpenAI nunca passa por aqui. Os limites que valem são os do backend; os daqui são
 * conforto (não deixar enviar texto que o servidor recusaria).
 *
 * Não importa supabase/config.js de propósito: em origem desconhecida (Preview) aquele
 * módulo bloqueia a página com um aviso. O endereço vem só das regras de ambiente.
 */
import { PROJETO_PRODUCAO, PUBLICAVEL_PRODUCAO, classificarOrigem } from "../supabase/ambiente.js";
import { linkPermitido, pontuar } from "./conhecimento.js";

export const LIMITE_PERGUNTA = 600;
export const MAX_HISTORICO = 12;
const CHAVE_SESSAO = "potala.assistente.v1";
const FUNCAO = "assistente-potala";

/* Onde está o backend nesta origem: Production fixo; LAB e local pelos arquivos de ambiente. Outras: nenhum. */
export async function resolverBackend(origem = globalThis.location?.origin || "", carregar = (c) => import(c)) {
  const tipo = classificarOrigem(origem);
  if (tipo === "producao") return { tipo, url: `https://${PROJETO_PRODUCAO}.supabase.co/functions/v1/${FUNCAO}`, chave: PUBLICAVEL_PRODUCAO };
  const arquivo = tipo === "lab" ? ["../supabase/ambiente-lab.js", "AMBIENTE_LAB"] : tipo === "local" ? ["../supabase/ambiente-local.js", "AMBIENTE_LOCAL"] : null;
  if (!arquivo) return { tipo, url: "", chave: "" };
  try {
    const perfil = (await carregar(arquivo[0]))[arquivo[1]];
    const url = String(perfil?.url || "").replace(/\/+$/, "");
    const chave = String(perfil?.publishableKey || "");
    if (/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url) && chave.startsWith("sb_publishable_")) return { tipo, url: `${url}/functions/v1/${FUNCAO}`, chave };
  } catch { /* sem arquivo de ambiente: sem backend */ }
  return { tipo, url: "", chave: "" };
}

const MENSAGENS_DE_ERRO = {
  400: "Não entendi a mensagem. Escreva sua pergunta em até 600 caracteres.",
  413: "A mensagem ficou grande demais. Resuma sua pergunta, por favor.",
  429: "Você fez muitas perguntas em pouco tempo. Aguarde um pouco e tente de novo.",
  rede: "Sem conexão com o assistente agora. Verifique a internet e tente de novo.",
  padrao: "Não consegui responder agora. Tente de novo em instantes ou fale com a Recepção.",
};

export class ErroDoAssistente extends Error {
  constructor(mensagem, status = 0) { super(mensagem); this.name = "ErroDoAssistente"; this.status = status; }
}

/* Links que o navegador aceita desenhar: os mesmos da regra do servidor, de novo. */
export function linksSeguros(links) {
  if (!Array.isArray(links)) return [];
  const vistos = new Set();
  return links.map((l) => ({ url: linkPermitido(l?.url), titulo: String(l?.titulo || "").replace(/\s+/g, " ").trim().slice(0, 80) }))
    .filter((l) => l.url && l.titulo && !vistos.has(l.url) && vistos.add(l.url))
    .slice(0, 4);
}

export function criarTransporteReal({ url, chave }, fetchImpl = globalThis.fetch?.bind(globalThis)) {
  const cabecalhos = { apikey: chave, "Content-Type": "application/json" };
  return {
    modo: "real",
    async ativo() {
      try {
        const r = await fetchImpl(url, { method: "GET", headers: { apikey: chave }, signal: AbortSignal.timeout(5000) });
        return r.ok && (await r.json())?.ativo === true;
      } catch { return false; }
    },
    async perguntar(mensagens) {
      let r;
      try {
        r = await fetchImpl(url, { method: "POST", headers: cabecalhos, body: JSON.stringify({ mensagens }), signal: AbortSignal.timeout(35000) });
      } catch { throw new ErroDoAssistente(MENSAGENS_DE_ERRO.rede); }
      let dados = null;
      try { dados = await r.json(); } catch { /* corpo inválido */ }
      if (!r.ok) {
        const mensagem = typeof dados?.mensagem === "string" && dados.mensagem.length < 300 ? dados.mensagem : (MENSAGENS_DE_ERRO[r.status] || MENSAGENS_DE_ERRO.padrao);
        throw new ErroDoAssistente(mensagem, r.status);
      }
      const resposta = String(dados?.resposta || "").slice(0, 1500).trim();
      if (!resposta) throw new ErroDoAssistente(MENSAGENS_DE_ERRO.padrao);
      return { resposta, links: linksSeguros(dados?.links) };
    },
  };
}

/*
 * MODO DE DEMONSTRAÇÃO (só fora de Production): sem IA e sem rede para a OpenAI.
 * Responde com as páginas públicas mais próximas da pergunta, dizendo que é simulado.
 */
export function criarTransporteSimulado({ carregarBase = () => fetch(new URL("../../ia/conhecimento.json", import.meta.url)).then((r) => r.json()) } = {}) {
  let base = null;
  return {
    modo: "simulado",
    async ativo() { return true; },
    async perguntar(mensagens) {
      base ||= await carregarBase().catch(() => ({ paginas: [] }));
      const pergunta = mensagens[mensagens.length - 1]?.texto || "";
      const achados = pontuar(pergunta, base.paginas || []).slice(0, 3);
      const links = linksSeguros((achados.length ? achados : (base.paginas || []).filter((p) => p.url === "recepcao.html")).map((p) => ({ url: p.url, titulo: p.titulo })));
      const resposta = achados.length
        ? `Modo de demonstração (sem IA): estas páginas do portal parecem relacionadas à sua pergunta. Na versão conectada, o assistente explica com base nelas.`
        : "Modo de demonstração (sem IA): não encontrei uma página relacionada. A Recepção pode orientar você.";
      return { resposta, links };
    },
  };
}

/* Conversa da sessão: sobrevive à navegação entre páginas, some ao fechar a aba. */
export function lerSessao(armazenamento = globalThis.sessionStorage) {
  try {
    const dados = JSON.parse(armazenamento?.getItem(CHAVE_SESSAO) || "null");
    if (!dados || !Array.isArray(dados.mensagens)) return { mensagens: [], aberto: false };
    const mensagens = dados.mensagens
      .filter((m) => (m?.papel === "usuario" || m?.papel === "assistente") && typeof m.texto === "string")
      .map((m) => ({ papel: m.papel, texto: m.texto.slice(0, 1500), links: m.papel === "assistente" ? linksSeguros(m.links) : [] }))
      .slice(-MAX_HISTORICO);
    return { mensagens, aberto: dados.aberto === true };
  } catch { return { mensagens: [], aberto: false }; }
}

export function salvarSessao(estado, armazenamento = globalThis.sessionStorage) {
  try { armazenamento?.setItem(CHAVE_SESSAO, JSON.stringify({ mensagens: estado.mensagens.slice(-MAX_HISTORICO), aberto: estado.aberto === true })); } catch { /* sem armazenamento: só a memória */ }
}

export function limparSessao(armazenamento = globalThis.sessionStorage) {
  try { armazenamento?.removeItem(CHAVE_SESSAO); } catch { /* nada a limpar */ }
}

/* O que vai ao servidor: só papel e texto (sem links), as últimas 8 mensagens, pergunta por último. */
export function mensagensParaEnvio(historico) {
  return historico.filter((m) => m.texto).slice(-8).map((m) => ({ papel: m.papel, texto: m.papel === "usuario" ? m.texto.slice(0, LIMITE_PERGUNTA) : m.texto.slice(0, 1200) }));
}
