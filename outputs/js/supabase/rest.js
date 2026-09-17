/*
 * O BANCO DO PORTAL PARA AS PÁGINAS PÚBLICAS, sem o SDK.
 *
 * Ler textos publicados, enviar um comentário ou um interesse são pedidos
 * HTTP simples ao PostgREST. Carregar os 130 KB do SDK em cada seção só para
 * isso pesaria na primeira visita. Quem precisa de sessão (painel, conta) usa
 * o SDK; aqui só vai a chave publicável, e o que ela pode fazer é decidido
 * pelas políticas RLS do banco.
 */
import { SUPABASE_CONFIG } from "./config.js";

export class RestError extends Error {
  constructor(message, { status = 0, code = "" } = {}) {
    super(message);
    this.name = "RestError";
    this.status = status;
    this.code = code;
  }
}

export function criarRestPublico({ config = SUPABASE_CONFIG, fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch indisponível.");
  const base = `${String(config.url).replace(/\/$/, "")}/rest/v1`;
  const cabecalhos = { apikey: config.publishableKey };

  async function pedir(caminho, opcoes = {}) {
    let resposta;
    try {
      resposta = await fetchImpl(`${base}/${caminho}`, { ...opcoes, headers: { ...cabecalhos, ...opcoes.headers } });
    } catch (causa) {
      throw new RestError("Sem conexão com o Portal. Tente de novo em instantes.", { code: causa?.name || "network" });
    }
    if (resposta.ok) {
      if (resposta.status === 204) return null;
      const texto = await resposta.text();
      return texto ? JSON.parse(texto) : null;
    }
    const corpo = await resposta.json().catch(() => ({}));
    throw new RestError(corpo.message || `O Portal respondeu ${resposta.status}.`, { status: resposta.status, code: corpo.code || "" });
  }

  return {
    ler(tabela, parametros = {}) {
      return pedir(`${tabela}?${new URLSearchParams(parametros)}`, { method: "GET" });
    },
    inserir(tabela, linha) {
      return pedir(tabela, {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(linha),
      });
    },
    rpc(nome, argumentos = {}) {
      return pedir(`rpc/${nome}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(argumentos),
      });
    },
  };
}
