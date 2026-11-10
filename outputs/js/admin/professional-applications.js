/*
 * USUÁRIOS E ACESSOS — solicitações "Quero atender".
 *
 * Lista as solicitações pendentes e deixa o Owner aprovar ou recusar. Quem decide se a
 * pessoa pode ver e agir é o banco (admin_*_professional_application exigem users.role =
 * 'owner'); esta tela só mostra e envia o id da solicitação. Aprovar vincula a conta ao
 * cadastro profissional, mas NÃO publica o perfil: serviços, valores e horários seguem com o Owner.
 */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

const data = (v) => {
  const d = v ? new Date(v) : null;
  return d && Number.isFinite(d.valueOf()) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(d) : "—";
};

export const LIMITE_DA_NOTA = 500;

function linha(sol, confirmando) {
  const [acao, id] = String(confirmando || "").split("|");
  const aqui = id === sol.id;
  let controles = `<button type="button" class="op-button" data-acao="sol-aprovar" data-solicitacao-id="${e(sol.id)}">Aprovar</button>
      <button type="button" class="op-button" data-acao="sol-recusar" data-solicitacao-id="${e(sol.id)}">Recusar</button>`;
  if (aqui && acao === "aprovar") {
    controles = `<span role="alert"><small>Aprovar cria (ou reaproveita) o cadastro profissional e vincula a conta. O perfil continua <strong>não publicado</strong>; serviços, valores e horários são configurados por você.</small>
      <button type="button" class="op-button" data-acao="sol-aprovar-confirmado" data-solicitacao-id="${e(sol.id)}">Confirmar aprovação</button>
      <button type="button" class="op-button" data-acao="sol-cancelar">Cancelar</button></span>`;
  } else if (aqui && acao === "recusar") {
    controles = `<span role="alert"><label>Motivo (opcional, a pessoa vê) <input type="text" data-sol-nota maxlength="${LIMITE_DA_NOTA}" aria-label="Motivo da recusa de ${e(sol.display_name)}"></label>
      <button type="button" class="op-button" data-acao="sol-recusar-confirmado" data-solicitacao-id="${e(sol.id)}">Confirmar recusa</button>
      <button type="button" class="op-button" data-acao="sol-cancelar">Cancelar</button></span>`;
  }
  return `<tr data-solicitacao="${e(sol.id)}">
    <td><strong>${e(sol.display_name)}</strong><small>${e(sol.email)}</small>${sol.contact_phone ? `<small>${e(sol.contact_phone)}</small>` : ""}</td>
    <td>${e(sol.specialty)}</td>
    <td><details><summary>Ver apresentação</summary><p>${e(sol.presentation)}</p></details></td>
    <td>${e(data(sol.created_at))}</td>
    <td>${controles}</td>
  </tr>`;
}

/* `solicitacoes === null` => o banco não deixou listar (não é o Owner ou a atualização não foi aplicada): nada aparece. */
export function renderizarSolicitacoes({ solicitacoes = null, confirmando = "" } = {}) {
  if (!Array.isArray(solicitacoes)) return "";
  return `<section class="op-card" data-solicitacoes aria-labelledby="solicitacoes-titulo">
    <h3 id="solicitacoes-titulo">Pedidos para atender</h3>
    <p class="op-muted" role="status">${solicitacoes.length} pedido(s) aguardando decisão. Toda decisão fica registrada.</p>
    ${solicitacoes.length ? `<div class="op-table-scroll"><table class="op-table">
      <thead><tr><th scope="col">Pessoa</th><th scope="col">Especialidade</th><th scope="col">Apresentação</th><th scope="col">Enviado em</th><th scope="col">Decisão</th></tr></thead>
      <tbody>${solicitacoes.map((s) => linha(s, confirmando)).join("")}</tbody>
    </table></div>` : `<p class="op-empty">Nenhum pedido pendente.</p>`}
  </section>`;
}

/* O texto vem do banco só para erros de regra conhecidos; o resto é genérico. */
export function mensagemDaSolicitacao(error) {
  if (["PGRST202", "42883"].includes(error?.code)) return "A operação fica disponível depois que a atualização do banco for aplicada.";
  if (error?.code === "42501") return "Somente a conta owner decide estes pedidos.";
  if (["22023", "23505", "23503", "P0002"].includes(error?.code) && error?.message) return error.message;
  return "Não foi possível concluir. Nada foi alterado; tente de novo em instantes.";
}

export function mensagemDaAprovacao(resposta = {}) {
  if (resposta.changed === false) return "Este pedido já estava aprovado.";
  return `Pedido aprovado. ${resposta.profile_created ? "Cadastro profissional criado" : "Cadastro existente atualizado"} e conta vinculada; o perfil continua não publicado. Configure serviços e horários em Pessoas e na Central Operacional.`;
}
