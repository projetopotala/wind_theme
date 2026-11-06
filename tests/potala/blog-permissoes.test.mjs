import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  nivelBlog, geridaNoBlog, renderizarAcessos, mensagemDoBlog, createAccessPanel, NIVEIS_BLOG,
} from "../../outputs/js/admin/access-panel.js";
import { comoRegistro } from "../../outputs/js/blog/blog-remoto.js";

const MIG = "202611060005_blog_editorial_permissions.sql";
const sql = readFileSync(new URL(`../../supabase/migrations/${MIG}`, import.meta.url), "utf8");
const codigo = sql.replace(/--.*$/gm, "");
const corpoDe = (fn) => codigo.slice(codigo.indexOf(`function public.${fn}(`));

const ow = { id: "o1", email: "o@x", name: "Owner", status: "ativa", portal_role: "owner", portal_active: true, blog: null, links: [] };
const escritor = { id: "w1", email: "w@x", name: "W", status: "ativa", portal_role: "blog_editor", portal_active: true, blog: { read: true, edit: true, publish: false, active: true }, links: [] };
const editor = { ...escritor, id: "e1", email: "e@x", blog: { read: true, edit: true, publish: true, active: true } };
const comum = { id: "c1", email: "c@x", name: "C", status: "ativa", portal_role: null, portal_active: null, blog: null, links: [] };
const revogado = { ...escritor, id: "r1", portal_active: false };

/* ---------- banco: migration ---------- */
test("concessao: so owner ativo, sem anon, SECURITY DEFINER com search_path vazio", () => {
  const f = corpoDe("admin_set_blog_access");
  assert.match(f.slice(0, 1200), /role = 'owner' and active/);
  assert.doesNotMatch(f.slice(0, 1200), /is_portal_admin/);
  assert.match(codigo, /revoke all on function public\.admin_set_blog_access\(uuid, text\) from public, anon;/);
  assert.match(codigo, /grant execute on function public\.admin_set_blog_access\(uuid, text\) to authenticated;/);
  assert.match(f.slice(0, 400), /security definer set search_path = ''/);
  assert.match(f, /pg_advisory_xact_lock/);
});

test("concessao: recusa owner/admin, a si mesma e niveis fora de none/writer/editor", () => {
  const f = corpoDe("admin_set_blog_access");
  assert.match(f, /p_level not in \('none', 'writer', 'editor'\)/);
  assert.match(f, /v_role is distinct from 'blog_editor'[\s\S]*?errcode = '42501'/);
  assert.match(f, /p_user_id = v_caller/);
});

test("concessao: nunca grava owner/admin e so cria o papel existente blog_editor", () => {
  const f = corpoDe("admin_set_blog_access");
  const insercaoUsers = f.slice(f.indexOf("insert into public.users"), f.indexOf("insert into public.portal_module_permissions"));
  assert.match(insercaoUsers, /'blog_editor'/);
  assert.doesNotMatch(f, /role\s*=\s*'(owner|admin)'\s*(,|where|;)/);
  assert.doesNotMatch(insercaoUsers, /'owner'|'admin'/);
  assert.doesNotMatch(codigo, /grant [^;]*on [^;]*public\.(users|portal_module_permissions)[^;]*to[^;]*(anon|authenticated)/i);
});

test("auditoria: ator, alvo, antes e depois, so quando muda de fato", () => {
  const f = corpoDe("admin_set_blog_access");
  assert.match(f, /if v_antes is distinct from v_depois then\s+insert into public\.admin_access_events \(actor_id, action, target_user_id, before, after\)/);
  assert.match(codigo, /check \(action in \([^)]*'blog_access_changed'\)\)/);
  assert.match(f, /is distinct from \(true, true, excluded\.can_publish, true\)/);
});

test("escritor: salvar exige autoria, bloqueia publicar/arquivar/destacar e corrida de id", () => {
  const f = corpoDe("mesa_salvar_post");
  assert.match(f, /p_acao in \('publicar', 'agendar', 'despublicar', 'arquivar'\) and not v_publica/);
  assert.match(f, /atual\.created_by is distinct from v_uid/);
  assert.match(f, /if destaque and not v_publica/);
  assert.match(f, /where v_publica or public\.blog_posts\.created_by = v_uid/);
  assert.match(f, /if salvo\.id is null then\s+raise exception/);
  assert.match(f, /created_by\)\s+values\(.*v_uid\)/s);
  assert.doesNotMatch(f, /created_by=excluded/);
});

test("listagem e leitura: escritor nao ve rascunho alheio nem pendencia alheia; versoes e categorias restritas", () => {
  const l = corpoDe("mesa_listar_posts");
  assert.match(l, /v_publica\s+or post\.created_by = v_uid\s+or post\.status = 'published'/);
  assert.match(l, /- 'pending_document' - 'pending_updated_at'/);
  assert.match(codigo, /"administracao le as versoes"[\s\S]*?has_portal_permission\('blog','publish'\)\)\s+or \(\(select public\.has_portal_permission\('blog','read'\)\) and autor_id = \(select auth\.uid\(\)\)\)/);
  for (const op of ["cria", "altera", "apaga"]) {
    const bloco = codigo.slice(codigo.indexOf(`"administracao ${op} categorias" on`));
    assert.match(bloco.slice(0, 400), /has_portal_permission\('blog','publish'\)/, op);
  }
});

