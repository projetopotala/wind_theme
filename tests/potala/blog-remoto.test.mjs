import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { DEFAULT_BLOG_POSTS } from "../../outputs/js/blog/blog-data.js";
import { criarBlogAdministrativo, criarBlogDeDemonstracao, criarBlogPublico, criarRestSemBanco, quandoFoi, querAcervoLocal } from "../../outputs/js/blog/blog-remoto.js";
import { createBlogRepository } from "../../outputs/js/blog/blog-repository.js";
import { criarRestPublico } from "../../outputs/js/supabase/rest.js";
import { enviarInteresse, montarInteresse } from "../../outputs/js/shared/participacao.js";
import { carregarDadosDaMesa } from "../../outputs/js/blog-admin/blog-desk.js";

function restFalso(respostas = {}) {
  const pedidos = [];
  const responder = (tipo, nome, corpo) => {
    pedidos.push({ tipo, nome, corpo });
    const resposta = respostas[`${tipo}:${nome}`];
    if (resposta instanceof Error) throw resposta;
    return typeof resposta === "function" ? resposta(corpo) : resposta ?? null;
  };
  return {
    pedidos,
    ler: async (tabela, parametros) => responder("ler", tabela, parametros),
    inserir: async (tabela, linha) => responder("inserir", tabela, linha),
    rpc: async (nome, argumentos) => responder("rpc", nome, argumentos),
  };
}

/*
 * Quem decide o que o visitante vê é a política do banco (publicado, ou
 * agendado cuja hora chegou). A página não filtra por status: um agendado que
 * chega é um texto que já está no ar.
 */
test("a página pública mostra o que o banco libera, inclusive o agendado que chegou", async () => {
  const rest = restFalso({ "ler:blog_posts": [
    { document: { id: "a", title: "Do banco", status: "published" }, status: "published" },
    { document: { id: "b", title: "Agendado que chegou", status: "scheduled" }, status: "scheduled", publish_at: "2026-09-01T13:00:00Z" },
  ] });
  const blog = criarBlogPublico({ rest, reserva: DEFAULT_BLOG_POSTS });
  const posts = await blog.listarPublicados();
  assert.deepEqual(posts.map((post) => post.title), ["Do banco", "Agendado que chegou"]);
  assert.ok(posts.every((post) => post.status === "published"));
  assert.equal(rest.pedidos[0].corpo.status, undefined);
  assert.doesNotMatch(rest.pedidos[0].corpo.select, /pending_document/);
});

test("as categorias vêm do banco, na ordem da mesa, e caem na lista empacotada se a leitura falhar", async () => {
  const doBanco = criarBlogPublico({ rest: restFalso({ "ler:blog_categories": [{ id: "meditacao", rotulo: "meditação", ordem: 1, imagem: "media/x.webp" }] }) });
  assert.deepEqual(await doBanco.listarCategorias(), [{ id: "meditacao", rotulo: "meditação", ordem: 1, imagem: "media/x.webp" }]);
  const falhas = [];
  const semBanco = criarBlogPublico({ rest: restFalso({ "ler:blog_categories": new Error("offline") }), aoFalhar: (erro) => falhas.push(erro) });
  const reserva = await semBanco.listarCategorias();
  assert.ok(reserva.some(({ id }) => id === "oraculos"));
  assert.ok(!reserva.some(({ id }) => id === "todos"), "tudo é filtro, não categoria");
  assert.equal(falhas.length, 1);
});

test("se a leitura falhar, a página mostra o acervo empacotado e avisa quem depura", async () => {
  const falhas = [];
  const rest = restFalso({ "ler:blog_posts": new Error("offline"), "ler:blog_settings": new Error("offline") });
  const blog = criarBlogPublico({ rest, reserva: DEFAULT_BLOG_POSTS, aoFalhar: (erro) => falhas.push(erro) });
  assert.equal((await blog.listarPublicados()).length, DEFAULT_BLOG_POSTS.length);
  assert.equal((await blog.lerConfiguracao()).name, "Caderno de Travessia");
  assert.equal(falhas.length, 2);
});

