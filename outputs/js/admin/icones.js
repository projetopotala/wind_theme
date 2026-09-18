/*
 * ÍCONES DO PAINEL — uma biblioteca só: Lucide.
 *
 * Os glifos antigos (⌂ ▦ ◇ ⚙ …) vinham cada um de uma fonte diferente do
 * sistema: tamanhos, pesos e alinhamentos diferentes, e alguns viravam emoji
 * colorido no Windows. Agora todo ícone sai do mesmo sprite SVG, com o mesmo
 * traço, e herda a cor do texto (`currentColor`).
 *
 * O sprite é gerado por `npm run vendor:lucide` a partir desta lista: nenhum
 * ícone fora dela chega ao navegador, e nenhum código da biblioteca roda em
 * tempo de execução. Ícone novo = nome aqui + rodar o script.
 */

export const SPRITE = "media/icones-admin.svg";

export const ICONES = Object.freeze([
  // navegação
  "layout-dashboard", "calendar-days", "door-open", "book-open", "users", "package",
  "arrow-left-right", "wrench", "wallet", "chart-no-axes-combined", "route", "pen-line",
  "settings", "log-out", "menu", "panel-left-close", "panel-left-open",
  // tipos de agendamento
  "heart-handshake", "graduation-cap", "activity", "ticket", "key-round", "video",
  // agenda e ações
  "search", "chevron-left", "chevron-right", "calendar", "sliders-horizontal", "ellipsis",
  "x", "triangle-alert", "plus", "repeat", "check", "clock", "map-pin", "user",
  // mesa do blog: status, blocos, edição e publicação
  "pencil", "eye", "archive", "circle-check", "file-text", "message-circle", "image", "images",
  "heading", "type", "quote", "sticky-note", "list", "minus", "grip-vertical", "arrow-up", "arrow-down",
  "copy", "trash-2", "send", "calendar-clock", "upload", "external-link", "history", "tag", "link",
  "bold", "italic", "monitor", "smartphone", "undo-2", "loader-circle", "circle-alert", "command",
  "align-left", "align-center", "rotate-ccw",
]);

const NOMES = new Set(ICONES);

/* `rotulo` só para ícone que é o único conteúdo de algo que precisa ser lido. */
export function icone(nome, { classe = "admin-icone", rotulo = "" } = {}) {
  if (!NOMES.has(nome)) throw new Error(`Ícone fora do sprite: ${nome}`);
  const acessivel = rotulo ? `role="img" aria-label="${String(rotulo).replace(/"/g, "&quot;")}"` : `aria-hidden="true"`;
  return `<svg class="${classe}" ${acessivel} focusable="false"><use href="${SPRITE}#${nome}"></use></svg>`;
}
