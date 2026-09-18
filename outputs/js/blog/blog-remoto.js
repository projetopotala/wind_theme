/*
 * O BLOG NO BANCO DO PORTAL.
 *
 * Duas portas para as mesmas tabelas:
 *
 * - criarBlogPublico: as páginas do Caderno e do artigo, pelo PostgREST sem
 *   sessão. Lê só o publicado e os comentários aprovados; envia comentário,
 *   inscrição e leitura. Se a leitura dos textos falhar, a página mostra o
 *   acervo empacotado — uma página em branco não ajuda ninguém. Envio que
 *   falha diz que falhou: nunca finge que foi.
 *
 * - criarBlogAdministrativo: a mesa do blogueiro, pelo SDK com a sessão de
 *   quem entrou. O banco só aceita a escrita de owner/admin.
 */
import { CATEGORIAS } from "./blog-data.js";
import { normalizePost, normalizePosts, slugifyBlogTitle } from "./blog-model.js";
import { SUPABASE_CONFIG } from "../supabase/config.js";

export const BLOG_PADRAO = Object.freeze({ name: "Caderno de Travessia", cover: "media/blog-hero-caminhante.webp" });

const comoConfiguracao = (linha) => ({
  name: String(linha?.name || "").trim() || BLOG_PADRAO.name,
  cover: String(linha?.cover || "").trim() || BLOG_PADRAO.cover,
});

const comoComentario = (linha) => ({
  id: linha.id,
  slug: linha.post_slug ?? null,
  nome: linha.author_name,
  texto: linha.body,
  status: linha.status || "approved",
  criadoEm: linha.created_at,
});