test("historico: so owner, limitado e sem dados sensiveis", () => {
  const f = corpoDe("admin_list_blog_events");
  assert.match(f.slice(0, 500), /role = 'owner' and active/);
  assert.match(f, /least\(greatest\(coalesce\(p_limit, 50\), 1\), 200\)/);
  assert.doesNotMatch(f, /'email'|password|token|raw_user_meta_data/);
});

test("migration nao mexe em papeis administrativos nem em outras tabelas", () => {
  assert.doesNotMatch(codigo, /update public\.users set (?:(?!where)[^;])*\brole\s*=/i);
  assert.doesNotMatch(codigo, /drop table|truncate|delete from/i);
  assert.ok(existsSync(new URL("../../supabase/tests/prod-03-blog-permissions.sql", import.meta.url)));
  const t = readFileSync(new URL("../../supabase/tests/prod-03-blog-permissions.sql", import.meta.url), "utf8");
  for (const caso of ["concede escritor", "repeticao nao muda", "escritor edita o proprio", "editor publica texto alheio", "revoga", "uma unica conta administrativa real"]) {
    assert.ok(t.includes(caso), caso);
  }
});

/* ---------- interface: Usuarios e acessos ---------- */
test("nivel do Blog derivado so dos dados do banco", () => {
  assert.equal(nivelBlog(escritor), "writer");
  assert.equal(nivelBlog(editor), "editor");
  assert.equal(nivelBlog(revogado), "none");
  assert.equal(nivelBlog(comum), "none");
  assert.equal(nivelBlog({ ...escritor, blog: { ...escritor.blog, active: false } }), "none");
  assert.equal(nivelBlog(ow), "none");
  assert.equal(geridaNoBlog(ow), false);
  assert.equal(geridaNoBlog({ portal_role: "admin" }), false);
  assert.equal(geridaNoBlog(escritor), true);
});

test("owner ve controle do Blog nas contas comuns e 'acesso total' nas administrativas", () => {
  const html = renderizarAcessos({ contas: [ow, escritor, comum] });
  const linhas = html.split("<tr data-conta=").slice(1);
  assert.match(linhas[0], /Acesso total ao Blog/);
  assert.doesNotMatch(linhas[0], /data-blog-nivel/);
  assert.match(linhas[1], /data-blog-nivel[\s\S]*<option value="writer" selected>/);
  assert.match(linhas[2], /<option value="none" selected>/);
});

test("alterar pede confirmacao com o efeito; cancelar nao chama o banco", () => {
  const html = renderizarAcessos({ contas: [comum], confirmando: "blog|c1|editor" });
  assert.match(html, /data-acao="blog-confirmar" data-conta-id="c1" data-nivel="editor"/);
  assert.match(html, /publicar textos de qualquer autor/);
  const nao = renderizarAcessos({ contas: [comum], confirmando: "blog|c1|none" });
  assert.match(nao, /remove o acesso editorial/);
});

test("historico aparece para o owner", () => {
  const html = renderizarAcessos({ contas: [escritor], eventos: [{ at: "2026-11-06T12:00:00Z", actor_name: "Owner", target_name: "W", before: "none", after: "writer" }] });
  assert.match(html, /data-blog-historico/);
  assert.match(html, /Sem acesso ao Blog[\s\S]*Escritor/);
});

function painelFalso(respostas) {
  const chamadas = []; const ouvintes = {};
  const alvo = { innerHTML: "", addEventListener(t, f) { ouvintes[t] = f; }, querySelector() { return null; } };
  const client = { rpc: async (n, a) => { chamadas.push([n, a]); return respostas[n] || { data: [], error: null }; } };
  const painel = createAccessPanel({ root: { querySelector: () => alvo }, client });
  return { painel, chamadas, ouvintes, alvo };
}
const tick = async () => { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); };
const clique = (attrs, nivelSelecionado) => {
  const linha = { querySelector: () => ({ value: nivelSelecionado }) };
  const botao = { getAttribute: (k) => attrs[k] ?? null, closest: (s) => (s === "tr" ? linha : botao) };
  return { target: { closest: () => botao } };
};

test("fluxo: escolher nivel, confirmar, RPC com argumentos certos e lista atualizada sem recarregar", async () => {
  const f = painelFalso({
    admin_list_accounts: { data: [comum], error: null },
    admin_set_blog_access: { data: { changed: true, level: "writer" }, error: null },
  });
  await f.painel.reload();
  f.ouvintes.click(clique({ "data-acao": "blog", "data-conta-id": "c1" }, "writer"));
  assert.equal(f.chamadas.filter((c) => c[0] === "admin_set_blog_access").length, 0);
  assert.match(f.alvo.innerHTML, /data-acao="blog-confirmar"/);
  const antes = f.chamadas.filter((c) => c[0] === "admin_list_accounts").length;
  f.ouvintes.click(clique({ "data-acao": "blog-confirmar", "data-conta-id": "c1", "data-nivel": "writer" }));
  await tick();
  assert.deepEqual(f.chamadas.find((c) => c[0] === "admin_set_blog_access")[1], { p_user_id: "c1", p_level: "writer" });
  assert.ok(f.chamadas.filter((c) => c[0] === "admin_list_accounts").length > antes, "recarregou a lista");
  assert.match(f.alvo.innerHTML, /Acesso de Escritor concedido/);
});

