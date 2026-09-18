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
import { normalizePost, normalizePosts } from "./blog-model.js";

export const BLOG_PADRAO = Object.freeze({ name: "Caderno de Travessia", cover: "media/chegada-landscape.webp" });

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

export function criarBlogPublico({ rest, reserva = [], aoFalhar = () => {} } = {}) {
  if (!rest?.ler) throw new TypeError("O acesso ao banco é obrigatório.");
  const acervo = normalizePosts(reserva);

  return {
    async listarPublicados() {
      try {
        const linhas = await rest.ler("blog_posts", { select: "document", status: "eq.published" });
        return normalizePosts((linhas || []).map((linha) => linha.document));
      } catch (erro) {
        aoFalhar(erro);
        return acervo.filter((post) => post.status === "published");
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

class BlogRemotoError extends Error {
  constructor(operacao, causa = {}) {
    const mensagem = causa.code === "42501"
      ? "Seu acesso não permite alterar o Blog."
      : causa.code === "23505" && /slug/.test(`${causa.message} ${causa.details}`)
        ? "Já existe um texto com este endereço. Mude o título."
        : causa.code === "PGRST202" || causa.code === "PGRST205"
          ? "O Blog ainda não foi instalado no banco do Portal."
          : causa.message || `Falha ao ${operacao}.`;
    super(mensagem);
    this.name = "BlogRemotoError";
    this.code = causa.code || "";
    this.cause = causa;
  }
}

const exigir = (operacao, error) => { if (error) throw new BlogRemotoError(operacao, error); };

export function criarBlogAdministrativo({ client } = {}) {
  if (!client?.from || !client?.rpc) throw new TypeError("Um cliente Supabase válido é obrigatório.");

  return {
    async list() {
      const { data, error } = await client.from("blog_posts").select("document").order("published_at", { ascending: false });
      exigir("listar os textos", error);
      return normalizePosts((data || []).map((linha) => linha.document));
    },
    async save(post) {
      const normalizado = normalizePost({ ...post, updatedAt: new Date().toISOString() });
      const { data, error } = await client.rpc("save_blog_post", { post: normalizado });
      exigir("salvar o texto", error);
      return normalizePost(data?.document || normalizado);
    },
    async remove(id) {
      const { error } = await client.from("blog_posts").delete().eq("id", id);
      exigir("excluir o texto", error);
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
 * Mesmo formato assíncrono da versão remota, para a mesa não ter dois caminhos.
 */
export function criarBlogDeDemonstracao({ local, lerConfiguracao, salvarConfiguracao } = {}) {
  return {
    demonstracao: true,
    list: async () => local.list(),
    save: async (post) => local.save(post),
    remove: async (id) => { local.remove(id); },
    lerConfiguracao: async () => lerConfiguracao(),
    salvarConfiguracao: async (configuracao) => salvarConfiguracao(configuracao),
    leituras: async () => ({}),
    comentarios: async () => [],
    moderar: async () => {},
    inscritos: async () => 0,
    reset: async () => local.reset(),
  };
}