test("comentário é validado antes de sair e vai sem status: quem aprova é a equipe", async () => {
  const rest = restFalso();
  const blog = criarBlogPublico({ rest });
  await assert.rejects(blog.enviarComentario({ nome: "", texto: "gostei muito" }), /chamada ou chamado/);
  await assert.rejects(blog.enviarComentario({ nome: "Ana", texto: "x".repeat(601) }), /600/);
  await blog.enviarComentario({ slug: "oraculo-de-hoje", nome: " Ana ", texto: " gostei muito " });
  const envio = rest.pedidos.at(-1);
  assert.equal(envio.nome, "blog_comments");
  assert.deepEqual(envio.corpo, { post_slug: "oraculo-de-hoje", author_name: "Ana", body: "gostei muito" });
});

test("a conversa geral pede comentários aprovados sem artigo; a do artigo, os do artigo", async () => {
  const rest = restFalso({ "ler:blog_comments": [{ id: "1", post_slug: null, author_name: "Bia", body: "Oi, tudo", created_at: "2026-09-17T10:00:00Z" }] });
  const blog = criarBlogPublico({ rest });
  const [comentario] = await blog.listarComentarios(null);
  assert.equal(comentario.nome, "Bia");
  assert.equal(rest.pedidos[0].corpo.post_slug, "is.null");
  assert.equal(rest.pedidos[0].corpo.status, "eq.approved");
  await blog.listarComentarios("borra-de-cafe");
  assert.equal(rest.pedidos[1].corpo.post_slug, "eq.borra-de-cafe");
});

test("contar leitura nunca quebra a página", async () => {
  const falhas = [];
  const blog = criarBlogPublico({
    rest: restFalso({ "rpc:register_blog_view": new Error("offline") }),
    aoFalhar: (erro, contexto) => falhas.push({ erro, contexto }),
  });
  await blog.registrarLeitura("x");
  assert.equal(falhas.length, 1);
  assert.equal(falhas[0].contexto, "blog.registrarLeitura");
  assert.match(falhas[0].erro.message, /offline/);
});

test("a mesa real salva pela função do banco e traduz a recusa", async () => {
  const chamadas = [];
  const client = {
    rpc: async (nome, args) => {
      chamadas.push([nome, args]);
      return { data: null, error: { code: "42501", message: "permission denied" } };
    },
    from: () => ({}),
  };
  const blog = criarBlogAdministrativo({ client });
  await assert.rejects(blog.salvar({ id: "p", title: "Texto" }, "rascunho"), /não permite alterar o Blog/);
  const [nome, args] = chamadas[0];
  assert.equal(nome, "mesa_salvar_post");
  assert.equal(args.p_post.slug, "texto");
  assert.equal(args.p_acao, "rascunho");
  assert.equal(args.p_quando, null);
  assert.equal(args.p_registrar, true);
});

test("o agendamento vai ao banco como instante, e o registro separa o que está no ar do que está pendente", async () => {
  const chamadas = [];
  const client = {
    rpc: async (nome, args) => {
      chamadas.push(args);
      return { data: { document: { ...args.p_post, status: "published" }, pending_document: { ...args.p_post, title: "Mudança" }, status: "published", publish_at: "2026-09-10T13:00:00Z", updated_by_name: "Ana" }, error: null };
    },
    from: () => ({}),
  };
  const blog = criarBlogAdministrativo({ client });
  const registro = await blog.salvar({ id: "p", title: "No ar" }, "agendar", { quando: new Date("2026-09-22T13:00:00Z"), registrar: false, resumo: "Mudou título" });
  assert.equal(chamadas[0].p_quando, "2026-09-22T13:00:00.000Z");
  assert.equal(chamadas[0].p_registrar, false);
  assert.equal(chamadas[0].p_resumo, "Mudou título");
  assert.equal(registro.post.title, "No ar");
  assert.equal(registro.pendente.title, "Mudança");
  assert.equal(registro.atualizadoPor, "Ana");
});

