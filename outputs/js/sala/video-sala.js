/*
 * VÍDEO DA SALA: porta independente de provedor.
 *
 * O resto da sala só conhece `montar(container, { url, token })`. Trocar o
 * provedor é escrever outro adaptador. Nenhuma chave de API existe aqui: o
 * token chega pronto da função de borda e é válido só para esta sala.
 */

const HOST_DAILY = /^[a-z0-9-]+\.daily\.co$/i;

export function urlDeSalaValida(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOST_DAILY.test(u.hostname) && /^\/potala-[0-9a-f]{32}$/.test(u.pathname)
      && !u.search && !u.hash && !u.username && !u.password;
  } catch { return false; }
}

export function adaptadorDaily({ documento = globalThis.document } = {}) {
  return {
    nome: "daily",
    montar(container, { url, token }) {
      if (!urlDeSalaValida(url) || typeof token !== "string" || !token || token.length > 4096) {
        throw new TypeError("Dados da sala de vídeo inválidos.");
      }
      const quadro = documento.createElement("iframe");
      // O token vai na query do Prebuilt; a URL base foi validada acima.
      quadro.src = `${url}?t=${encodeURIComponent(token)}`;
      quadro.title = "Videochamada do atendimento";
      quadro.allow = "camera; microphone; autoplay; fullscreen; display-capture";
      quadro.setAttribute("referrerpolicy", "no-referrer");
      quadro.className = "sala-video-quadro";
      container.replaceChildren(quadro);
      return { sair() { quadro.remove(); } };
    },
  };
}

export function criarPortaDeVideo(adaptador) {
  if (typeof adaptador?.montar !== "function") throw new TypeError("Adaptador de vídeo inválido.");
  let ativa = null;
  return {
    entrar(container, dados) { ativa?.sair(); ativa = adaptador.montar(container, dados); },
    sair() { ativa?.sair(); ativa = null; },
    get ativa() { return Boolean(ativa); },
  };
}
