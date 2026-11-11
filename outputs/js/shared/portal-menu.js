/*
 * MENU GLOBAL DO PORTAL
 *
 * Um único botão discreto abre uma lista com os caminhos essenciais do Potala,
 * para que quem chega não precise atravessar as 12 etapas da Travessia só para
 * achar Atendimentos, o Blog ou a Loja.
 *
 * Os caminhos vêm agrupados pelo que a pessoa quer fazer (Serviços, Aprendizado,
 * Conteúdos, Instituto, Conta). O primeiro é a ação mais procurada: agendar um
 * atendimento, que leva direto à tela de pedido de horário do Meu Potala.
 *
 * Princípios:
 *  - HTML estático: nada aqui consulta o Supabase nem depende de carregamento
 *    dinâmico. O menu existe mesmo se a Travessia demorar ou falhar.
 *  - <dialog> nativo: foco preso, Esc fecha, foco volta ao botão.
 *  - prefers-reduced-motion respeitado (veja css/portal-menu.css).
 *  - Reaproveita as páginas e rotas que já existem; não cria destinos novos.
 */

export const MENU_GRUPOS = Object.freeze([
  { key: "servicos", titulo: "Serviços" },
  { key: "aprendizado", titulo: "Aprendizado" },
  { key: "conteudos", titulo: "Conteúdos" },
  { key: "instituto", titulo: "Instituto" },
  { key: "conta", titulo: "Conta" },
]);

export const MENU_ITEMS = Object.freeze([
  { key: "agendar", grupo: "servicos", label: "Agendar atendimento", hint: "Escolher profissional e horário · pede para entrar na conta", href: "/meu-potala/atendimentos" },
  { key: "atendimentos", grupo: "servicos", label: "Atendimentos", hint: "Caminhos de cuidado", href: "atendimentos.html" },
  { key: "profissionais", grupo: "servicos", label: "Profissionais", hint: "Quem cuida e ensina", href: "profissionais.html" },
  { key: "loja", grupo: "servicos", label: "Loja", hint: "O Marketplace do Instituto", href: "marketplace.html" },
  { key: "cursos", grupo: "aprendizado", label: "Cursos e Eventos", hint: "Aprender e conviver", href: "cursos.html", extra: { label: "Eventos", href: "eventos.html" } },
  { key: "blog", grupo: "conteudos", label: "Blog e Revista", hint: "Artigos e reflexões", href: "blog.html", extra: { label: "Revista", href: "revista.html" } },
  { key: "materia", grupo: "conteudos", label: "Atendimentos em matéria", hint: "A leitura editorial do cuidado", href: "transcendido.html" },
  { key: "institucional", grupo: "instituto", label: "Home do Instituto", hint: "Todos os caminhos: cuidado, cursos, blog, loja e cultura", href: "atendimentos-conceito.html" },
  { key: "home", grupo: "instituto", label: "Explorar o Potala", hint: "A Travessia: a jornada em 12 etapas", href: "travessia.html" },
  { key: "chegada", grupo: "instituto", label: "Voltar à Chegada", hint: "A paisagem inicial", href: "/transcender.html" },
  { key: "recepcao", grupo: "instituto", label: "Recepção", hint: "Fale com o Instituto", href: "recepcao.html" },
  { key: "meu-potala", grupo: "conta", label: "Meu Potala", hint: "Seu espaço: cursos, agenda e atendimentos", href: "/meu-potala" },
]);

const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* Qual item corresponde à página atual (para aria-current). */
export function itemAtual(pathname = "") {
  const nome = String(pathname).split("/").pop().replace(/\.html$/, "") || "";
  const limpo = String(pathname).replace(/^\/+/, "").replace(/\/+$/, "");
  if (limpo === "meu-potala/atendimentos") return "agendar";
  if (/^meu-potala/.test(limpo)) return "meu-potala";
  const mapa = { transcender: "chegada", "atendimentos-conceito": "institucional", transcendido: "materia", travessia: "home", atendimentos: "atendimentos", profissionais: "profissionais", cursos: "cursos", eventos: "cursos", blog: "blog", revista: "blog", artigo: "blog", marketplace: "loja", recepcao: "recepcao" };
  return mapa[nome] || "";
}

/* `base` ("/" nas rotas com subcaminhos, como /meu-potala/salvos) torna absolutos os destinos relativos. */
const destino = (href, base) => (base && !/^([a-z]+:|\/)/i.test(href) ? base + href : href);

function itemHtml(i, atual, base) {
  const cur = i.key === atual ? ' aria-current="page"' : "";
  const extra = i.extra ? `<a class="potala-menu__extra" href="${esc(destino(i.extra.href, base))}">${esc(i.extra.label)}</a>` : "";
  return `<li><a class="potala-menu__link" href="${esc(destino(i.href, base))}"${cur}><span class="potala-menu__label">${esc(i.label)}</span><span class="potala-menu__hint">${esc(i.hint)}</span></a>${extra}</li>`;
}

