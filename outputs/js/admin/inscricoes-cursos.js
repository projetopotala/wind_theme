/*
 * "Inscricoes de cursos": fila simples do Owner para os pedidos feitos pelos alunos.
 * Le por admin_list_course_enrollment_requests e decide por admin_decide_course_enrollment_request
 * (somente administracao; o banco confere a situacao, a versao do pedido e registra a auditoria).
 * Nao existe acao de "marcar pago": pagamento so pelo servidor (futuro webhook do Asaas).
 */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const SITUACOES = Object.freeze({
  solicitada: "Solicitada",
  aguardando_pagamento: "Aguardando pagamento",
  pagamento_confirmado: "Pagamento confirmado",
  matriculada: "Matriculada",
  recusada: "Recusada",
  cancelada: "Cancelada",
});

export function acoesPermitidas(status, precoCentavos) {
  if (status === "solicitada") return [["aprovar", precoCentavos === 0 ? "Aprovar e matricular" : "Aprovar (aguardar pagamento)"], ["recusar", "Recusar"], ["cancelar", "Cancelar"]];
  if (status === "aguardando_pagamento") return [["recusar", "Recusar"], ["cancelar", "Cancelar"]];
  if (status === "pagamento_confirmado" || status === "matriculada") return [["cancelar", "Cancelar matrícula"]];
  return [];
}

const reais = (c) => (Number.isInteger(c) ? (c === 0 ? "Gratuito" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100)) : "—");
const data = (iso) => { const d = new Date(iso); return Number.isNaN(d.valueOf()) ? "" : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(d); };

export function renderizarInscricoes(lista = [], { filtro = "pendentes", mensagem = "", erro = "" } = {}) {
  const pendentes = ["solicitada", "aguardando_pagamento", "pagamento_confirmado"];
  const itens = (Array.isArray(lista) ? lista : []).filter((i) => filtro === "todas" || pendentes.includes(i.status));
  return `<header class="nc-cabecalho"><h2 id="ic-titulo">Inscrições de cursos</h2><button type="button" class="op-button" data-ic-fechar>Fechar</button></header>
    <div class="ic-filtro" role="group" aria-label="Filtrar">
      <button type="button" class="op-button${filtro === "pendentes" ? " op-primary" : ""}" data-ic-filtro="pendentes">Pendentes</button>
      <button type="button" class="op-button${filtro === "todas" ? " op-primary" : ""}" data-ic-filtro="todas">Todas</button>
    </div>
    ${erro ? `<p class="nc-erros" role="alert">${e(erro)}</p>` : ""}
    ${mensagem ? `<p class="nc-ok" role="status">${e(mensagem)}</p>` : ""}
    ${itens.length ? `<ul class="ic-lista">${itens.map((i) => {
      const vagas = Number.isInteger(i.capacity) ? `${Math.max(i.capacity - (i.seats_taken || 0), 0)} de ${i.capacity} vagas livres` : "Vagas sem limite";
      return `<li class="ic-item" data-ic-item="${e(i.id)}">
        <p class="ic-situacao">${e(SITUACOES[i.status] || i.status)}</p>
        <h3>${e(i.course_title || "Curso")}</h3>
        <p>${e(i.student_name)} · ${e(i.student_email)}</p>
        <p class="op-field-hint">Pedido em ${e(data(i.created_at))} · ${e(reais(i.price_cents))} · ${e(vagas)}</p>
        <div class="ic-acoes">${acoesPermitidas(i.status, i.price_cents).map(([d, rot]) => `<button type="button" class="op-button${d === "aprovar" ? " op-primary" : ""}" data-ic-decidir="${e(d)}" data-ic-id="${e(i.id)}" data-ic-versao="${e(i.updated_at)}">${e(rot)}</button>`).join("")}</div>
      </li>`;
    }).join("")}</ul>` : `<p>${filtro === "pendentes" ? "Nenhuma inscrição pendente." : "Nenhuma inscrição ainda."}</p>`}`;
}

export function createInscricoesCursos({ root, client, documento = root?.ownerDocument || globalThis.document } = {}) {
  if (!root || !client?.rpc) return null;
  const dialog = documento.createElement("dialog");
  dialog.className = "op-dialog nc-dialog ic-dialog";
  dialog.setAttribute("aria-labelledby", "ic-titulo");
  const corpo = documento.createElement("div");
  corpo.className = "ic-corpo";
  dialog.appendChild(corpo);
  root.appendChild(dialog);
  let lista = [];
  let filtro = "pendentes";
  const desenhar = (extra = {}) => { corpo.innerHTML = renderizarInscricoes(lista, { filtro, ...extra }); };

  async function carregar(extra = {}) {
    const { data: d, error } = await client.rpc("admin_list_course_enrollment_requests");
    if (error) { desenhar({ erro: "Não foi possível carregar as inscrições." }); return; }
    lista = Array.isArray(d) ? d : [];
    desenhar(extra);
  }

  corpo.addEventListener("click", async (ev) => {
    if (ev.target?.closest?.("[data-ic-fechar]")) { dialog.close?.(); return; }
    const f = ev.target?.closest?.("[data-ic-filtro]");
    if (f) { filtro = f.getAttribute("data-ic-filtro"); desenhar(); return; }
    const b = ev.target?.closest?.("[data-ic-decidir]");
    if (!b) return;
    const decisao = b.getAttribute("data-ic-decidir");
    if ((decisao === "recusar" || decisao === "cancelar") && !globalThis.confirm?.(decisao === "recusar" ? "Recusar esta inscrição?" : "Cancelar esta inscrição?")) return;
    b.disabled = true;
    const { error } = await client.rpc("admin_decide_course_enrollment_request", { p_id: b.getAttribute("data-ic-id"), p_expected_updated_at: b.getAttribute("data-ic-versao"), p_decision: decisao });
    if (error) {
      const msg = { PT409: "A inscrição mudou. A lista foi atualizada.", 42501: "Seu acesso não permite esta decisão.", 22023: "Esta mudança não é permitida na situação atual." }[error.code] || "Não foi possível registrar a decisão.";
      await carregar({ erro: msg });
      return;
    }
    await carregar({ mensagem: "Decisão registrada." });
  });

  root.addEventListener("click", (ev) => {
    if (!ev.target?.closest?.("[data-inscricoes-cursos]")) return;
    ev.preventDefault();
    desenhar();
    if (!dialog.open) dialog.showModal?.();
    void carregar();
  });
  return { dialog, carregar };
}
