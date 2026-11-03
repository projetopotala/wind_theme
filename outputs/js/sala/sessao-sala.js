/*
 * SESSÃO DA SALA: orquestra contexto, entrada, vídeo e chat.
 *
 * O identificador do atendimento que vem do endereço NÃO prova nada: cada
 * chamada abaixo é reavaliada pelo banco com a identidade da sessão.
 */
import { SUPABASE_CONFIG } from "../supabase/config.js";
import { visaoDoContexto, mensagemDeErro, erroDeRede } from "./estado-sala.js";

export function criarApiDaSala({ client, config = SUPABASE_CONFIG, fetchImpl = globalThis.fetch?.bind(globalThis) }) {
  async function rpc(nome, args) {
    let resposta;
    try { resposta = await client.rpc(nome, args); }
    catch { throw Object.assign(new Error("network"), { code: "network", status: 0 }); }
    if (resposta.error) throw Object.assign(new Error(resposta.error.message || "erro"), { code: resposta.error.code ?? "", status: resposta.status ?? 0 });
    return resposta.data;
  }
  return {
    contexto: (requestId) => rpc("appointment_room_context", { p_request_id: requestId }),
    listar: (requestId, depois) => rpc("list_appointment_room_messages", { p_request_id: requestId, p_after: depois }),
    enviar: (requestId, texto) => rpc("post_appointment_room_message", { p_request_id: requestId, p_body: texto }),
    encerrar: (requestId) => rpc("close_appointment_room_session", { p_request_id: requestId }),
    async emitir(requestId) {
      const { data } = await client.auth.getSession();
      const jwt = data?.session?.access_token;
      if (!jwt) throw Object.assign(new Error("sem sessão"), { code: "42501", status: 401 });
      let resposta;
      try {
        resposta = await fetchImpl(`${config.url.replace(/\/$/, "")}/functions/v1/issue-appointment-room-token`, {
          method: "POST",
          headers: { apikey: config.publishableKey, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: requestId }),
        });
      } catch { throw Object.assign(new Error("network"), { code: "network", status: 0 }); }
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) throw Object.assign(new Error(corpo?.message || "erro"), { status: resposta.status, code: corpo?.code ?? "" });
      return corpo;
    },
  };
}

export function criarSessaoSala({ requestId, api, video, ui, criarChat }) {
  let contexto = null, chat = null;

  async function carregar() {
    ui.mostrarCarregando();
    try {
      contexto = await api.contexto(requestId);
    } catch (erro) {
      ui.mostrarErro(mensagemDeErro(erro), { podeTentarDeNovo: erroDeRede(erro) });
      return null;
    }
    const visao = visaoDoContexto(contexto);
    ui.mostrarVisao(visao, { papel: contexto?.role ?? null, servico: contexto?.service ?? "" });
    return visao;
  }

  async function entrar() {
    if (!contexto || contexto.state !== "open") return false;
    ui.mostrarEntrando();
    let acesso;
    try { acesso = await api.emitir(requestId); }
    catch (erro) { ui.mostrarErro(mensagemDeErro(erro), { podeTentarDeNovo: true }); return false; }
    try { video.entrar(ui.areaDoVideo, { url: acesso.url, token: acesso.token }); }
    catch { ui.mostrarErro("Não foi possível abrir a videochamada.", { podeTentarDeNovo: true }); return false; }
    chat = criarChat({
      listar: (depois) => api.listar(requestId, depois),
      enviar: (texto) => api.enviar(requestId, texto),
      aoPerder: () => ui.mostrarConexao(false),
      aoRecuperar: () => ui.mostrarConexao(true),
      aoEncerrar: () => sair({ motivo: "encerrada" }),
    });
    ui.mostrarSala({ papel: contexto.role, expiraEm: acesso.expires_at });
    await chat.iniciar();
    return true;
  }

  function sair({ motivo = "saiu" } = {}) {
    chat?.parar(); chat = null; video.sair();
    ui.mostrarSaida(motivo);
  }

  async function encerrar() {
    if (contexto?.role !== "professional") return false;
    try { await api.encerrar(requestId); } catch (erro) { ui.mostrarErro(mensagemDeErro(erro), { podeTentarDeNovo: false }); return false; }
    sair({ motivo: "encerrada" });
    return true;
  }

  return { carregar, entrar, sair, encerrar, get contexto() { return contexto; } };
}