/* "há 3 dias", como a conversa sempre mostrou — agora a partir da data gravada. */
export function quandoFoi(iso, agora = Date.now()) {
  const minutos = Math.max(0, Math.round((agora - Date.parse(iso)) / 60000));
  if (!Number.isFinite(minutos)) return "";
  if (minutos < 2) return "agora";
  if (minutos < 60) return `há ${minutos} minutos`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return horas === 1 ? "há 1 hora" : `há ${horas} horas`;
  const dias = Math.round(horas / 24);
  if (dias < 31) return dias === 1 ? "ontem" : `há ${dias} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
}

export function validarEnvioDeComentario({ nome = "", texto = "" } = {}) {
  const erros = {};
  if (!String(nome).trim()) erros.nome = "Diga como quer ser chamada ou chamado.";
  else if (String(nome).trim().length > 60) erros.nome = "Use até 60 caracteres.";
  if (String(texto).trim().length < 3) erros.texto = "Escreva ao menos algumas palavras.";
  else if (String(texto).trim().length > 600) erros.texto = "Use até 600 caracteres.";
  return erros;
}

/*
 * O ACERVO LOCAL — ver textos do código antes de levá-los ao banco.
 *
 * `?acervo=local` liga o modo nesta aba (fica guardado na sessão, para valer
 * também no artigo); `?acervo=banco` desliga. Nele o Caderno não lê nem grava
 * no banco: mostra os textos empacotados em blog-data.js, e comentário e
 * inscrição avisam que estão desligados. Serve para revisar uma leva nova sem
 * publicá-la no site de todos.
 */
const CHAVE_ACERVO = "potala.blog.acervo";

export function querAcervoLocal(local = globalThis.location, sessao = globalThis.sessionStorage) {
  const pedido = new URLSearchParams(local?.search || "").get("acervo");
  try {
    if (pedido === "local") sessao?.setItem(CHAVE_ACERVO, "local");
    if (pedido === "banco") sessao?.removeItem(CHAVE_ACERVO);
    return sessao?.getItem(CHAVE_ACERVO) === "local";
  } catch {
    return pedido === "local";
  }
}

export function criarRestSemBanco() {
  const recusar = async () => {
    throw Object.assign(new Error("Modo de acervo local: nada é lido nem gravado no banco."), { code: "acervo-local" });
  };
  return { ler: recusar, inserir: recusar, rpc: recusar };
}

/* A lista de categorias sem o "tudo", que é filtro e não categoria. */
export const CATEGORIAS_PADRAO = Object.freeze(
  CATEGORIAS.filter(({ id }) => id !== "todos").map(({ id, rotulo }, indice) => ({ id, rotulo, ordem: indice + 1, imagem: "" })),
);

const comoCategoria = (linha) => ({
  id: String(linha.id),
  rotulo: String(linha.rotulo || linha.id),
  ordem: Number(linha.ordem) || 0,
  imagem: String(linha.imagem || ""),
});

export function criarBlogPublico({ rest, reserva = [], aoFalhar = () => {} } = {}) {
  if (!rest?.ler) throw new TypeError("O acesso ao banco é obrigatório.");
  const acervo = normalizePosts(reserva);

  return {
    /*
     * Sem filtro de status na consulta: quem decide o que o visitante vê é a
     * política do banco (publicado, ou agendado cuja hora já chegou). O que
     * volta está no ar, e é marcado como publicado para a página.
     */
    async listarPublicados() {
      try {
        const linhas = await rest.ler("blog_posts", { select: "document,status,publish_at" });
        return normalizePosts((linhas || []).map((linha) => ({ ...linha.document, status: "published" })));
      } catch (erro) {
        aoFalhar(erro);
        return acervo.filter((post) => post.status === "published");
      }
    },
    async listarCategorias() {
      try {
        const linhas = await rest.ler("blog_categories", { select: "id,rotulo,ordem,imagem", order: "ordem.asc" });
        return (linhas || []).length ? linhas.map(comoCategoria) : [...CATEGORIAS_PADRAO];
      } catch (erro) {
        aoFalhar(erro, "blog.categorias");
        return [...CATEGORIAS_PADRAO];
      }
    },
    async lerConfiguracao() {
      try {
        const [linha] = await rest.ler("blog_settings", { select: "name,cover", id: "eq.1" }) || [];
        return comoConfiguracao(linha);
      } catch (erro) {
        aoFalhar(erro);
        return { ...BLOG_PADRAO };
      }
    },
    async listarComentarios(slug = null) {
      const linhas = await rest.ler("blog_comments", {
        select: "id,post_slug,author_name,body,created_at",
        status: "eq.approved",
        post_slug: slug ? `eq.${slug}` : "is.null",
        order: "created_at.desc",
        limit: "50",
      });
      return (linhas || []).map(comoComentario);
    },
    async enviarComentario({ slug = null, nome, texto }) {
      const erros = validarEnvioDeComentario({ nome, texto });
      if (Object.keys(erros).length) throw Object.assign(new Error(Object.values(erros)[0]), { erros });
      await rest.inserir("blog_comments", { post_slug: slug || null, author_name: String(nome).trim(), body: String(texto).trim() });
    },
    async inscrever(email, origem = "blog") {
      await rest.rpc("subscribe_newsletter", { p_email: String(email || "").trim(), p_source: origem });
    },
    async registrarLeitura(slug) {
      try {
        await rest.rpc("register_blog_view", { p_slug: String(slug || "") });
      } catch (erro) {
        /* Contar a leitura é estatística; não pode atrapalhar quem está lendo. */
        aoFalhar(erro, "blog.registrarLeitura");
      }
    },
  };
}

export class BlogRemotoError extends Error {
  constructor(operacao, causa = {}) {
    const texto = `${causa.message || ""} ${causa.details || ""}`;
    const mensagem = causa.code === "42501"
      ? "Seu acesso não permite alterar o Blog."
      : causa.code === "23505" && /slug/.test(texto)
        ? "Já existe um texto com este endereço. Mude o endereço em SEO."
        : causa.code === "23505" && /blog_categories/.test(texto)
          ? "Já existe uma categoria com esse nome."
          : causa.code === "PGRST202" || causa.code === "PGRST205"
            ? "A mesa do Blog ainda não foi instalada no banco do Portal."
            : /Failed to fetch|NetworkError|Load failed/i.test(texto)
              ? "Sem conexão com o banco do Portal. Suas alterações continuam na tela; tente de novo."
              : causa.message || `Falha ao ${operacao}.`;
    super(mensagem);
    this.name = "BlogRemotoError";
    this.code = causa.code || "";
    this.cause = causa;
  }
}

const exigir = (operacao, error) => { if (error) throw new BlogRemotoError(operacao, error); };

/*
 * Um texto como a mesa o enxerga: o que está no ar (ou gravado), as
 * alterações ainda não publicadas e os dados de publicação que só o banco tem.
 */
export function comoRegistro(linha = {}) {
  const post = normalizePost(linha.document || {});
  return {
    id: post.id,
    post,
    pendente: linha.pending_document ? normalizePost(linha.pending_document) : null,
    status: linha.status || post.status,
    publicarEm: linha.publish_at || null,
    pendenteEm: linha.pending_updated_at || null,
    criadoEm: linha.created_at || null,
    atualizadoEm: linha.updated_at || post.updatedAt,
    atualizadoPor: linha.updated_by_name || "",
  };
}

export const MIDIA_BUCKET = "blog-midia";
export const MIDIA_TIPOS = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
export const MIDIA_LIMITE = 5 * 1024 * 1024;

export function validarImagem(arquivo) {
  if (!arquivo) return "Escolha uma imagem.";
  if (!MIDIA_TIPOS.includes(arquivo.type)) return "Use uma imagem JPG, PNG ou WEBP.";
  if (arquivo.size > MIDIA_LIMITE) return `A imagem tem ${(arquivo.size / 1048576).toFixed(1)} MB; o limite é 5 MB.`;
  return "";
}

async function resumoDoArquivo(arquivo) {
  const bytes = await arquivo.arrayBuffer();
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function criarBlogAdministrativo({ client, config = SUPABASE_CONFIG, xhr = () => new XMLHttpRequest() } = {}) {
  if (!client?.from || !client?.rpc) throw new TypeError("Um cliente Supabase válido é obrigatório.");
  const urlPublica = (nome) => client.storage.from(MIDIA_BUCKET).getPublicUrl(nome).data.publicUrl;

  return {
    demonstracao: false,

    async listar() {
      const { data, error } = await client.rpc("mesa_listar_posts");
      exigir("listar os textos", error);
      return (data || []).map(comoRegistro);
    },

    /* acao: rascunho | pendente | revisao | publicar | agendar | despublicar | arquivar */
    async salvar(post, acao, { quando = null, registrar = true, resumo = "" } = {}) {
      const normalizado = normalizePost({ ...post, updatedAt: new Date().toISOString() });
      const { data, error } = await client.rpc("mesa_salvar_post", {
        p_post: normalizado,
        p_acao: acao,
        p_quando: quando ? new Date(quando).toISOString() : null,
        p_registrar: registrar,
        p_resumo: String(resumo || "").slice(0, 500),
      });
      exigir("salvar o texto", error);
      return comoRegistro(data);
    },

    async remover(id) {
      const { error } = await client.from("blog_posts").delete().eq("id", id);
      exigir("excluir o texto", error);
    },

    async versoes(id) {
      const { data, error } = await client
        .from("blog_post_versions")
        .select("id,created_at,acao,status,titulo,autor_nome,resumo,documento")
        .eq("post_id", id)
        .order("created_at", { ascending: false })
        .limit(40);
      exigir("ler o histórico", error);
      return (data || []).map((linha) => ({
        id: linha.id, em: linha.created_at, acao: linha.acao, status: linha.status,
        titulo: linha.titulo, autor: linha.autor_nome, resumo: linha.resumo, documento: normalizePost(linha.documento),
      }));
    },

    async listarCategorias() {
      const { data, error } = await client.from("blog_categories").select("id,rotulo,ordem,imagem").order("ordem");
      exigir("ler as categorias", error);
      return (data || []).map(comoCategoria);
    },
    async criarCategoria({ rotulo, ordem = 99 }) {
      const nome = String(rotulo || "").trim();
      if (!nome) throw new BlogRemotoError("criar a categoria", { message: "Dê um nome à categoria." });
      const { data, error } = await client.from("blog_categories")
        .insert({ id: slugifyBlogTitle(nome), rotulo: nome.toLocaleLowerCase("pt-BR"), ordem })
        .select("id,rotulo,ordem,imagem").single();
      exigir("criar a categoria", error);
      return comoCategoria(data);
    },
    async atualizarCategoria(id, campos) {
      const permitido = Object.fromEntries(Object.entries(campos).filter(([chave]) => ["rotulo", "ordem", "imagem"].includes(chave)));
      const { error } = await client.from("blog_categories").update({ ...permitido, updated_at: new Date().toISOString() }).eq("id", id);
      exigir("alterar a categoria", error);
    },
    async removerCategoria(id) {
      const { error } = await client.from("blog_categories").delete().eq("id", id);
      exigir("apagar a categoria", error);
    },

    async listarMidia() {
      const { data, error } = await client.storage.from(MIDIA_BUCKET).list("", { limit: 500, sortBy: { column: "created_at", order: "desc" } });
      exigir("ler a biblioteca de imagens", error);
      return (data || []).filter((item) => item.id).map((item) => ({
        nome: item.name, url: urlPublica(item.name), bytes: item.metadata?.size || 0, em: item.created_at, origem: "enviada",
      }));
    },

    /*
     * Envio com progresso. O nome começa pelo resumo do conteúdo: a mesma
     * imagem enviada duas vezes (mesmo com outro nome de arquivo) é
     * reconhecida antes do envio e reaproveitada.
     */
    async enviarImagem(arquivo, { aoProgresso = () => {} } = {}) {
      const problema = validarImagem(arquivo);
      if (problema) throw new BlogRemotoError("enviar a imagem", { message: problema });
      const resumo = (await resumoDoArquivo(arquivo)).slice(0, 16);
      const { data: existentes } = await client.storage.from(MIDIA_BUCKET).list("", { search: resumo, limit: 1 });
      if (existentes?.length) {
        aoProgresso(1);
        return { url: urlPublica(existentes[0].name), repetida: true };
      }
      const extensao = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[arquivo.type];
      const base = slugifyBlogTitle(String(arquivo.name || "imagem").replace(/\.[^.]+$/, "")).slice(0, 40);
      const nome = `${resumo}-${base}.${extensao}`;
      const { data: sessao } = await client.auth.getSession();
      const token = sessao?.session?.access_token;
      if (!token) throw new BlogRemotoError("enviar a imagem", { message: "Sua sessão expirou. Entre de novo para enviar imagens." });
      await new Promise((resolver, falhar) => {
        const pedido = xhr();
        pedido.open("POST", `${config.url}/storage/v1/object/${MIDIA_BUCKET}/${encodeURIComponent(nome)}`);
        pedido.setRequestHeader("Authorization", `Bearer ${token}`);
        pedido.setRequestHeader("apikey", config.publishableKey);
        pedido.setRequestHeader("x-upsert", "false");
        pedido.setRequestHeader("Content-Type", arquivo.type);
        pedido.upload.onprogress = (evento) => { if (evento.lengthComputable) aoProgresso(evento.loaded / evento.total); };
        pedido.onload = () => (pedido.status < 300
          ? resolver()
          : falhar(new BlogRemotoError("enviar a imagem", { message: pedido.status === 413 ? "A imagem passou do limite de 5 MB." : "O envio da imagem foi recusado." })));
        pedido.onerror = () => falhar(new BlogRemotoError("enviar a imagem", { message: "Sem conexão. Tente enviar de novo." }));
        pedido.send(arquivo);
      });
      aoProgresso(1);
      return { url: urlPublica(nome), repetida: false };
    },

    async lerConfiguracao() {
      const { data, error } = await client.from("blog_settings").select("name,cover").eq("id", 1).maybeSingle();
      exigir("ler a configuração", error);
      return comoConfiguracao(data);
    },
    async salvarConfiguracao(configuracao) {
      const proxima = comoConfiguracao(configuracao);
      const { error } = await client.from("blog_settings").update({ ...proxima, updated_at: new Date().toISOString() }).eq("id", 1);
      exigir("salvar a configuração", error);
      return proxima;
    },
    async leituras() {
      const { data, error } = await client.from("blog_post_views").select("slug,views");
      exigir("ler as visualizações", error);
      return Object.fromEntries((data || []).map((linha) => [linha.slug, Number(linha.views) || 0]));
    },
    async comentarios() {
      const { data, error } = await client
        .from("blog_comments")
        .select("id,post_slug,author_name,body,status,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      exigir("ler os comentários", error);
      return (data || []).map(comoComentario);
    },
    async moderar(id, status) {
      if (!["approved", "rejected"].includes(status)) throw new TypeError("Situação de comentário inválida.");
      const { error } = await client.from("blog_comments").update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
      exigir("moderar o comentário", error);
    },
    async inscritos() {
      const { count, error } = await client.from("newsletter_subscriptions").select("id", { count: "exact", head: true });
      exigir("contar as inscrições", error);
      return count || 0;
    },
  };
}

/*
 * A mesa de demonstração ("acesso de teste") continua no navegador: sem conta,
 * o banco não deixaria gravar, e a demonstração não deve sujar o Blog real.
 * Tem a mesma forma da mesa real, com as regras de status reproduzidas aqui.
 */
export function criarBlogDeDemonstracao({ local, lerConfiguracao, salvarConfiguracao } = {}) {
  const meta = new Map();
  const versoes = new Map();
  let categorias = [...CATEGORIAS_PADRAO];

  const registroDe = (post) => {
    const extra = meta.get(post.id) || {};
    const status = extra.status || post.status;
    return {
      id: post.id,
      post,
      pendente: extra.pendente || null,
      status,
      publicarEm: extra.publicarEm || (status === "published" && post.publishedAt ? `${post.publishedAt}T12:00:00-03:00` : null),
      pendenteEm: extra.pendenteEm || null,
      criadoEm: post.updatedAt,
      atualizadoEm: extra.atualizadoEm || post.updatedAt,
      atualizadoPor: extra.atualizadoPor || "Demonstração",
    };
  };

  const STATUS_DA_ACAO = { revisao: "review", publicar: "published", agendar: "scheduled", despublicar: "draft", arquivar: "archived" };

  return {
    demonstracao: true,
    async listar() { return local.list().map(registroDe); },
    async salvar(post, acao, { quando = null, registrar = true, resumo = "" } = {}) {
      const atual = local.list().find((item) => item.id === post.id);
      const statusAtual = atual ? (meta.get(post.id)?.status || atual.status) : "draft";
      const agora = new Date().toISOString();
      const extra = { ...(meta.get(post.id) || {}), atualizadoEm: agora, atualizadoPor: "Demonstração" };
      let salvo;
      if (acao === "pendente" && ["published", "scheduled"].includes(statusAtual)) {
        extra.pendente = normalizePost(post);
        extra.pendenteEm = agora;
        salvo = atual;
      } else {
        if (acao === "agendar" && !(quando && new Date(quando) > new Date())) {
          throw new BlogRemotoError("agendar", { message: "Escolha uma data e um horário no futuro para agendar." });
        }
        const status = STATUS_DA_ACAO[acao] || (statusAtual === "review" ? "review" : "draft");
        salvo = local.save({ ...post, status, updatedAt: agora });
        extra.status = status;
        extra.pendente = null;
        extra.pendenteEm = null;
        extra.publicarEm = status === "scheduled" ? new Date(quando).toISOString() : status === "published" ? (extra.publicarEm || agora) : null;
      }
      meta.set(post.id, extra);
      if (registrar) {
        versoes.set(post.id, [{ id: Date.now(), em: agora, acao, status: extra.status || statusAtual, titulo: post.title, autor: "Demonstração", resumo, documento: normalizePost(post) }, ...(versoes.get(post.id) || [])]);
      }
      return registroDe(salvo);
    },
    async remover(id) { local.remove(id); meta.delete(id); },
    async versoes(id) { return versoes.get(id) || []; },
    async listarCategorias() { return [...categorias].sort((a, b) => a.ordem - b.ordem); },
    async criarCategoria({ rotulo }) {
      const categoria = { id: slugifyBlogTitle(rotulo), rotulo: String(rotulo).trim().toLocaleLowerCase("pt-BR"), ordem: categorias.length + 1, imagem: "" };
      if (categorias.some(({ id }) => id === categoria.id)) throw new BlogRemotoError("criar a categoria", { message: "Já existe uma categoria com esse nome." });
      categorias = [...categorias, categoria];
      return categoria;
    },
    async atualizarCategoria(id, campos) { categorias = categorias.map((item) => (item.id === id ? { ...item, ...campos } : item)); },
    async removerCategoria(id) {
      if (local.list().some((post) => post.category === id)) {
        throw new BlogRemotoError("apagar a categoria", { message: "Esta categoria ainda tem textos. Mude a categoria deles antes de apagar." });
      }
      categorias = categorias.filter((item) => item.id !== id);
    },
    async listarMidia() { return []; },
    async enviarImagem() { throw new BlogRemotoError("enviar a imagem", { message: "Na demonstração o envio de imagens fica desligado. Escolha uma foto do site." }); },
    lerConfiguracao: async () => lerConfiguracao(),
    salvarConfiguracao: async (configuracao) => salvarConfiguracao(configuracao),
    leituras: async () => ({}),
    comentarios: async () => [],
    moderar: async () => {},
    inscritos: async () => 0,
    reset: async () => { meta.clear(); versoes.clear(); return local.reset(); },
  };
}
