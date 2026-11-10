import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { POSTS } from "../../scripts/dados/blog-acervo-inicial.mjs";
import { ativarVideos, enderecoDoPlayer } from "../../outputs/js/blog/article-video.js";
import { renderArticle, renderArticleBlock } from "../../outputs/js/blog/article-renderer.js";
import { enderecoSeguro, imagemSegura, normalizarVideo, validarDocumento } from "../../outputs/js/blog/blog-conteudo.js";
import { normalizePost, normalizePosts } from "../../outputs/js/blog/blog-model.js";
import { addContentBlock, createBlankPost } from "../../outputs/js/blog-admin/blog-editor.js";

const ler = (caminho) => readFile(new URL(`../../${caminho}`, import.meta.url), "utf8");
const ID = "dQw4w9WgXcQ";

/* ---------------- vídeo: só provedores permitidos, identificador inteiro ---------------- */

test("YouTube e Vimeo viram player a partir do identificador, em qualquer formato de link comum", () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${ID}`, `https://youtube.com/watch?feature=share&v=${ID}`, `https://m.youtube.com/watch?v=${ID}&t=42s`,
    `https://youtu.be/${ID}`, `https://youtu.be/${ID}?si=abc`, `https://www.youtube.com/shorts/${ID}`, `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`, `https://www.youtube.com/live/${ID}`, `youtu.be/${ID}`, `  https://youtu.be/${ID}  `,
  ]) {
    const video = normalizarVideo(url);
    assert.equal(video?.tipo, "youtube", url);
    assert.equal(video.src, `https://www.youtube-nocookie.com/embed/${ID}`);
    assert.equal(video.abrir, `https://www.youtube.com/watch?v=${ID}`);
  }
  assert.equal(normalizarVideo("https://vimeo.com/123456789").src, "https://player.vimeo.com/video/123456789");
  assert.equal(normalizarVideo("https://player.vimeo.com/video/123456789").src, "https://player.vimeo.com/video/123456789");
  assert.equal(normalizarVideo("https://vimeo.com/123456789/abcdef1234").src, "https://player.vimeo.com/video/123456789?h=abcdef1234");
  assert.equal(normalizarVideo("https://player.vimeo.com/video/123456789?h=abcdef1234").src, "https://player.vimeo.com/video/123456789?h=abcdef1234");
});

test("outros provedores, domínios parecidos, identificador incompleto e HTML não viram player", () => {
  for (const url of [
    "", "   ", "https://evil.example/video.mp4", `https://evil.example/?u=youtube.com/watch?v=${ID}`, `https://youtube.com.evil.example/watch?v=${ID}`,
    `https://notyoutube.com/watch?v=${ID}`, `https://user:senha@www.youtube.com/watch?v=${ID}`, `https://user@youtu.be/${ID}`, `https://www.youtube.com/watch?v=${ID}x`,
    "https://www.youtube.com/watch?v=curto", "https://vimeo.com/123", "https://vimeo.com/abc", "https://vimeo.com.evil.example/123456789",
    `javascript:alert(1)//youtube.com/watch?v=${ID}`, `<iframe src="https://www.youtube.com/embed/${ID}"></iframe>`, "https://dailymotion.com/video/x7tgad0",
    `https://www.youtube.com/watch?v=${ID}"onload="alert(1)`, `https://youtu.be/${ID} https://evil.example`, "x".repeat(400),
  ]) {
    assert.equal(normalizarVideo(url), null, JSON.stringify(url).slice(0, 80));
  }
});

test("endereços: só http(s) e caminhos do próprio site; imagens só https ou arquivos do site", () => {
  for (const ok of ["", "https://exemplo.org/a?b=1", "http://exemplo.org", "media/foto.jpg", "/media/foto.jpg", "artigo.html?post=x#topo", "#ancora"]) assert.equal(enderecoSeguro(ok), true, ok);
  for (const ruim of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "data:text/html,<b>", "vbscript:x", "blob:https://x/1", "//evil.example/x", "https://a b", "file:///etc/passwd", "ftp://x/y", "https://x/\"onerror=1"]) {
    assert.equal(enderecoSeguro(ruim), false, ruim);
  }
  for (const ok of ["", "https://x.supabase.co/storage/v1/object/public/blog-midia/a.jpg", "media/blog-caderno/a.jpg", "/media/a.jpg"]) assert.equal(imagemSegura(ok), true, ok);
  for (const ruim of ["http://x/a.jpg", "data:image/svg+xml,<svg onload=alert(1)>", "javascript:alert(1)", "//x/a.jpg", "#a", "https://x/a.jpg\"onerror=1"]) assert.equal(imagemSegura(ruim), false, ruim);
});

