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

const ehProfissional = (v) => Array.isArray(v.roles) && v.roles.includes("professional");

/* Ações por vínculo profissional. A confirmação de desativação é inline (sem diálogo do navegador). */
function acoesDoVinculo(conta, v, confirmando) {
  if (!ehProfissional(v)) return "";
  const chave = `${conta.id}|${v.profile_id}`;
  if (!v.link_active) {
    return v.profile_active
      ? `<button type="button" class="op-button" data-acao="reativar" data-conta-id="${e(conta.id)}" data-perfil="${e(v.profile_id)}">Reativar vínculo</button>`
      : `<small>Reative o perfil em Pessoas para reativar o vínculo.</small>`;
  }
  if (confirmando === chave) {
    return `<span role="alert"><small>Desativar remove o acesso profissional e encerra as salas abertas deste profissional (as consultas não são concluídas).</small>
      <button type="button" class="op-button" data-acao="desativar-confirmado" data-conta-id="${e(conta.id)}" data-perfil="${e(v.profile_id)}">Confirmar desativação</button>
      <button type="button" class="op-button" data-acao="cancelar">Cancelar</button></span>`;
  }
  return `<button type="button" class="op-button" data-acao="desativar" data-conta-id="${e(conta.id)}" data-perfil="${e(v.profile_id)}">Desativar vínculo</button>`;
}

function linha(conta, confirmando) {
  const papeis = papeisDaConta(conta);
  const vinculos = (conta.links || []).map((v) => `<li>${e(v.display_name || v.profile_id)} · ${v.link_active ? "vínculo ativo" : "vínculo inativo"}${v.profile_active ? "" : " · perfil desativado"} ${acoesDoVinculo(conta, v, confirmando)}</li>`).join("");
  return `<tr data-conta="${e(conta.id)}">
    <td><strong>${e(conta.name || "—")}</strong><small>${e(conta.email)}</small></td>
    <td><span class="op-badge${conta.status === "ativa" ? "" : conta.status === "bloqueada" ? " is-cancelled" : " is-unconfirmed"}" data-status="${e(conta.status)}">${e(STATUS[conta.status] || conta.status)}</span></td>
    <td>${papeis.map((p) => `<span class="op-badge" data-papel="${e(p)}">${e(ROTULO_PAPEL[p] || p)}</span>`).join(" ")}</td>
    <td>${vinculos ? `<ul class="op-lista-curta">${vinculos}</ul>` : "—"}</td>
    <td>${e(data(conta.last_sign_in_at))}</td>
  </tr>`;
}

/*
 * Vincular: só contas SEM vínculo operacional (o banco permite um por conta) e perfis
 * profissionais ATIVOS ainda sem conta. O banco confere tudo de novo.
 */
function formularioDeVinculo(contas, perfis) {
  const livres = contas.filter((c) => !(c.links || []).length);
  const disponiveis = perfis.filter((p) => p.active && !p.linked_user_id);
  if (!perfis.length) return "";
  if (!livres.length || !disponiveis.length) {
    return `<p class="op-muted" data-vinculo-indisponivel>Para vincular, é preciso uma conta já criada e sem vínculo e um perfil profissional ativo sem conta (cadastre o perfil em Pessoas).</p>`;
  }
  return `<form class="op-toolbar" data-access-vincular>
    <label>Conta existente <select name="conta" required><option value="">Escolha</option>${livres.map((c) => `<option value="${e(c.id)}">${e(c.email)}${c.name ? ` — ${e(c.name)}` : ""}</option>`).join("")}</select></label>
    <label>Perfil profissional <select name="perfil" required><option value="">Escolha</option>${disponiveis.map((p) => `<option value="${e(p.profile_id)}">${e(p.display_name || p.profile_id)}</option>`).join("")}</select></label>
    <button type="submit" class="op-button">Vincular conta ao profissional</button>
  </form>`;
}

export function renderizarAcessos({ contas = [], perfis = [], filtros = {}, erro = "", aviso = "", confirmando = "", ocupado = false } = {}) {
  const lista = filtrarContas(contas, filtros);
  const opcoes = (mapa, atual) => Object.entries(mapa).map(([k, v]) => `<option value="${e(k)}"${k === atual ? " selected" : ""}>${e(v)}</option>`).join("");
  return `<header class="op-header"><div><p class="op-eyebrow">Pessoas e patrimônio</p>
      <h2 id="acessos-titulo" tabindex="-1">Usuários e acessos</h2>
      <p>Contas do portal e seus vínculos. Cada operação é autorizada e registrada pelo banco.</p></div>
    </header>
    ${aviso ? `<p class="op-muted" role="status" data-access-aviso>${e(aviso)}</p>` : ""}
    ${erro ? "" : formularioDeVinculo(contas, perfis)}
    <form class="op-toolbar" data-access-filtros role="search">
      <label>Buscar <input type="search" name="busca" value="${e(filtros.busca || "")}" placeholder="Nome, e-mail ou perfil"></label>
      <label>Papel <select name="papel"><option value="">Todos</option>${opcoes(ROTULO_PAPEL, filtros.papel)}</select></label>
      <label>Status <select name="status"><option value="">Todos</option>${opcoes(STATUS, filtros.status)}</select></label>
    </form>
    ${erro ? `<p class="op-loading" role="alert">${e(erro)}</p>` : `<p class="op-muted" role="status">${lista.length} de ${contas.length} conta(s).</p>
    <div class="op-table-scroll"${ocupado ? ' aria-busy="true"' : ""}><table class="op-table">
      <thead><tr><th scope="col">Conta</th><th scope="col">Status</th><th scope="col">Papéis</th><th scope="col">Vínculos</th><th scope="col">Último acesso</th></tr></thead>
      <tbody>${lista.map((c) => linha(c, confirmando)).join("") || `<tr><td colspan="5" class="op-empty">Nenhuma conta encontrada com esses filtros.</td></tr>`}</tbody>
    </table></div>`}`;
}

