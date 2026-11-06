/*
 * USUÁRIOS E ACESSOS — incremento 1 (somente leitura).
 *
 * Lista cada conta do Supabase Auth com o que o banco já sabe dela: papel do portal,
 * permissões do Blog e vínculos com perfis operacionais (profissional, cliente).
 * Quem decide se a pessoa pode ver a lista é o banco (admin_list_accounts exige
 * is_portal_admin); esta tela só mostra. Nada aqui altera permissões.
 */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const STATUS = Object.freeze({
  ativa: "Ativa",
  nunca_entrou: "Confirmada, nunca entrou",
  pendente_confirmacao: "Aguardando confirmação do e-mail",
  bloqueada: "Bloqueada",
});
const PAPEIS_PORTAL = Object.freeze({ owner: "Owner", admin: "Administração", blog_editor: "Blog" });

/* Papéis derivados só de dados do banco (nunca de metadados editáveis). */
export function papeisDaConta(conta) {
  const papeis = [];
  if (conta.portal_active === true && PAPEIS_PORTAL[conta.portal_role]) {
    if (conta.portal_role === "blog_editor") {
      const blog = conta.blog?.active ? conta.blog : null;
      papeis.push(blog?.publish ? "editor" : blog?.edit ? "escritor" : "blog_sem_permissao");
    } else papeis.push(conta.portal_role);
  }
  for (const v of conta.links || []) {
    if (!v.link_active) continue;
    const roles = Array.isArray(v.roles) ? v.roles : [];
    if (roles.includes("professional")) papeis.push(v.profile_active ? "profissional" : "profissional_inativo");
    else if (roles.includes("client")) papeis.push("cliente");
  }
  if (!papeis.length) papeis.push("sem_vinculo");
  return [...new Set(papeis)];
}

export const ROTULO_PAPEL = Object.freeze({
  owner: "Owner", admin: "Administração", editor: "Editor do Blog", escritor: "Escritor do Blog",
  blog_sem_permissao: "Blog (sem permissão ativa)", profissional: "Profissional",
  profissional_inativo: "Profissional (perfil desativado)", cliente: "Cliente", sem_vinculo: "Sem vínculo",
});

export function filtrarContas(contas, { busca = "", papel = "", status = "" } = {}) {
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  return contas.filter((c) => {
    if (status && c.status !== status) return false;
    if (papel && !papeisDaConta(c).includes(papel)) return false;
    if (!termo) return true;
    return [c.email, c.name, ...(c.links || []).map((v) => v.display_name)]
      .some((t) => String(t || "").toLocaleLowerCase("pt-BR").includes(termo));
  });
}

const data = (v) => {
  const d = v ? new Date(v) : null;
  return d && Number.isFinite(d.valueOf()) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(d) : "—";
};

function linha(conta) {
  const papeis = papeisDaConta(conta);
  const vinculos = (conta.links || []).map((v) => `<li>${e(v.display_name || v.profile_id)} · ${v.link_active ? "vínculo ativo" : "vínculo inativo"}${v.profile_active ? "" : " · perfil desativado"}</li>`).join("");
  return `<tr data-conta="${e(conta.id)}">
    <td><strong>${e(conta.name || "—")}</strong><small>${e(conta.email)}</small></td>
    <td><span class="op-badge${conta.status === "ativa" ? "" : conta.status === "bloqueada" ? " is-cancelled" : " is-unconfirmed"}" data-status="${e(conta.status)}">${e(STATUS[conta.status] || conta.status)}</span></td>
    <td>${papeis.map((p) => `<span class="op-badge" data-papel="${e(p)}">${e(ROTULO_PAPEL[p] || p)}</span>`).join(" ")}</td>
    <td>${vinculos ? `<ul class="op-lista-curta">${vinculos}</ul>` : "—"}</td>
    <td>${e(data(conta.last_sign_in_at))}</td>
  </tr>`;
}

export function renderizarAcessos({ contas = [], filtros = {}, erro = "" } = {}) {
  const lista = filtrarContas(contas, filtros);
  const opcoes = (mapa, atual) => Object.entries(mapa).map(([k, v]) => `<option value="${e(k)}"${k === atual ? " selected" : ""}>${e(v)}</option>`).join("");
  return `<header class="op-header"><div><p class="op-eyebrow">Pessoas e patrimônio</p>
      <h2 id="acessos-titulo" tabindex="-1">Usuários e acessos</h2>
      <p>Contas do portal e seus vínculos. Somente consulta nesta versão: as permissões continuam sendo decididas pelo banco.</p></div>
    </header>
    <form class="op-toolbar" data-access-filtros role="search">
      <label>Buscar <input type="search" name="busca" value="${e(filtros.busca || "")}" placeholder="Nome, e-mail ou perfil"></label>
      <label>Papel <select name="papel"><option value="">Todos</option>${opcoes(ROTULO_PAPEL, filtros.papel)}</select></label>
      <label>Status <select name="status"><option value="">Todos</option>${opcoes(STATUS, filtros.status)}</select></label>
    </form>
    ${erro ? `<p class="op-loading" role="alert">${e(erro)}</p>` : `<p class="op-muted" role="status">${lista.length} de ${contas.length} conta(s).</p>
    <div class="op-table-scroll"><table class="op-table">
      <thead><tr><th scope="col">Conta</th><th scope="col">Status</th><th scope="col">Papéis</th><th scope="col">Vínculos</th><th scope="col">Último acesso</th></tr></thead>
      <tbody>${lista.map(linha).join("") || `<tr><td colspan="5" class="op-empty">Nenhuma conta encontrada com esses filtros.</td></tr>`}</tbody>
    </table></div>`}`;
}

export function mensagemDeErro(error) {
  if (["PGRST202", "42883"].includes(error?.code)) return "Esta seção fica disponível depois que a atualização do banco for aplicada.";
  if (error?.code === "42501") return "Seu acesso não permite consultar as contas.";
  return "Não foi possível carregar as contas agora. Tente de novo em instantes.";
}

export function createAccessPanel({ root, client }) {
  const alvo = root?.querySelector?.("[data-access-view]");
  let contas = [];
  let erro = "";
  const filtros = { busca: "", papel: "", status: "" };
  const desenhar = () => { if (alvo) alvo.innerHTML = renderizarAcessos({ contas, filtros, erro }); };
  alvo?.addEventListener?.("input", (evento) => {
    const campo = evento.target;
    if (!campo?.name || !(campo.name in filtros)) return;
    filtros[campo.name] = campo.value;
    const foco = campo.name;
    desenhar();
    alvo.querySelector?.(`[name="${foco}"]`)?.focus?.();
  });
  alvo?.addEventListener?.("submit", (evento) => evento.preventDefault());
  return {
    async reload() {
      const { data: resposta, error } = await client.rpc("admin_list_accounts");
      if (error) { contas = []; erro = mensagemDeErro(error); } else { contas = Array.isArray(resposta) ? resposta : []; erro = ""; }
      desenhar();
      return contas;
    },
    clear() { contas = []; erro = ""; if (alvo) alvo.innerHTML = ""; },
  };
}