/* ---------------- a página pública: nada de HTML do autor, player só no clique ---------------- */

test("o vídeo aparece como botão: nenhum iframe nem endereço de provedor carrega antes do clique", () => {
  const html = renderArticleBlock({ type: "video", url: `https://youtu.be/${ID}`, caption: "Aula aberta" });
  assert.doesNotMatch(html, /<iframe/i);
  assert.match(html, /<button type="button" class="article-video__abrir" data-video-src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ"/);
  assert.match(html, /aria-label="Assistir ao vídeo: Aula aberta\. Carrega o player do YouTube\."/);
  assert.match(html, /<a href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ" target="_blank" rel="noopener noreferrer">Abrir no YouTube<\/a>/);
  assert.match(html, /pode estar privado ou não permitir incorporação/);
  // Nada que o navegador busque sozinho: nem img, nem script, nem iframe, nem link rel.
  assert.doesNotMatch(html, /<(?:img|script|link|video|audio|source)\b/i);
  const vimeo = renderArticleBlock({ type: "video", url: "https://vimeo.com/123456789/abcdef1234" });
  assert.match(vimeo, /data-video-src="https:\/\/player\.vimeo\.com\/video\/123456789\?h=abcdef1234"/);
  assert.match(vimeo, /Abrir no Vimeo/);
});

test("vídeo de provedor não permitido ou endereço perigoso nunca vira iframe nem href executável", () => {
  const ataques = ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "//evil.example/x", `<iframe src="https://evil.example"></iframe>`, "\"><script>alert(1)</script>"];
  for (const url of ataques) {
    const html = renderArticleBlock({ type: "video", url });
    assert.doesNotMatch(html, /<iframe|<script|javascript:|data:text/i, url);
    assert.doesNotMatch(html, /href="(?!https?:\/\/)/i, url);
  }
  // Link http(s) de outro provedor: só um link comum, nunca player.
  const comum = renderArticleBlock({ type: "video", url: "https://exemplo.org/video" });
  assert.match(comum, /<a href="https:\/\/exemplo\.org\/video" rel="noopener noreferrer">Assistir ao vídeo<\/a>/);
  assert.doesNotMatch(comum, /<iframe/);
});

test("HTML colado, links e imagens maliciosos viram texto inofensivo no artigo", () => {
  const post = {
    id: "x", slug: "x", title: "<img src=x onerror=alert(1)>", subtitle: "<script>alert(1)</script>", excerpt: "r", category: "artigos", status: "published",
    cover: "javascript:alert(1)", coverAlt: "\"><script>1</script>",
    content: [
      { id: "a", type: "paragraph", text: "<script>alert(1)</script> [clique](javascript:alert(1)) [outro](data:text/html,x) **negrito** [bom](https://exemplo.org)" },
      { id: "b", type: "image", src: "javascript:alert(1)", alt: "a" },
      { id: "c", type: "image", src: "https://exemplo.org/a.jpg\" onerror=\"alert(1)", alt: "\" onerror=\"alert(2)" },
      { id: "d", type: "gallery", images: [{ src: "data:image/svg+xml,<svg onload=alert(1)>", alt: "" }, { src: "media/ok.jpg", alt: "ok" }] },
      { id: "e", type: "list", items: ["<b onclick=alert(1)>x</b>", "[l](vbscript:x)"] },
      { id: "f", type: "quote", text: "<iframe src=//evil></iframe>", cite: "<svg onload=alert(1)>" },
    ],
  };
  const html = renderArticle(post);
  assert.doesNotMatch(html, /<script|<iframe|<svg|<b onclick|<img src=x/i);
  assert.doesNotMatch(html, /href="(?:javascript|data|vbscript):/i);
  assert.doesNotMatch(html, /src="(?:javascript|data):/i);
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i, "nenhuma tag real com atributo de evento (o que sobra é texto escapado)");
  assert.match(html, /<strong>negrito<\/strong>/);
  assert.match(html, /<a href="https:\/\/exemplo\.org">bom<\/a>/);
  assert.match(html, /<img src="media\/ok\.jpg" alt="ok"/, "a foto segura continua");
});

test("ativarVideos: o clique cria o iframe do player já em reprodução, só para os dois players permitidos", () => {
  assert.equal(enderecoDoPlayer(`https://www.youtube-nocookie.com/embed/${ID}`), `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`);
  assert.equal(enderecoDoPlayer("https://player.vimeo.com/video/123456789?h=abcdef1234"), "https://player.vimeo.com/video/123456789?h=abcdef1234&autoplay=1");
  for (const ruim of ["https://evil.example/embed/x", "javascript:alert(1)", `https://www.youtube.com/embed/${ID}`, `https://www.youtube-nocookie.com.evil.example/embed/${ID}`, ""]) assert.equal(enderecoDoPlayer(ruim), "", ruim);

  let ouvinte = null;
  const criados = [];
  const quadro = { dataset: {}, filhos: [], replaceChildren(...itens) { this.filhos = itens; } };
  const botao = { dataset: { videoSrc: `https://www.youtube-nocookie.com/embed/${ID}`, videoTitulo: "Aula" }, closest: (seletor) => (seletor === "[data-video-quadro]" ? quadro : botao) };
  const raiz = { addEventListener: (_, funcao) => { ouvinte = funcao; }, contains: () => true };
  const documento = { createElement: (tag) => { const el = { tag, focado: false, focus() { this.focado = true; } }; criados.push(el); return el; } };
  ativarVideos(raiz, documento);
  ouvinte({ target: { closest: () => botao } });
  assert.equal(criados.length, 1);
  assert.equal(criados[0].tag, "iframe");
  assert.equal(criados[0].src, `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`);
  assert.equal(criados[0].title, "Aula");
  assert.equal(criados[0].focado, true, "o foco vai para o player: o teclado continua dentro do vídeo");
  assert.deepEqual(quadro.filhos, criados);
  // Um botão adulterado com outro endereço não cria nada.
  botao.dataset.videoSrc = "https://evil.example/x";
  ouvinte({ target: { closest: () => botao } });
  assert.equal(criados.length, 1);
});

test("o CSS do vídeo: botão com foco visível, aviso que quebra linha e alvo de toque do link", async () => {
  const css = await ler("outputs/css/artigo.css");
  assert.match(css, /\.article-video__abrir:focus-visible \{ outline: 3px solid/);
  assert.match(css, /\.article-video__abrir \{[^}]*min-height: 44px/);
  assert.match(css, /\.article-video__aviso \{[^}]*overflow-wrap: anywhere/);
  assert.match(css, /@media \(pointer: coarse\) \{ \.article-video__aviso a/);
  assert.match(css, /\.article-list li \{ padding-left: 0; color: inherit; font-size: inherit; line-height: inherit; \}/, "o texto da lista herda a cor do artigo");
  assert.match(css, /\.article-list li::before \{ position: static; width: auto; height: auto; background: none; \}/, "o marcador não herda a barra de 9x1px das seções claras");
  assert.match(css, /\.article-list strong \{ color: var\(--cad-marfim\); \}/, "o negrito da lista fica legível");
  assert.match(css, /\.article-content \{ overflow-wrap: anywhere; \}/, "endereço comprido quebra em vez de ser cortado");
});

/* ---------------- artigos antigos: nada muda ---------------- */

test("os artigos do acervo atual passam na validação de publicação e renderizam sem player nem perda", () => {
  assert.ok(POSTS.length >= 20);
  for (const post of normalizePosts(POSTS)) {
    assert.deepEqual(validarDocumento(post, { publicacao: true }), [], post.slug);
    const html = renderArticle(post);
    assert.ok(html.includes(post.title.replace(/&/g, "&amp;")) || html.length > 200, post.slug);
    assert.doesNotMatch(html, /<iframe|data-video-src/);
    for (const bloco of post.content.filter((item) => item.type === "paragraph" || item.type === "quote")) {
      assert.ok(renderArticleBlock(bloco).length > 0, `${post.slug}/${bloco.id}`);
    }
  }
});

test("texto com vídeo, imagem, lista e link sobrevive a salvar e reabrir (JSON do banco)", () => {
  let post = createBlankPost("2026-11-10T12:00:00.000Z");
  for (const tipo of ["heading", "paragraph", "image", "video", "list", "quote"]) post = addContentBlock(post, tipo);
  post = {
    ...post, title: "Sintético B1", subtitle: "sub", excerpt: "resumo",
    content: post.content.map((bloco) => ({
      heading: { ...bloco, text: "Parte um", level: 3 },
      paragraph: { ...bloco, text: "Texto com **negrito**, *itálico* e [link](https://exemplo.org/a?b=1)." },
      image: { ...bloco, src: "media/blog-caderno/exemplo.jpg", alt: "Descrição", caption: "Legenda", width: "full" },
      video: { ...bloco, url: `https://youtu.be/${ID}`, caption: "Vídeo sintético" },
      list: { ...bloco, items: ["um", "dois **fortes**"], ordered: true },
      quote: { ...bloco, text: "Frase", cite: "Autora" },
    })[bloco.type]),
  };
  const gravado = JSON.parse(JSON.stringify(normalizePost(post)));
  const reaberto = normalizePost(gravado);
  assert.deepEqual(reaberto.content, normalizePost(post).content);
  assert.deepEqual(validarDocumento(reaberto, { publicacao: true }), []);
  assert.equal(renderArticle(reaberto), renderArticle(normalizePost(post)));
  const html = renderArticle(reaberto);
  assert.match(html, /<h3 class="article-subheading">Parte um<\/h3>/);
  assert.match(html, /<ol class="article-list article-list--numerada"><li>um<\/li><li>dois <strong>fortes<\/strong><\/li><\/ol>/);
  assert.match(html, /data-video-src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ"/);
});

/* ---------------- o editor ---------------- */

test("o editor valida antes de publicar ou agendar, e o Escritor continua só enviando para revisão", async () => {
  const editor = await ler("outputs/js/blog-admin/blog-editor.js");
  assert.match(editor, /import \{ validarDocumento \} from "\.\.\/blog\/blog-conteudo\.js";/);
  assert.match(editor, /if \(acao === "publicar" \|\| acao === "agendar"\) \{\s*const problemas = validarDocumento\(documento, \{ publicacao: true \}\);/);
  assert.match(editor, /Escritor: so envia para revisao/);
  const blocos = await ler("outputs/js/blog-admin/mesa-blocos.js");
  assert.match(blocos, /Endereço não reconhecido\. Use um link do YouTube ou do Vimeo\./);
  const html = await ler("outputs/js/blog/article-controller.js");
  assert.match(html, /ativarVideos\(target\);/);
});

/* ---------------- o banco (migration preparada) roda aqui, em PGlite, e concorda com o JavaScript ---------------- */

async function bancoDeTeste() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema if not exists public;
    create table public.blog_posts (id text primary key, slug text, status text not null default 'draft', document jsonb not null, pending_document jsonb, views int not null default 0);
  `);
  await db.exec(await ler("supabase/migrations/202611100001_blog_validacao_de_conteudo.sql"));
  return db;
}

const bloco = (extra) => ({ id: "b", type: "paragraph", text: "x", ...extra });
const doc = (...blocos) => ({ id: "p", slug: "p", title: "t", content: blocos });
const VEIOS_DO_MODELO = {
  aceitos: [
    {}, { content: [] }, { content: null }, doc(bloco()), doc(bloco({ text: "[a](https://exemplo.org/x?y=1) **b** *c* [rel](artigo.html?post=z)" })),
    doc({ id: "i", type: "image", src: "media/a.jpg", alt: "a", caption: "c" }), doc({ id: "i", type: "image", src: "https://x.supabase.co/a.jpg" }),
    { cover: "media/capa.jpg", content: [] }, { cover: "", content: [] },
    doc({ id: "g", type: "gallery", images: [{ src: "media/a.jpg", alt: "" }, { src: "https://x.org/b.jpg", alt: "b" }] }),
    doc({ id: "l", type: "list", items: ["a", "b **c**"] }), doc({ id: "d", type: "divider" }),
    doc({ id: "q", type: "quote", text: "q", cite: "autora" }), doc({ id: "c", type: "callout", text: "n", tone: "dica" }),
    doc({ id: "v", type: "video", url: "" }), doc({ id: "v", type: "video", url: `https://youtu.be/${ID}` }),
    doc({ id: "v", type: "video", url: `https://www.youtube.com/watch?v=${ID}&t=3` }), doc({ id: "v", type: "video", url: "https://vimeo.com/123456789/abcdef1234" }),
    doc({ id: "v", type: "video", url: "https://player.vimeo.com/video/123456789?h=abcdef1234" }),
  ],
  recusados: [
    [], "texto", 7, { content: {} }, { content: "x" }, { content: Array.from({ length: 301 }, (_, i) => bloco({ id: `b${i}` })) },
    doc(bloco({ type: "script" })), doc(bloco({ type: undefined })), doc("texto"), doc(null),
    doc(bloco({ text: "<script>alert(1)</script>" })), doc(bloco({ text: "a <IFRAME src=x> b" })), doc(bloco({ caption: "<svg onload=1>" })), doc(bloco({ text: "x".repeat(20001) })),
    doc(bloco({ text: "[x](javascript:alert(1))" })), doc(bloco({ text: "[x](JaVaScRiPt:alert(1))" })), doc(bloco({ text: "[x](data:text/html,a)" })), doc(bloco({ text: "[x](//evil.example)" })),
    doc(bloco({ text: 7 })), doc(bloco({ cite: { a: 1 } })),
    { cover: "javascript:alert(1)", content: [] }, { cover: "data:image/svg+xml,<svg>", content: [] }, { cover: "http://x/a.jpg", content: [] }, { cover: 7, content: [] },
    doc({ id: "i", type: "image", src: "javascript:alert(1)" }), doc({ id: "i", type: "image", src: "http://x/a.jpg" }), doc({ id: "i", type: "image", src: "data:image/png;base64,AA" }), doc({ id: "i", type: "image", src: 5 }),
    doc({ id: "g", type: "gallery", images: Array.from({ length: 13 }, () => ({ src: "media/a.jpg" })) }), doc({ id: "g", type: "gallery", images: [{ src: "javascript:1" }] }), doc({ id: "g", type: "gallery", images: "x" }),
    doc({ id: "l", type: "list", items: Array.from({ length: 41 }, () => "a") }), doc({ id: "l", type: "list", items: ["<script>1</script>"] }), doc({ id: "l", type: "list", items: ["[a](vbscript:x)"] }),
    doc({ id: "v", type: "video", url: "javascript:alert(1)" }), doc({ id: "v", type: "video", url: "data:text/html,x" }), doc({ id: "v", type: "video", url: "//evil.example/v" }), doc({ id: "v", type: "video", url: 9 }),
  ],
  // Passam como rascunho (endereço http(s) comum, o editor avisa) e são recusados na publicação.
  so_no_rascunho: [
    doc({ id: "v", type: "video", url: "https://evil.example/video.mp4" }), doc({ id: "v", type: "video", url: `https://youtube.com.evil.example/watch?v=${ID}` }),
    doc({ id: "v", type: "video", url: `https://user@youtube.com/watch?v=${ID}` }), doc({ id: "v", type: "video", url: "https://www.youtube.com/watch?v=curto" }),
    doc({ id: "v", type: "video", url: "https://vimeo.com/123" }), doc({ id: "v", type: "video", url: "https://dailymotion.com/video/x7tgad0" }), doc({ id: "v", type: "video", url: `https://www.youtube.com/watch?v=${ID}x` }),
  ],
};

test("migration: o JavaScript e o SQL decidem igual (aceitar, recusar e a mensagem) para os mesmos casos", async () => {
  const db = await bancoDeTeste();
  const pergunta = async (documento, publicacao) => (await db.query("select public.blog_documento_problema($1::jsonb, $2) as problema", [JSON.stringify(documento ?? null), publicacao])).rows[0].problema;
  for (const publicacao of [false, true]) {
    for (const documento of [...VEIOS_DO_MODELO.aceitos, ...VEIOS_DO_MODELO.recusados, ...VEIOS_DO_MODELO.so_no_rascunho]) {
      const js = validarDocumento(documento, { publicacao });
      const sql = await pergunta(documento, publicacao);
      const rotulo = `${publicacao ? "publicação" : "rascunho"}: ${JSON.stringify(documento).slice(0, 110)}`;
      assert.equal(sql === null, js.length === 0, `${rotulo} → JS ${JSON.stringify(js)} / SQL ${JSON.stringify(sql)}`);
      if (js.length) assert.equal(sql, js[0], rotulo);
    }
  }
  for (const documento of VEIOS_DO_MODELO.aceitos) assert.deepEqual(validarDocumento(documento, { publicacao: true }), [], JSON.stringify(documento).slice(0, 90));
  for (const documento of VEIOS_DO_MODELO.recusados) assert.notDeepEqual(validarDocumento(documento, { publicacao: false }), [], JSON.stringify(documento).slice(0, 90));
  for (const documento of VEIOS_DO_MODELO.so_no_rascunho) {
    assert.deepEqual(validarDocumento(documento, { publicacao: false }), []);
    assert.notDeepEqual(validarDocumento(documento, { publicacao: true }), []);
  }
  await db.close();
});

test("migration: o gatilho barra gravação perigosa em qualquer status e libera artigos legítimos", async () => {
  const db = await bancoDeTeste();
  const grava = (id, status, documento, pendente = null) => db.query(
    "insert into public.blog_posts (id, slug, status, document, pending_document) values ($1, $1, $2, $3::jsonb, $4::jsonb)",
    [id, status, JSON.stringify(documento), pendente ? JSON.stringify(pendente) : null],
  );
  const recusa = async (promessa, trecho) => assert.rejects(promessa, (erro) => erro.message.includes(trecho), trecho);

  // Artigos do acervo atual entram como publicados.
  for (const post of normalizePosts(POSTS).slice(0, 5)) await grava(`legado-${post.id}`, "published", post);
  // Vídeo válido, imagem e lista: aceito publicado.
  await grava("ok", "published", doc({ id: "v", type: "video", url: `https://youtu.be/${ID}` }, { id: "i", type: "image", src: "media/a.jpg", alt: "a" }));
  // Rascunho com vídeo ainda não reconhecido: aceito. Publicar o mesmo texto: recusado.
  await grava("rascunho", "draft", doc({ id: "v", type: "video", url: "https://exemplo.org/video" }));
  await recusa(db.query("update public.blog_posts set status = 'published' where id = 'rascunho'"), "YouTube ou do Vimeo");
  await recusa(db.query("update public.blog_posts set status = 'scheduled' where id = 'rascunho'"), "YouTube ou do Vimeo");
  assert.equal((await db.query("select status from public.blog_posts where id = 'rascunho'")).rows[0].status, "draft");
  // Executável: recusado até no rascunho e nas alterações pendentes.
  await recusa(grava("xss1", "draft", doc(bloco({ text: "[x](javascript:alert(1))" }))), "link que não é");
  await recusa(grava("xss2", "review", doc({ id: "v", type: "video", url: "javascript:alert(1)" })), "não é seguro");
  await recusa(grava("xss3", "draft", doc(bloco({ text: "<script>alert(1)</script>" }))), "não aceita HTML");
  await recusa(grava("xss4", "published", { cover: "javascript:alert(1)", content: [] }), "capa");
  await recusa(db.query("update public.blog_posts set pending_document = $1::jsonb where id = 'ok'", [JSON.stringify(doc({ id: "i", type: "image", src: "data:image/png;base64,AA" }))]), "imagem");
  // Contador de leituras e outras colunas não disparam o gatilho.
  await db.query("update public.blog_posts set views = views + 1 where id = 'ok'");
  // O estado dos artigos legítimos não mudou.
  assert.equal((await db.query("select count(*)::int as n from public.blog_posts")).rows[0].n, 5 + 2);
  await db.close();
});

test("migration: preparada, transacional, sem apagar dados nem mexer em grants, RLS, RPCs ou permissões", async () => {
  const sql = await ler("supabase/migrations/202611100001_blog_validacao_de_conteudo.sql");
  const codigo = sql.replace(/--.*$/gm, "");
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;\s*$/m);
  assert.doesNotMatch(codigo, /\b(drop\s+table|truncate|delete\s+from|alter\s+table|create\s+policy|drop\s+policy|enable\s+row|grant\s|mesa_salvar_post|is_portal_admin|has_portal_permission)\b/i);
  assert.doesNotMatch(codigo, /\bupdate\s+public\./i, "não reescreve nenhuma linha existente");
  assert.match(codigo, /before insert or update of document, pending_document, status on public\.blog_posts/);
  assert.match(sql, /PREPARADA, NÃO APLICADA/);
  const doc = await ler("docs/blog-b1-editor-multimidia.md");
  for (const secao of ["Preflight", "Backup", "Impacto", "Rollback"]) assert.match(doc, new RegExp(`## ${secao}`), secao);
});