test("escolher o mesmo nivel nao abre confirmacao; erro do banco aparece claro", async () => {
  const f = painelFalso({
    admin_list_accounts: { data: [escritor], error: null },
    admin_set_blog_access: { data: null, error: { code: "42501", message: "Somente a conta owner pode alterar permissões do Blog." } },
  });
  await f.painel.reload();
  f.ouvintes.click(clique({ "data-acao": "blog", "data-conta-id": "w1" }, "writer"));
  assert.doesNotMatch(f.alvo.innerHTML, /blog-confirmar/);
  f.ouvintes.click(clique({ "data-acao": "blog-confirmar", "data-conta-id": "w1", "data-nivel": "editor" }));
  await tick();
  assert.match(f.alvo.innerHTML, /Somente a conta owner/);
});

test("mensagens: regra do banco aparece; detalhe interno nao", () => {
  assert.equal(mensagemDoBlog({ code: "22023", message: "Conta não encontrada." }), "Conta não encontrada.");
  assert.match(mensagemDoBlog({ code: "XX000", message: "detalhe interno" }), /Nada foi alterado/);
  assert.match(mensagemDoBlog({ code: "PGRST202" }), /atualizacao do banco/);
  assert.deepEqual(Object.keys(NIVEIS_BLOG), ["none", "writer", "editor"]);
});

/* ---------- Mesa do Blog ---------- */
test("registro remoto carrega a autoria para a Mesa", () => {
  const r = comoRegistro({ document: { id: "p1", slug: "p1", title: "T", status: "draft" }, status: "draft", created_by: "w1" });
  assert.equal(r.criadoPor, "w1");
  assert.equal(comoRegistro({ document: { id: "p2", slug: "p2", title: "T" } }).criadoPor, null);
});

test("Mesa: permissoes do escritor limitam a textos proprios; owner/editor nao", () => {
  const entry = readFileSync(new URL("../../outputs/js/blog-admin/blog-admin-entry.js", import.meta.url), "utf8");
  assert.match(entry, /somenteProprios: access\.permissions\?\.publish !== true/);
  const app = readFileSync(new URL("../../outputs/js/blog-admin/mesa-app.js", import.meta.url), "utf8");
  assert.match(app, /if \(ctx\.permissoes\.somenteProprios\)/);
  assert.match(app, /existente\.criadoPor !== ctx\.permissoes\.usuarioId/);
});

/* ---------- revisao final: midia, publicado e rollback ---------- */
test("midia: escritor so troca/apaga o que enviou; editor/owner qualquer arquivo; enviar exige edit", () => {
  for (const [op, nome] of [["update", "mesa troca midia do blog"], ["delete", "mesa remove midia do blog"]]) {
    const bloco = codigo.slice(codigo.indexOf(`create policy "${nome}" on storage.objects for ${op}`));
    const politica = bloco.slice(0, bloco.indexOf(";"));
    assert.match(politica, /bucket_id = 'blog-midia'/, op);
    assert.match(politica, /has_portal_permission\('blog','publish'\)/, op);
    assert.match(politica, /has_portal_permission\('blog','edit'\)\) and owner_id = \(select auth\.uid\(\)\)::text/, op);
  }
  assert.doesNotMatch(codigo, /create policy "mesa envia midia do blog"/, "enviar segue como esta (edit)");
});

test("publicado: escritor so grava pendencia; autoria vem de auth.uid(), nunca do pedido", () => {
  const f = corpoDe("mesa_salvar_post");
  const pendente = f.slice(f.indexOf("if p_acao = 'pendente' then"), f.indexOf("p_acao := 'rascunho';"));
  assert.match(pendente, /update public\.blog_posts set pending_document=p_post/);
  assert.doesNotMatch(pendente, /set [^;]*\b(document|status|featured)=/);
  assert.match(f, /if p_acao = 'rascunho' and existe and atual\.status in \('published','scheduled'\) then\s+raise exception/);
  assert.match(f, /v_uid uuid := \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(f, /p_post\s*->>?\s*'created_by'/);
  assert.doesNotMatch(f, /created_by\s*=\s*excluded/);
});

test("rollback incremental preserva autoria, auditoria e concessoes", () => {
  const rb = readFileSync(new URL("../../supabase/rollbacks/202611060005_rollback_comportamento.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  assert.match(rb, /create or replace function public\.mesa_salvar_post\(/);
  assert.match(rb, /create or replace function public\.mesa_listar_posts\(/);
  assert.doesNotMatch(rb, /drop column|drop table|drop function|delete from|truncate|admin_access_events|created_by/i);
  assert.ok(existsSync(new URL("../../supabase/tests/prod-03-rollback.sql", import.meta.url)));
});