test("a mesa identifica leituras parciais indisponíveis em vez de fingir zero", async () => {
  const repositorio = {
    listar: async () => [{ id: "p", post: { id: "p", slug: "texto", title: "Texto" }, status: "draft" }],
    lerConfiguracao: async () => ({ name: "Caderno", cover: "capa.webp" }),
    listarCategorias: async () => { throw new Error("categorias offline"); },
    leituras: async () => { throw new Error("views offline"); },
    comentarios: async () => [],
    inscritos: async () => { throw new Error("newsletter offline"); },
  };

  const dados = await carregarDadosDaMesa(repositorio);

  assert.equal(dados.registros.length, 1);
  assert.deepEqual(dados.leituras, {});
  assert.equal(dados.inscritos, 0);
  assert.ok(dados.categorias.some(({ id }) => id === "artigos"), "sem o banco, as categorias empacotadas seguram o menu");
  assert.deepEqual(dados.falhas.map((falha) => falha.contexto), ["blog.categorias", "blog.leituras", "blog.inscritos"]);
});

test("sem os textos a mesa não abre fingindo estar vazia", async () => {
  const repositorio = {
    listar: async () => { throw new Error("sem conexão"); },
    lerConfiguracao: async () => ({}), listarCategorias: async () => [], leituras: async () => ({}), comentarios: async () => [], inscritos: async () => 0,
  };
  await assert.rejects(carregarDadosDaMesa(repositorio), /sem conexão/);
});

function demonstracao() {
  const armazenamento = new Map();
  const storage = { getItem: (k) => armazenamento.get(k) ?? null, setItem: (k, v) => armazenamento.set(k, v), removeItem: (k) => armazenamento.delete(k) };
  return criarBlogDeDemonstracao({ local: createBlogRepository({ storage, defaults: DEFAULT_BLOG_POSTS }), lerConfiguracao: () => ({}), salvarConfiguracao: (c) => c });
}

test("a demonstração continua no navegador e não mede nada", async () => {
  const demo = demonstracao();
  assert.equal(demo.demonstracao, true);
  assert.equal((await demo.listar()).length, DEFAULT_BLOG_POSTS.length);
  assert.deepEqual(await demo.leituras(), {});
  assert.equal(await demo.inscritos(), 0);
  await assert.rejects(demo.enviarImagem({ type: "image/png", size: 10 }), /demonstração/);
});

test("a demonstração segue as regras de status do banco", async () => {
  const demo = demonstracao();
  const [publicado] = await demo.listar();
  const pendente = await demo.salvar({ ...publicado.post, title: "Ainda mexendo" }, "pendente", { registrar: false });
  assert.equal(pendente.status, "published");
  assert.equal(pendente.post.title, publicado.post.title, "o leitor continua vendo o texto no ar");
  assert.equal(pendente.pendente.title, "Ainda mexendo");
  await assert.rejects(demo.salvar({ id: "novo", title: "Novo" }, "agendar", { quando: new Date(Date.now() - 60000) }), /futuro/);
  const agendado = await demo.salvar({ id: "novo", title: "Novo" }, "agendar", { quando: new Date(Date.now() + 86400000) });
  assert.equal(agendado.status, "scheduled");
  assert.ok(agendado.publicarEm);
  assert.equal((await demo.versoes("novo")).length, 1);
  await assert.rejects(demo.removerCategoria(publicado.post.category), /ainda tem textos/);
});

