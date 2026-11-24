/*
 * ENDEREÇO DE CADA SEÇÃO DA CENTRAL OPERACIONAL (/admin/#/<seção>).
 *
 * Antes, trocar de seção só escondia e mostrava painéis: recarregar a página
 * voltava para "Visão geral", o Voltar do navegador saía da Central de uma vez
 * e não havia como mandar a alguém o link de "Usuários e acessos".
 *
 * Nada aqui concede acesso. O endereço só pede uma seção; quem decide se ela
 * abre é a própria navegação (um botão escondido ou recusado não é aberto), e o
 * banco continua conferindo cada chamada. A seção é aberta com o MESMO clique
 * no botão da navegação que o painel já usa — assim tudo o que depende desse
 * clique (recarregar acessos, abrir o editor de site) continua valendo.
 */

export const SECAO_INICIAL = "inicio";

/* "#/acessos" → "acessos". Qualquer outra coisa (ou um nome fora do padrão) → null. */
export function secaoDoHash(hash) {
  const m = /^#\/([a-z][a-z0-9-]{0,40})\/?$/.exec(String(hash || ""));
  return m ? m[1] : null;
}

export const hashDaSecao = (secao) => `#/${secao}`;

/* O botão da navegação que abre a seção — só se esta conta pode usá-lo agora. */
export function botaoAbrivel(nav, secao) {
  if (!nav || !secao) return null;
  for (const item of nav.querySelectorAll?.("[data-section]") || []) {
    if (item.getAttribute("data-section") !== secao) continue;
    if (item.hidden || item.getAttribute("aria-hidden") === "true") return null;
    if (item.getAttribute("aria-disabled") === "true") return null;
    return item;
  }
  return null;
}

export function secaoAtiva(nav) {
  for (const item of nav?.querySelectorAll?.("[data-section][aria-current='page']") || []) {
    return item.getAttribute("data-section");
  }
  return null;
}

/**
 * Liga o endereço à navegação.
 *  - clicar numa seção grava `#/<seção>` no histórico (o Voltar anda seção a seção);
 *  - Voltar/Avançar e a troca manual do endereço abrem a seção pedida;
 *  - `aplicar()` abre a seção do endereço atual (chamada quando a conta já foi autorizada).
 */
export function ligarRotasDoAdmin({ janela = globalThis.window, nav, painel = nav?.closest?.("[data-admin-section]") || nav } = {}) {
  if (!janela?.location || !nav) return { aplicar() {}, destroy() {} };
  let aplicando = false;

  const secaoDoPainel = () => painel?.dataset?.adminSection || secaoAtiva(nav) || SECAO_INICIAL;

  function abrir(secao) {
    const botao = botaoAbrivel(nav, secao);
    if (!botao) return false;
    if (secaoDoPainel() === secao && botao.getAttribute("aria-current") === "page") return true;
    aplicando = true;
    try { botao.click(); } finally { aplicando = false; }
    return true;
  }

  function aplicar() {
    const pedida = secaoDoHash(janela.location.hash);
    if (!pedida) return false;
    if (abrir(pedida)) return true;
    /* Seção desconhecida ou que esta conta não abre: o endereço volta a dizer onde a pessoa está. */
    janela.history?.replaceState?.(null, "", hashDaSecao(secaoDoPainel()));
    return false;
  }

  function aoNavegar(evento) {
    if (aplicando) return;
    const botao = evento.target?.closest?.("[data-admin-nav] [data-section]");
    const secao = botao?.getAttribute?.("data-section");
    if (!secao || botao.getAttribute("aria-disabled") === "true") return;
    const alvo = hashDaSecao(secao);
    if (janela.location.hash !== alvo) janela.history?.pushState?.(null, "", alvo);
  }

  /* Voltar até a entrada sem endereço de seção é voltar ao começo: Visão geral. */
  const aoMudarEndereco = () => {
    if (secaoDoHash(janela.location.hash)) aplicar();
    else abrir(SECAO_INICIAL);
  };

  /* O painel contém a navegação: um ouvinte só pega o clique do usuário e o `.click()` dos atalhos. */
  painel?.addEventListener?.("click", aoNavegar);
  janela.addEventListener?.("popstate", aoMudarEndereco);
  janela.addEventListener?.("hashchange", aoMudarEndereco);

  return {
    aplicar,
    destroy() {
      painel?.removeEventListener?.("click", aoNavegar);
      janela.removeEventListener?.("popstate", aoMudarEndereco);
      janela.removeEventListener?.("hashchange", aoMudarEndereco);
    },
  };
}
