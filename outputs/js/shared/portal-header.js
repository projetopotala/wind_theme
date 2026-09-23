const accountIcon = `
  <svg class="conta-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="8.2" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M5.8 19c.55-3.25 2.62-5.1 6.2-5.1s5.65 1.85 6.2 5.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;

const links = [
  { key: "quem-somos", label: "Quem somos", href: "quem-somos.html" },
  { key: "cultura", label: "Cultura", href: "cultura.html" },
  { key: "cursos", label: "Cursos", href: "cursos.html" },
  { key: "programacao", label: "Programação", href: "programacao.html" },
];

export function mountPortalHeader({ documentRef = document, current = "" } = {}) {
  if (documentRef.querySelector(".portal-header")) return;

  const header = documentRef.createElement("header");
  header.className = "portal-header";
  header.innerHTML = `
    <a class="portal-header__brand" href="transcendido.html" aria-label="Instituto Potala — voltar à Travessia">
      <img src="media/potala-mark-transparent.png" alt="" width="72" height="58" decoding="async">
      <span><strong>Instituto</strong> Potala</span>
    </a>
    <nav class="portal-header__nav" aria-label="Navegação principal">
      <a href="transcendido.html">Travessia</a>
      ${links.map((link) => `<a href="${link.href}"${link.key === current ? ' class="is-active" aria-current="page"' : ""}>${link.label}</a>`).join("")}
    </nav>
    <button class="portal-header__account conta-gatilho" type="button" data-conta-gatilho data-keeps-expansion
      aria-haspopup="dialog" aria-expanded="false" aria-label="Seu espaço no Potala">
      ${accountIcon}<span class="portal-header__account-label">Minha conta</span><span class="conta-iniciais" aria-hidden="true"></span>
    </button>`;
  documentRef.body.prepend(header);
}