test("o tempo relativo fala como a conversa sempre falou", () => {
  const agora = Date.parse("2026-09-17T12:00:00Z");
  assert.equal(quandoFoi("2026-09-17T11:59:30Z", agora), "agora");
  assert.equal(quandoFoi("2026-09-17T09:00:00Z", agora), "há 3 horas");
  assert.equal(quandoFoi("2026-09-16T11:00:00Z", agora), "ontem");
  assert.equal(quandoFoi("2026-09-13T12:00:00Z", agora), "há 4 dias");
});

test("o REST público manda só a chave publicável e expõe a mensagem do banco", async () => {
  const pedidos = [];
  const fetchImpl = async (url, opcoes) => {
    pedidos.push({ url, opcoes });
    if (url.includes("blog_comments")) return { ok: false, status: 400, json: async () => ({ code: "23514", message: "violates check constraint" }) };
    return { ok: true, status: 200, text: async () => "[]" };
  };
  const rest = criarRestPublico({ config: { url: "https://x.supabase.co", publishableKey: "sb_publishable_abc" }, fetchImpl });
  await rest.ler("blog_posts", { select: "document", status: "eq.published" });
  assert.equal(pedidos[0].url, "https://x.supabase.co/rest/v1/blog_posts?select=document&status=eq.published");
  assert.deepEqual(pedidos[0].opcoes.headers, { apikey: "sb_publishable_abc" });
  await assert.rejects(rest.inserir("blog_comments", {}), (erro) => erro.code === "23514" && erro.status === 400);
  assert.equal(pedidos[1].opcoes.headers.Prefer, "return=minimal", "o visitante não precisa ler de volta o que enviou");
});

test("interesse enviado pelas seções tem tipo conhecido e tamanho contido", async () => {
  assert.throws(() => montarInteresse({ kind: "qualquer" }), /desconhecido/);
  const linha = montarInteresse({ kind: "curso", subject: "x".repeat(300), details: [], page: "/cursos.html" });
  assert.equal(linha.subject.length, 160);
  assert.deepEqual(linha.details, {});
  const rest = restFalso();
  await enviarInteresse({ kind: "retorno-recepcao", subject: "Em parte", details: { answer: "partial" }, page: "/recepcao.html" }, { rest });
  assert.equal(rest.pedidos[0].nome, "site_interests");
});

test("as páginas não prometem mais que o envio é local", async () => {
  const ler = (arquivo) => readFile(new URL(`../../outputs/${arquivo}`, import.meta.url), "utf8");
  const [blog, artigo, cursos, cultura, recepcao, controlador] = await Promise.all([
    ler("blog.html"), ler("artigo.html"), ler("cursos.html"), ler("experiencias-culturais.html"), ler("recepcao.html"), ler("js/blog/blog-controller.js"),
  ]);
  for (const html of [blog, artigo, cursos, cultura]) {
    assert.doesNotMatch(html, /ainda não é gravado|nesta aba|não são enviadas ao Instituto|Nenhum dado é enviado/);
  }
  assert.doesNotMatch(controlador, /Demonstração local/);
  assert.match(recepcao, /<script type="module" src="js\/recepcao\.js"><\/script>/);
  assert.match(cursos, /name="contact"/);
});

test("o acervo local liga pela URL, vale na aba e nunca toca o banco", async () => {
  const guardado = new Map();
  const sessao = { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v), removeItem: (k) => guardado.delete(k) };
  assert.equal(querAcervoLocal({ search: "" }, sessao), false);
  assert.equal(querAcervoLocal({ search: "?acervo=local" }, sessao), true);
  assert.equal(querAcervoLocal({ search: "?post=x" }, sessao), true, "o artigo herda o modo da aba");
  assert.equal(querAcervoLocal({ search: "?acervo=banco" }, sessao), false);

  const blog = criarBlogPublico({ rest: criarRestSemBanco(), reserva: DEFAULT_BLOG_POSTS });
  assert.equal((await blog.listarPublicados()).length, DEFAULT_BLOG_POSTS.length);
  await assert.rejects(blog.enviarComentario({ nome: "Ana", texto: "gostei muito" }), /acervo local/);
});
