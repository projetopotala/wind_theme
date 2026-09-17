/*
 * Navegação lateral e menu do usuário.
 *
 * A Jornada é uma aba entre as outras. Trocar a marca de ativa sem esconder o
 * editor deixaria o financeiro escrito por cima da lista de blocos, e o
 * contrário também. `aria-disabled` continua recusando o que ainda não abre.
 *
 * A BARRA MUDA DE FORMA COM A LARGURA, e o estado é um atributo só:
 *   ≥ 1200px  barra completa, sempre aberta
 *   820–1199  trilho de ícones; o botão de expandir abre a barra por cima
 *   < 820px   gaveta; o botão de menu na barra superior abre
 * `data-nav-aberta` no painel diz "a barra está aberta por cima do conteúdo".
 * Escape, o véu e a escolha de uma seção fecham.
 */

export function isInerte(botao) {
  return botao?.getAttribute?.("aria-disabled") === "true";
}

export function createAdminShell({ root, onSignOut, onReset } = {}) {
  if (!root) throw new TypeError("root é obrigatório para montar a casca do painel.");

  const nav = root.querySelector("[data-admin-nav]");
  const menuBotao = root.querySelector("[data-admin-user-toggle]");
  const menu = root.querySelector("[data-admin-user-menu]");
  const alternadores = [...(root.querySelectorAll?.("[data-admin-nav-toggle]") || [])];
  const veu = root.querySelector("[data-admin-nav-fechar]");
  const secaoAtual = root.querySelector("[data-admin-secao-atual]");
  const dica = root.querySelector("[data-admin-dica]");

  function mostrar(secao) {
    if (!secao || !root.dataset) return;
    root.dataset.adminSection = secao;
    for (const painel of root.querySelectorAll?.("[data-admin-workspace]") || []) {
      painel.hidden = painel.getAttribute("data-admin-workspace") !== secao;
    }
  }

  const navAberta = () => root.dataset?.navAberta === "true";

  function abrirNav() {
    if (!root.dataset) return;
    root.dataset.navAberta = "true";
    if (veu) veu.hidden = false;
    for (const botao of alternadores) {
      botao.setAttribute("aria-expanded", "true");
      botao.setAttribute("aria-label", "Fechar menu");
    }
    nav?.querySelector?.('[aria-current="page"]')?.focus?.();
  }

  function fecharNav({ devolverFoco = false } = {}) {
    if (!navAberta()) return;
    delete root.dataset.navAberta;
    if (veu) veu.hidden = true;
    for (const botao of alternadores) {
      botao.setAttribute("aria-expanded", "false");
      botao.setAttribute("aria-label", botao.classList?.contains("admin-nav-recolher") ? "Expandir menu" : "Abrir menu");
    }
    if (devolverFoco) alternadores.find((botao) => botao.offsetParent !== null)?.focus?.();
  }

  function selecionar(botao) {
    if (!botao || isInerte(botao)) return;
    const secao = botao.getAttribute("data-section");
    for (const item of nav?.querySelectorAll("[data-section]") || []) {
      if (item.getAttribute("data-section") === secao) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
    mostrar(secao);
    if (secaoAtual) secaoAtual.textContent = botao.getAttribute("data-dica") || botao.textContent?.trim() || "";
    fecharNav();
    esconderDica();
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

  function alternarNav() {
    if (navAberta()) fecharNav({ devolverFoco: true });
    else abrirNav();
  }

  function onTecla(evento) {
    if (evento.key === "Escape" && navAberta()) {
      evento.preventDefault?.();
      fecharNav({ devolverFoco: true });
    }
  }

  /*
   * DICAS dos botões só de ícone e dos itens do trilho recolhido.
   *
   * Um elemento só, posicionado junto do botão, em vez de `title` — que demora,
   * não aparece no foco de teclado e repetiria o rótulo que já está escrito
   * quando a barra está aberta. A dica só aparece quando o texto não está à
   * vista; o nome acessível continua vindo do rótulo ou do aria-label.
   */
  let esperaDaDica = 0;
  function rotuloVisivel(alvo) {
    const texto = alvo.querySelector?.(":scope > span:not(.admin-avatar)");
    // Recolhido, o rótulo continua no DOM (leitor de tela) com 1px de largura: isso não é "à vista".
    return Boolean(texto && texto.getBoundingClientRect().width > 2 && getComputedStyle(texto).visibility !== "hidden");
  }
  function mostrarDica(alvo) {
    if (!dica || !alvo?.dataset?.dica || rotuloVisivel(alvo)) return;
    const caixa = alvo.getBoundingClientRect();
    dica.textContent = alvo.dataset.dica;
    dica.hidden = false;
    const naBarra = Boolean(alvo.closest?.("[data-admin-nav]"));
    const largura = dica.offsetWidth;
    const altura = dica.offsetHeight;
    const esquerda = naBarra ? caixa.right + 10 : Math.max(8, Math.min(caixa.left + caixa.width / 2 - largura / 2, innerWidth - largura - 8));
    const topo = naBarra ? caixa.top + caixa.height / 2 - altura / 2 : caixa.bottom + 8 + altura > innerHeight ? caixa.top - altura - 8 : caixa.bottom + 8;
    dica.style.left = `${Math.round(esquerda)}px`;
    dica.style.top = `${Math.round(topo)}px`;
  }
  function esconderDica() {
    clearTimeout(esperaDaDica);
    if (dica) dica.hidden = true;
  }
  function onPonteiro(evento) {
    const alvo = evento.target?.closest?.("[data-dica]");
    clearTimeout(esperaDaDica);
    if (!alvo) return esconderDica();
    esperaDaDica = setTimeout(() => mostrarDica(alvo), 350);
  }
  function onFoco(evento) {
    const alvo = evento.target?.closest?.("[data-dica]");
    if (alvo && alvo.matches?.(":focus-visible")) mostrarDica(alvo);
    else esconderDica();
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

  const fecharPeloVeu = () => fecharNav({ devolverFoco: true });
  const atalhos = root.querySelector("[data-admin-atalhos]");
  nav?.addEventListener?.("click", onNavClick);
  atalhos?.addEventListener?.("click", onNavClick);
  root.addEventListener?.("click", onPick);
  root.addEventListener?.("keydown", onTecla);
  root.addEventListener?.("pointerover", onPonteiro);
  root.addEventListener?.("focusin", onFoco);
  root.addEventListener?.("focusout", esconderDica);
  for (const botao of alternadores) botao.addEventListener?.("click", alternarNav);
  veu?.addEventListener?.("click", fecharPeloVeu);
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
      menuBotao?.setAttribute?.("data-dica", name);
    },

    abrirNav,
    fecharNav,

    destroy() {
      nav?.removeEventListener?.("click", onNavClick);
      atalhos?.removeEventListener?.("click", onNavClick);
      root.removeEventListener?.("click", onPick);
      root.removeEventListener?.("keydown", onTecla);
      root.removeEventListener?.("pointerover", onPonteiro);
      root.removeEventListener?.("focusin", onFoco);
      root.removeEventListener?.("focusout", esconderDica);
      for (const botao of alternadores) botao.removeEventListener?.("click", alternarNav);
      veu?.removeEventListener?.("click", fecharPeloVeu);
      menuBotao?.removeEventListener?.("click", alternarMenu);
      sair?.removeEventListener?.("click", onSair);
      restaurar?.removeEventListener?.("click", onRestaurar);
      esconderDica();
    },
  };
}
