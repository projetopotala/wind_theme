import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { DEFAULT_BLOG_POSTS } from "../../outputs/js/blog/blog-data.js";
import { criarBlogAdministrativo, criarBlogDeDemonstracao, criarBlogPublico, quandoFoi } from "../../outputs/js/blog/blog-remoto.js";
import { createBlogRepository } from "../../outputs/js/blog/blog-repository.js";
import { criarRestPublico } from "../../outputs/js/supabase/rest.js";
import { enviarInteresse, montarInteresse } from "../../outputs/js/shared/participacao.js";

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

test("a página pública lê só publicados do banco", async () => {
  const rest = restFalso({ "ler:blog_posts": [{ document: { id: "a", title: "Do banco", status: "published" } }] });
  const blog = criarBlogPublico({ rest, reserva: DEFAULT_BLOG_POSTS });
  const posts = await blog.listarPublicados();
  assert.deepEqual(posts.map((post) => post.title), ["Do banco"]);
  assert.equal(rest.pedidos[0].corpo.status, "eq.published");
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
  const blog = criarBlogPublico({ rest: restFalso({ "rpc:register_blog_view": new Error("offline") }) });
  await blog.registrarLeitura("x");
});

test("a mesa real salva pelo banco e traduz a recusa", async () => {
  const chamadas = [];
  const client = {
    rpc: async (nome, args) => {
      chamadas.push([nome, args]);
      return { data: null, error: { code: "42501", message: "permission denied" } };
    },
    from: () => ({}),
  };
  const blog = criarBlogAdministrativo({ client });
  await assert.rejects(blog.save({ id: "p", title: "Texto" }), /não permite alterar o Blog/);
  assert.equal(chamadas[0][0], "save_blog_post");
  assert.equal(chamadas[0][1].post.slug, "texto");
});

test("a demonstração continua no navegador e não mede nada", async () => {
  const armazenamento = new Map();
  const storage = { getItem: (k) => armazenamento.get(k) ?? null, setItem: (k, v) => armazenamento.set(k, v), removeItem: (k) => armazenamento.delete(k) };
  const demo = criarBlogDeDemonstracao({ local: createBlogRepository({ storage, defaults: DEFAULT_BLOG_POSTS }), lerConfiguracao: () => ({}), salvarConfiguracao: (c) => c });
  assert.equal(demo.demonstracao, true);
  assert.equal((await demo.list()).length, DEFAULT_BLOG_POSTS.length);
  assert.deepEqual(await demo.leituras(), {});
  assert.equal(await demo.inscritos(), 0);
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