export function mensagemDeErro(error) {
  if (["PGRST202", "42883"].includes(error?.code)) return "Esta seção fica disponível depois que a atualização do banco for aplicada.";
  if (error?.code === "42501") return "Seu acesso não permite consultar as contas.";
  return "Não foi possível carregar as contas agora. Tente de novo em instantes.";
}

/* Mensagens das operações: o texto vem do banco só para erros de regra conhecidos. */
export function mensagemDaOperacao(error) {
  if (["PGRST202", "42883"].includes(error?.code)) return "A operação fica disponível depois que a atualização do banco for aplicada.";
  if (error?.code === "42501") return "Seu acesso não permite alterar vínculos.";
  if (["23505", "22023", "P0002"].includes(error?.code) && error?.message) return error.message;
  return "Não foi possível concluir. Nada foi alterado; tente de novo em instantes.";
}

export function createAccessPanel({ root, client }) {
  const alvo = root?.querySelector?.("[data-access-view]");
  let contas = [];
  let perfis = [];
  let erro = "";
  let aviso = "";
  let confirmando = "";
  let ocupado = false;
  const filtros = { busca: "", papel: "", status: "" };
  const desenhar = () => { if (alvo) alvo.innerHTML = renderizarAcessos({ contas, perfis, filtros, erro, aviso, confirmando, ocupado }); };

  async function carregar() {
    const [lista, profs] = await Promise.all([client.rpc("admin_list_accounts"), client.rpc("admin_list_professional_profiles")]);
    if (lista.error) { contas = []; erro = mensagemDeErro(lista.error); } else { contas = Array.isArray(lista.data) ? lista.data : []; erro = ""; }
    perfis = !profs.error && Array.isArray(profs.data) ? profs.data : [];
    desenhar();
    return contas;
  }

  async function operar(nome, args, sucesso) {
    if (ocupado) return;
    ocupado = true; aviso = ""; desenhar();
    try {
      const { data: resposta, error } = await client.rpc(nome, args);
      aviso = error ? mensagemDaOperacao(error) : sucesso(resposta || {});
    } catch { aviso = mensagemDaOperacao(null); }
    ocupado = false; confirmando = "";
    await carregar();
  }

  alvo?.addEventListener?.("input", (evento) => {
    const campo = evento.target;
    if (!campo?.name || !(campo.name in filtros) || !campo.closest?.("[data-access-filtros]")) return;
    filtros[campo.name] = campo.value;
    desenhar();
    alvo.querySelector?.(`[data-access-filtros] [name="${campo.name}"]`)?.focus?.();
  });
  alvo?.addEventListener?.("submit", (evento) => {
    evento.preventDefault();
    const form = evento.target;
    if (!form?.matches?.("[data-access-vincular]")) return;
    const conta = form.querySelector('[name="conta"]')?.value;
    const perfil = form.querySelector('[name="perfil"]')?.value;
    if (!conta || !perfil) { aviso = "Escolha a conta e o perfil profissional."; desenhar(); return; }
    void operar("admin_link_professional", { p_user_id: conta, p_profile_id: perfil },
      (r) => (r.changed === false ? "Este vínculo já estava ativo." : "Conta vinculada ao perfil profissional."));
  });
  alvo?.addEventListener?.("click", (evento) => {
    const botao = evento.target?.closest?.("[data-acao]");
    if (!botao) return;
    const acao = botao.getAttribute("data-acao");
    const conta = botao.getAttribute("data-conta-id");
    const perfil = botao.getAttribute("data-perfil");
    if (acao === "cancelar") { confirmando = ""; desenhar(); return; }
    if (acao === "desativar") { confirmando = `${conta}|${perfil}`; desenhar(); return; }
    if (acao === "desativar-confirmado") {
      void operar("admin_set_professional_link", { p_user_id: conta, p_profile_id: perfil, p_active: false },
        (r) => `Vínculo desativado.${r.rooms_closed ? ` ${r.rooms_closed} sala(s) aberta(s) encerrada(s); a desconexão no LiveKit ocorre em até um minuto.` : ""}`);
    }
    if (acao === "reativar") {
      void operar("admin_set_professional_link", { p_user_id: conta, p_profile_id: perfil, p_active: true }, () => "Vínculo reativado.");
    }
  });
  return {
    reload: carregar,
    clear() { contas = []; perfis = []; erro = ""; aviso = ""; confirmando = ""; if (alvo) alvo.innerHTML = ""; },
  };
}
