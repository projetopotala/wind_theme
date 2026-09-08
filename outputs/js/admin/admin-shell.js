/*
 * Navegação lateral e menu do usuário.
 *
 * A Jornada é uma aba entre as outras. Trocar a marca de ativa sem esconder o
 * editor deixaria o financeiro escrito por cima da lista de blocos, e o
 * contrário também. `aria-disabled` continua recusando o que ainda não abre.
 */

export function isInerte(botao) {
  return botao?.getAttribute?.("aria-disabled") === "true";
}

export function createAdminShell({ root, onSignOut, onReset } = {}) {
  if (!root) throw new TypeError("root é obrigatório para montar a casca do painel.");

  const nav = root.querySelector("[data-admin-nav]");
  const menuBotao = root.querySelector("[data-admin-user-toggle]");
  const menu = root.querySelector("[data-admin-user-menu]");

  function mostrar(secao) {
    if (!secao || !root.dataset) return;
    root.dataset.adminSection = secao;
    for (const painel of root.querySelectorAll?.("[data-admin-workspace]") || []) {
      painel.hidden = painel.getAttribute("data-admin-workspace") !== secao;
    }
  }

  function selecionar(botao) {
    if (!botao || isInerte(botao)) return;
    const secao = botao.getAttribute("data-section");
    for (const item of nav?.querySelectorAll("[data-section]") || []) {
      if (item.getAttribute("data-section") === secao) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
    mostrar(secao);
  }

  function onNavClick(evento) {
    const botao = evento.target?.closest?.("[data-section]");
    if (!botao) return;
    if (isInerte(botao)) {
      // Sem preventDefault a página rola para o topo em navegadores que tratam
      // o botão como submit por padrão, e a recusa vira um salto sem motivo.
      evento.preventDefault?.();
      return;
    }
    selecionar(botao);
  }

  function alternarMenu() {
    if (!menu) return;
    const aberto = menuBotao?.getAttribute("aria-expanded") === "true";
    menuBotao?.setAttribute("aria-expanded", aberto ? "false" : "true");
    menu.hidden = aberto;
  }

  function onSair() {
    onSignOut?.();
  }

  function onRestaurar() {
    onReset?.();
  }

  function onPick(evento) {
    const botao = evento.target?.closest?.("[data-admin-pick]");
    if (!botao) return;
    const lista = botao.closest("[data-admin-pick-list]");
    const alvo = botao.getAttribute("data-admin-pick");
    for (const item of lista?.querySelectorAll("[data-admin-pick]") || []) {
      if (item === botao) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    }
    for (const painel of root.querySelectorAll?.("[data-admin-pick-panel]") || []) {
      painel.hidden = painel.getAttribute("data-admin-pick-panel") !== alvo;
    }
  }

  const atalhos = root.querySelector("[data-admin-atalhos]");
  nav?.addEventListener?.("click", onNavClick);
  atalhos?.addEventListener?.("click", onNavClick);
  root.addEventListener?.("click", onPick);
  menuBotao?.addEventListener?.("click", alternarMenu);
  const sair = root.querySelector("[data-admin-sign-out]");
  const restaurar = root.querySelector("[data-admin-reset]");
  sair?.addEventListener?.("click", onSair);
  restaurar?.addEventListener?.("click", onRestaurar);

  return {
    /** Preenche o rodapé com quem está usando o painel. */
    setUser({ name = "Editor", role = "Administradora" } = {}) {
      const nome = root.querySelector("[data-admin-user-name]");
      const papel = root.querySelector("[data-admin-user-role]");
      const avatar = root.querySelector("[data-admin-avatar]");
      if (nome) nome.textContent = name;
      if (papel) papel.textContent = role;
      if (avatar) {
        avatar.textContent = name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((parte) => parte[0]?.toUpperCase() || "")
          .join("") || "··";
      }
    },

    destroy() {
      nav?.removeEventListener?.("click", onNavClick);
      atalhos?.removeEventListener?.("click", onNavClick);
      root.removeEventListener?.("click", onPick);
      menuBotao?.removeEventListener?.("click", alternarMenu);
      sair?.removeEventListener?.("click", onSair);
      restaurar?.removeEventListener?.("click", onRestaurar);
    },
  };
}