export function menuHtml(atual = "", base = "") {
  const grupos = MENU_GRUPOS.map((g) => {
    const itens = MENU_ITEMS.filter((i) => i.grupo === g.key).map((i) => itemHtml(i, atual, base)).join("");
    const id = `potala-menu-grupo-${g.key}`;
    return `<section class="potala-menu__grupo" aria-labelledby="${id}"><h2 class="potala-menu__grupo-titulo" id="${id}">${esc(g.titulo)}</h2><ul class="potala-menu__list" data-potala-menu-grupo="${g.key}">${itens}</ul></section>`;
  }).join("");
  return `<div class="potala-menu__sheet">
    <header class="potala-menu__head">
      <p class="potala-menu__eyebrow" id="potala-menu-titulo">Instituto Potala</p>
      <button class="potala-menu__close" type="button" data-potala-menu-fechar aria-label="Fechar menu">${CLOSE}</button>
    </header>
    <nav aria-label="Caminhos do Portal">${grupos}</nav>
  </div>`;
}

function carregarCss(doc) {
  if (doc.querySelector("link[href*='portal-menu.css']")) return;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("../../css/portal-menu.css", import.meta.url).href;
  link.setAttribute("data-potala-menu-css", "");
  doc.head.appendChild(link);
}

const parar = (e) => e.stopPropagation();

/*
 * Monta o botão e o diálogo. `host` (opcional) é um elemento onde o botão entra
 * em linha (cabeçalhos já existentes); sem host, o botão fica fixo no canto.
 */
export function mountPortalMenu({ documentRef = document, host = null, antes = null, base = "", pathname = documentRef.defaultView?.location?.pathname || "" } = {}) {
  if (!documentRef || !documentRef.body || !documentRef.head || typeof documentRef.createElement !== "function") return null;
  if (documentRef.querySelector("[data-potala-menu-trigger]")) return null;
  carregarCss(documentRef);

  const atual = itemAtual(pathname);
  const botao = documentRef.createElement("button");
  botao.type = "button";
  botao.className = "potala-menu__trigger" + (host ? " potala-menu__trigger--inline" : "");
  botao.setAttribute("data-potala-menu-trigger", "");
  botao.setAttribute("data-keeps-expansion", "");
  botao.setAttribute("aria-haspopup", "dialog");
  botao.setAttribute("aria-expanded", "false");
  botao.setAttribute("aria-label", "Abrir o menu do Portal");
  botao.innerHTML = `${ICON}<span class="potala-menu__trigger-text">Explorar</span>`;

  const dlg = documentRef.createElement("dialog");
  dlg.className = "potala-menu";
  dlg.setAttribute("aria-labelledby", "potala-menu-titulo");
  dlg.setAttribute("data-potala-menu", "");
  dlg.innerHTML = menuHtml(atual, base);

  const abrir = () => {
    if (dlg.open) return;
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    botao.setAttribute("aria-expanded", "true");
    documentRef.documentElement.classList.add("potala-menu-aberto");
    const primeiro = dlg.querySelector(".potala-menu__link");
    if (primeiro) primeiro.focus({ preventScroll: true });
  };
  const fechar = () => { if (dlg.open) dlg.close(); };
  dlg.addEventListener("close", () => {
    botao.setAttribute("aria-expanded", "false");
    documentRef.documentElement.classList.remove("potala-menu-aberto");
    botao.focus({ preventScroll: true });
  });
  botao.addEventListener("click", abrir);
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest("[data-potala-menu-fechar]")) fechar();
  });
  /* A Travessia e a chegada reagem a rolagem, arrasto e teclado: o menu não deve acioná-las. */
  for (const alvo of [botao, dlg]) {
    for (const tipo of ["pointerdown", "touchstart", "wheel", "keydown"]) alvo.addEventListener(tipo, parar, { passive: true });
  }
  /* Um link para a página em que a pessoa já está só fecha o menu, sem recarregar. */
  dlg.addEventListener("click", (e) => {
    const a = e.target.closest("a[aria-current='page']");
    if (a) { e.preventDefault(); fechar(); }
  });

  if (host) host.insertBefore(botao, antes || host.firstChild); else documentRef.body.appendChild(botao);
  documentRef.body.appendChild(dlg);
  const setAdminAccess = (allowed) => {
    dlg.querySelector("[data-potala-menu-admin]")?.remove();
    if (!allowed) return;
    /* A Central Operacional entra no grupo Conta (ou na primeira lista, se o grupo não existir). */
    const lista = dlg.querySelector('[data-potala-menu-grupo="conta"]') || dlg.querySelector(".potala-menu__list");
    if (!lista) return;
    const item = documentRef.createElement("li");
    item.setAttribute("data-potala-menu-admin", "");
    item.innerHTML = '<a class="potala-menu__link" href="/admin/"><span class="potala-menu__label">Central Operacional</span><span class="potala-menu__hint">Administração autorizada</span></a>';
    lista.appendChild(item);
  };
  return { botao, dlg, abrir, fechar, setAdminAccess };
}
