/*
 * Peças comuns das telas operacionais: escape, formatos e os pequenos
 * componentes de texto (selo, botão, tabela, cabeçalho).
 *
 * Moravam no topo de views.js. Saíram para cá quando a agenda ganhou módulo
 * próprio (agenda-views.js), para as duas telas usarem as mesmas peças sem uma
 * importar a outra.
 */

export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((value || 0) / 100);
export const dateLocal = (value) => new Date(new Date(value).getTime() - 10800000).toISOString().slice(0, 16);
export const today = () => dateLocal(new Date()).slice(0, 10);
export const time = (value) => dateLocal(value).slice(11, 16);
export const day = (value) => dateLocal(value).slice(0, 10);

const label = { available: "Disponível", unconfirmed: "A confirmar", maintenance: "Manutenção", unavailable: "Indisponível", booked: "Agendada", completed: "Concluída", cancelled: "Cancelada", presencial: "Presencial", online: "Online", appointment: "Atendimento", course: "Curso", activity: "Atividade", event: "Evento", rental: "Locação", workshop: "Workshop", lecture: "Palestra", group: "Grupo", cultural: "Cultural", individual: "Individual", multiuso: "Multiuso", quantity: "Quantidade", asset: "Patrimônio", damaged: "Danificado", lost: "Perdido", retired: "Baixado", receivable: "Receita", payable: "Despesa", professional: "Profissional", client: "Cliente", student: "Aluno", participant: "Participante", open: "Aberta", confirmed: "Confirmada", present: "Presente", absent: "Ausente", active: "Ativa", waitlist: "Lista de espera" };
export const translate = (value) => label[value] || value || "—";
export const badge = (value) => `<span class="op-badge is-${esc(value)}">${esc(translate(value))}</span>`;
export const action = (text, kind, id = "", extra = "") => `<button type="button" class="op-button" data-op-action="${esc(kind)}" data-id="${esc(id)}" ${extra}>${esc(text)}</button>`;
export const table = (heads, rows, empty = "Nenhum registro por enquanto.") => `<div class="op-table-scroll"><table class="op-table"><thead><tr>${heads.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${heads.length}" class="op-empty">${esc(empty)}</td></tr>`}</tbody></table></div>`;
export const cell = (...items) => `<tr>${items.map((item) => `<td>${item}</td>`).join("")}</tr>`;
export const lookup = (s, collection, id, field = "name") => s[collection]?.find((row) => row.id === id)?.[field] || "—";
export const roomName = (s, id) => (id === "storage" ? "Depósito" : lookup(s, "rooms", id));
export const personName = (s, id) => lookup(s, "profiles", id, "display_name");
export const heading = (kicker, title, description, buttons = "") => `<header class="op-header"><div><p class="op-eyebrow">${esc(kicker)}</p><h2 tabindex="-1">${esc(title)}</h2><p>${esc(description)}</p></div><div class="op-actions">${buttons}</div></header>`;
export const dateBounds = (date) => ({ from: `${date}T00:00:00-03:00`, to: `${date}T23:59:59-03:00` });
export const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const active = (item) => item.status !== "cancelled";
