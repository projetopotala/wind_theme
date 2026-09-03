/*
 * Navegação lateral e menu do usuário.
 *
 * A parte que mais importa aqui é a recusa: seis das sete seções não existem, e
 * o painel tem de se comportar como se elas não fossem clicáveis mesmo quando
 * alguém insiste — por clique, por Enter ou por espaço. `aria-disabled` conta a
 * história para o leitor de tela, mas não impede nada sozinho; é este módulo
 * que impede.
 */

export function isInerte(botao) {
  return botao?.getAttribute?.("aria-disabled") === "true";
}

export function createAdminShell({ root, onSignOut, onReset } = {}) {
  if (!root) throw new TypeError("root é obrigatório para montar a casca do painel.");

  const nav = root.querySelector("[data-admin-nav]");
  const menuBotao = root.querySelector("[data-admin-user-toggle]");
  const menu = root.querySelector("[data-admin-user-menu]");

  function selecionar(botao) {
    if (!botao || isInerte(botao)) return;
    for (const item of nav?.querySelectorAll("[data-section]") || []) {
      if (item === botao) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
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

  nav?.addEventListener?.("click", onNavClick);
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
      menuBotao?.removeEventListener?.("click", alternarMenu);
      sair?.removeEventListener?.("click", onSair);
      restaurar?.removeEventListener?.("click", onRestaurar);
    },
  };
}
