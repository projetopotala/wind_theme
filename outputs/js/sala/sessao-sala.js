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
    // Encerrar passa pela função de borda: o banco autoriza e o provedor expulsa quem já entrou.
    encerrar: (requestId) => chamarFuncao("close-appointment-room", requestId),
    emitir: (requestId) => chamarFuncao("issue-appointment-room-token", requestId),
  };
  async function chamarFuncao(nomeDaFuncao, requestId) {
    {
      const { data } = await client.auth.getSession();
      const jwt = data?.session?.access_token;
      if (!jwt) throw Object.assign(new Error("sem sessão"), { code: "42501", status: 401 });
      let resposta;
      try {
        resposta = await fetchImpl(`${config.url.replace(/\/$/, "")}/functions/v1/${nomeDaFuncao}`, {
          method: "POST",
          headers: { apikey: config.publishableKey, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: requestId }),
        });
      } catch { throw Object.assign(new Error("network"), { code: "network", status: 0 }); }
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) throw Object.assign(new Error(corpo?.message || "erro"), { status: resposta.status, code: corpo?.code ?? "" });
      return corpo;
    }
  }
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
    // Sala já encerrada: o profissional pode confirmar a desconexão (idempotente), caso uma
    // tentativa anterior tenha falhado no provedor.
    if (contexto?.state === "closed" && contexto?.role === "professional") ui.oferecerRevogacao?.();
    return visao;
  }

  async function entrar() {
    if (!contexto || contexto.state !== "open") return false;
    ui.mostrarEntrando();
    let acesso;
    try { acesso = await api.emitir(requestId); }
    catch (erro) { ui.mostrarErro(mensagemDeErro(erro), { podeTentarDeNovo: ![401, 403].includes(Number(erro?.status)) && erro?.code !== "42501" }); return false; }
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
    let resposta;
    try { resposta = await api.encerrar(requestId); } catch (erro) { ui.mostrarErro(mensagemDeErro(erro), { podeTentarDeNovo: false }); return false; }
    sair({ motivo: "encerrada" });
    // O banco já fechou; se o provedor não confirmou a expulsão, a revogação segue pendente
    // e precisa ficar visível e repetível (nunca apresentada como concluída).
    if (resposta?.revoked !== true) ui.oferecerRevogacao?.();
    return true;
  }

  // Repete só a revogação no provedor. O banco aceita o profissional numa sala já encerrada.
  async function revogar() {
    if (contexto?.role !== "professional") return false;
    let resposta;
    try { resposta = await api.encerrar(requestId); } catch { ui.oferecerRevogacao?.(); return false; }
    if (resposta?.revoked === true) { ui.revogacaoConcluida?.(); return true; }
    ui.oferecerRevogacao?.();
    return false;
  }

  return { carregar, entrar, sair, encerrar, revogar, get contexto() { return contexto; } };
}
