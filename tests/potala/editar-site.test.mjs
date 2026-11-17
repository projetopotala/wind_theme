import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";

import { createAdminShell } from "../../outputs/js/admin/admin-shell.js";
import { criarApiEditarSite, traduzirErro, ErroEditarSite } from "../../outputs/js/site/api.js";
import { aplicarConteudo, definirTexto, lerTexto } from "../../outputs/js/site/aplicar.js";
import { iniciarConteudoPublico } from "../../outputs/js/site/conteudo-publico.js";
import { criarEstadoEditor, limparConteudo } from "../../outputs/js/site/estado.js";
import { DESTINOS_DO_PORTAL, PAGINAS_EDITAVEIS, carregarManifesto, paginaPorSlug } from "../../outputs/js/site/paginas.js";
import { descreverDestino, validarArquivoImagem, validarConteudo, validarLink, validarTexto } from "../../outputs/js/site/validar.js";

const RAIZ = new URL("../../outputs/", import.meta.url);
const lerArquivo = (rel) => readFileSync(new URL(rel, RAIZ), "utf8");

/* ---------- DOM falso, só o que o aplicador usa ---------- */
function texto(valor) { return { nodeType: 3, nodeValue: valor }; }
function elemento({ filhos = [], atributos = {}, tag = "P", pai = null } = {}) {
  const attrs = new Map(Object.entries(atributos));
  const el = {
    tagName: tag, childNodes: filhos, style: {}, parentElement: pai, removidos: [],
    getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
    setAttribute: (n, v) => { attrs.set(n, String(v)); },
    removeAttribute: (n) => { attrs.delete(n); },
    querySelectorAll: () => [],
    remove() { this.removido = true; },
    get textContent() { return filhos.map((f) => f.nodeValue ?? f.textContent ?? "").join(""); },
    set textContent(v) { filhos.splice(0, filhos.length, texto(v)); },
  };
  return el;
}
const documentoFalso = (mapa) => ({ querySelector: (sel) => { if (sel === "!!invalido") throw new SyntaxError("x"); return mapa[sel] || null; } });

const MANIFESTO = {
  slug: "pg", arquivo: "pg.html", titulo: "Pg",
  elementos: [
    { chave: "titulo", tipo: "texto", secao: "A", rotulo: "Título principal", seletor: "#t", original: { text: "Original" } },
    { chave: "botao", tipo: "botao", secao: "A", rotulo: "Botão", seletor: "#b", original: { text: "Saiba mais", href: "#x" } },
    { chave: "foto", tipo: "imagem", secao: "A", rotulo: "Imagem", seletor: "#i", original: { src: "media/a.webp", alt: "Alt original" } },
    { chave: "sumiu", tipo: "texto", secao: "A", rotulo: "Some", seletor: "#nao-existe", original: { text: "x" } },
  ],
};

test("aplicar: texto por nó de texto, preservando a seta decorativa do botão", () => {
  const seta = elemento({ tag: "SPAN", filhos: [texto("→")] });
  const btn = elemento({ tag: "A", atributos: { href: "#x" }, filhos: [texto(" Saiba mais "), seta] });
  definirTexto(btn, "Conhecer");
  assert.equal(btn.childNodes[0].nodeValue, " Conhecer ");
  assert.equal(btn.childNodes[1], seta);
  assert.equal(lerTexto(btn), "Conhecer");
});

test("aplicar: texto com marcação é aplicado como texto, nunca como HTML", () => {
  const h = elemento({ tag: "H1", filhos: [texto("Original")] });
  const doc = documentoFalso({ "#t": h });
  aplicarConteudo(doc, MANIFESTO, { titulo: { text: "<img src=x onerror=alert(1)> & mais" } });
  assert.equal(h.childNodes.length, 1);
  assert.equal(h.childNodes[0].nodeValue, "<img src=x onerror=alert(1)> & mais");
});

test("aplicar: botão (texto, link e rel), imagem (src, alt, enquadramento) e retorno ao original", () => {
  const h = elemento({ tag: "H1", filhos: [texto("Original")] });
  const b = elemento({ tag: "A", atributos: { href: "#x" }, filhos: [texto("Saiba mais")] });
  const i = elemento({ tag: "IMG", atributos: { src: "media/a.webp", alt: "Alt original", srcset: "a 1x" } });
  const doc = documentoFalso({ "#t": h, "#b": b, "#i": i });
  const n = aplicarConteudo(doc, MANIFESTO, {
    botao: { text: "Agendar", href: "https://exemplo.com/x" },
    foto: { src: "https://cdn.exemplo.com/nova.webp", alt: "Nova", pos: "0% 100%" },
  }, { marcar: true });
  assert.equal(n, 2);
  assert.equal(b.getAttribute("href"), "https://exemplo.com/x");
  assert.equal(b.getAttribute("rel"), "noopener noreferrer");
  assert.equal(i.getAttribute("src"), "https://cdn.exemplo.com/nova.webp");
  assert.equal(i.getAttribute("srcset"), null);
  assert.equal(i.getAttribute("alt"), "Nova");
  assert.equal(i.style.objectPosition, "0% 100%");
  assert.equal(h.getAttribute("data-es-chave"), "titulo");
  // conteúdo vazio devolve tudo ao original
  aplicarConteudo(doc, MANIFESTO, {});
  assert.equal(b.childNodes[0].nodeValue, "Saiba mais");
  assert.equal(b.getAttribute("href"), "#x");
  assert.equal(i.getAttribute("src"), "media/a.webp");
  assert.equal(i.getAttribute("alt"), "Alt original");
  assert.equal(i.style.objectPosition, "");
});

test("aplicar: destino ou imagem perigosos vindos do banco são ignorados; elemento ausente não quebra", () => {
  const b = elemento({ tag: "A", atributos: { href: "#x" }, filhos: [texto("Saiba mais")] });
  const i = elemento({ tag: "IMG", atributos: { src: "media/a.webp", alt: "x" } });
  const doc = documentoFalso({ "#b": b, "#i": i });
  assert.doesNotThrow(() => aplicarConteudo(doc, MANIFESTO, {
    botao: { href: "javascript:alert(1)" }, foto: { src: "javascript:alert(1)" }, sumiu: { text: "fantasma" },
  }));
  assert.equal(b.getAttribute("href"), "#x");
  assert.equal(i.getAttribute("src"), "media/a.webp");
});

/* ---------- validação ---------- */
test("validar: espelha as regras do banco (os mesmos casos recusados lá são recusados aqui)", () => {
  const ruins = [
    { k: { href: "javascript:alert(1)" } }, { k: { href: "data:text/html;base64,AAAA" } }, { k: { href: "//evil.example/x" } },
    { k: { href: "http://inseguro.example" } }, { k: { src: "javascript:alert(1)" } }, { k: { src: "media/../../segredo.png" } },
    { k: { src: "media/arquivo.svg" } }, { k: { onclick: "x" } }, { k: { html: "<script>1</script>" } }, { k: { text: "" } },
    { k: { text: "x".repeat(2001) } }, { k: { text: "linha\u0000nula" } }, { k: { text: "quebra\nde linha" } }, { k: { alt: "a".repeat(301) } },
    { k: { pos: "50 50" } }, { "Chave Invalida": { text: "x" } }, { k: "texto solto" }, [],
  ];
  for (const c of ruins) assert.ok(validarConteudo(c).length > 0, JSON.stringify(c).slice(0, 60));
  assert.equal(validarConteudo({ a: { text: "ok", href: "https://exemplo.com/x?y=1#z" }, b: { href: "travessia.html#topo" }, c: { href: "#historia" }, d: { src: "media/foto-nova.webp", alt: "Descrição", pos: "40% 60%" }, e: { text: "<b>texto</b> & mais" } }).length, 0);
});

test("validar: links, destinos conhecidos e imagens", () => {
  const conhecidas = Object.keys(DESTINOS_DO_PORTAL);
  assert.equal(validarLink("travessia.html", { paginasConhecidas: conhecidas }), "");
  assert.match(validarLink("fantasma.html", { paginasConhecidas: conhecidas }), /não existe/);
  assert.match(validarLink("", {}), /Informe/);
  assert.match(validarLink("ftp://x.y/z"), /https/);
  assert.equal(descreverDestino("travessia.html", { rotulos: DESTINOS_DO_PORTAL }), "Página do Portal: A Travessia");
  assert.match(descreverDestino("https://exemplo.com/x"), /exemplo\.com/);
  assert.match(validarTexto("   "), /vazio/);
  assert.match(validarArquivoImagem({ type: "image/svg+xml", size: 100 }), /JPG|PNG/);
  assert.match(validarArquivoImagem({ type: "image/png", size: 5 * 1024 * 1024 + 1 }), /5 MB/);
  assert.equal(validarArquivoImagem({ type: "image/webp", size: 1000 }), "");
});

/* ---------- estado do editor ---------- */
test("estado: rascunho, desfazer/refazer, não salvo e diferença com o publicado", () => {
  const e = criarEstadoEditor({ manifesto: MANIFESTO, publicado: { version: 2, content: { titulo: { text: "No ar" } } }, rascunho: null });
  assert.equal(e.situacao, "publicado");
  assert.equal(e.versaoPublicada, 2);
  assert.equal(e.definir("titulo", { text: "Novo" }), true);
  assert.equal(e.situacao, "alterado");
  assert.deepEqual(e.diferencasComPublicado, ["titulo"]);
  assert.equal(e.definir("titulo", { text: "Novo" }), false, "mesmo valor não é alteração");
  assert.equal(e.definir("botao", { text: "Saiba mais" }), false, "igual ao original não é alteração");
  assert.equal(e.desfazer(), true);
  assert.equal(e.valorDe("titulo").text, "No ar");
  assert.equal(e.situacao, "publicado");
  assert.equal(e.refazer(), true);
  assert.equal(e.valorDe("titulo").text, "Novo");
  e.marcarSalvo({ revision: 1 });
  assert.equal(e.situacao, "rascunho");
  assert.equal(e.revisao, 1);
  assert.equal(e.temRascunho, true);
  assert.equal(e.naoSalvo, false);
  e.definir("foto", { alt: "Outra descrição" });
  assert.equal(e.situacao, "alterado");
  e.marcarPublicado({ version: 3 });
  assert.equal(e.situacao, "publicado");
  assert.equal(e.versaoPublicada, 3);
  assert.equal(e.temRascunho, false);
  assert.equal(e.revisao, 0);
  assert.equal(e.valorDe("titulo").text, "Novo");
  assert.equal(e.podeDesfazer, false, "depois de publicar não se desfaz a publicação");
});

test("estado: restaurar o original, descartar e recarregar do banco; chaves antigas são descartadas", () => {
  const e = criarEstadoEditor({ manifesto: MANIFESTO, publicado: { version: 0, content: {} }, rascunho: { revision: 4, base_version: 0, content: { titulo: { text: "R" }, antiga: { text: "x" } } } });
  assert.equal(e.revisao, 4);
  assert.equal(e.situacao, "rascunho");
  assert.deepEqual(Object.keys(limparConteudo(MANIFESTO, e.conteudo)), ["titulo"]);
  assert.equal(e.restaurarOriginal("titulo"), true);
  assert.equal(e.valorDe("titulo").text, "Original");
  e.marcarDescartado();
  assert.equal(e.temRascunho, false);
  e.recarregar({ publicado: { version: 5, content: { botao: { text: "B" } } }, rascunho: null });
  assert.equal(e.versaoPublicada, 5);
  assert.equal(e.valorDe("botao").text, "B");
  e.carregarNaoSalvo({ titulo: { text: "recuperado" } });
  assert.equal(e.naoSalvo, true);
});

/* ---------- API ---------- */
test("api: traduz erros do banco em códigos que a tela entende", () => {
  assert.equal(traduzirErro({ code: "42501", message: "permission denied" }).codigo, "SEM_PERMISSAO");
  assert.equal(traduzirErro({ code: "PT409", message: "mudou" }).codigo, "CONFLITO");
  assert.equal(traduzirErro({ code: "PT404", message: "x" }).codigo, "NAO_ENCONTRADO");
  assert.equal(traduzirErro({ code: "22023", message: "Link inválido" }).codigo, "INVALIDO");
  assert.equal(traduzirErro(new TypeError("Failed to fetch")).codigo, "REDE");
  assert.equal(traduzirErro(new Error("algo")).codigo, "GERAL");
  assert.ok(traduzirErro({ code: "42501" }) instanceof ErroEditarSite);
});

test("api: chama as funções do Owner com os parâmetros certos e rejeita upload inválido antes de enviar", async () => {
  const chamadas = [];
  const client = {
    rpc: async (nome, args) => { chamadas.push([nome, args]); return { data: { ok: true }, error: null }; },
    storage: { from: () => ({ upload: async () => { throw new Error("não devia enviar"); }, getPublicUrl: () => ({ data: { publicUrl: "x" } }) }) },
  };
  const api = criarApiEditarSite({ client });
  await api.carregar("quem-somos");
  await api.salvarRascunho("quem-somos", { a: { text: "x" } }, 0);
  await api.publicar("quem-somos", 1, 2);
  await api.restaurar("quem-somos", 1, 3, true);
  await api.descartarRascunho("quem-somos", 2);
  assert.deepEqual(chamadas.map((c) => c[0]), ["site_editor_load", "site_save_draft", "site_publish", "site_restore", "site_discard_draft"]);
  assert.deepEqual(chamadas[2][1], { p_page: "quem-somos", p_expected_version: 1, p_expected_revision: 2 });
  assert.deepEqual(chamadas[3][1], { p_page: "quem-somos", p_version: 1, p_expected_version: 3, p_discard_draft: true });
  await assert.rejects(api.enviarImagem("quem-somos", { type: "image/svg+xml", size: 10 }), (e) => e.codigo === "INVALIDO");
  await assert.rejects(api.enviarImagem("quem-somos", { type: "image/png", size: 6 * 1024 * 1024 }), (e) => e.codigo === "INVALIDO");
  const falho = criarApiEditarSite({ client: { rpc: async () => ({ data: null, error: { code: "42501", message: "Somente a conta Owner pode editar o site." } }) } });
  await assert.rejects(falho.publicar("quem-somos", 0, 1), (e) => e.codigo === "SEM_PERMISSAO");
});

/* ---------- páginas e manifestos ---------- */
const decodificar = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");

test("cada página editável existe, carrega o script do conteúdo publicado e tem manifesto coerente com o HTML", async () => {
  assert.deepEqual(PAGINAS_EDITAVEIS.map((p) => p.slug), ["quem-somos", "saude-integrativa", "inspiracao", "cultura"]);
  for (const pagina of PAGINAS_EDITAVEIS) {
    assert.ok(existsSync(new URL(pagina.arquivo, RAIZ)), pagina.arquivo);
    const html = lerArquivo(pagina.arquivo);
    const marcador = `<script type="module" src="js/site/conteudo-publico.js" data-site-pagina="${pagina.slug}"></script>`;
    assert.equal(html.split(marcador).length - 1, 1, `${pagina.slug}: script do conteúdo publicado exatamente uma vez`);
    const manifesto = await carregarManifesto(pagina.slug);
    assert.equal(manifesto.slug, pagina.slug);
    assert.equal(manifesto.arquivo, pagina.arquivo);
    assert.ok(manifesto.elementos.length >= 6, `${pagina.slug}: elementos suficientes`);
    const plano = decodificar(html);
    const chaves = new Set();
    for (const el of manifesto.elementos) {
      assert.match(el.chave, /^[a-z0-9][a-z0-9-]{0,63}$/);
      assert.ok(!chaves.has(el.chave), `chave repetida ${el.chave}`);
      chaves.add(el.chave);
      assert.ok(["texto", "botao", "imagem"].includes(el.tipo));
      assert.ok(el.secao && el.rotulo && el.seletor);
      if (el.tipo === "imagem") assert.ok(html.includes(`src="${el.original.src}"`), `${pagina.slug}: imagem ${el.original.src}`);
      else assert.ok(plano.includes(decodificar(el.original.text)), `${pagina.slug}: texto "${el.original.text.slice(0, 40)}" não está mais no HTML`);
      if (el.tipo === "botao") assert.ok(html.includes(`href="${el.original.href}"`), `${pagina.slug}: link ${el.original.href}`);
    }
  }
});

test("só páginas institucionais entram; áreas transacionais e a Home ficam de fora", async () => {
  for (const fora of ["index", "atendimentos", "cursos", "blog", "marketplace", "meu-potala", "admin", "travessia", "recepcao"]) {
    assert.equal(paginaPorSlug(fora), null, fora);
    await assert.rejects(carregarManifesto(fora), RangeError);
  }
  await assert.rejects(carregarManifesto("../admin"), RangeError);
  for (const arquivo of Object.keys(DESTINOS_DO_PORTAL)) assert.ok(existsSync(new URL(arquivo, RAIZ)), `destino ${arquivo} existe`);
});

test("as páginas públicas não foram alteradas além da linha de script (mesmo HTML, mesmo conteúdo)", () => {
  for (const pagina of PAGINAS_EDITAVEIS) {
    const html = lerArquivo(pagina.arquivo);
    assert.equal((html.match(/data-es-/g) || []).length, 0, "o HTML estático não carrega marcas do editor");
    assert.equal((html.match(/data-site-pagina/g) || []).length, 1);
  }
});

/* ---------- conteúdo público ---------- */
test("conteúdo público: aplica só o publicado; ignora no editor; falha silenciosa mantém o HTML", async () => {
  const h = elemento({ tag: "H1", filhos: [texto("Original")] });
  const marcador = { getAttribute: () => "quem-somos" };
  const manifestoReal = await carregarManifesto("quem-somos");
  const primeiro = manifestoReal.elementos.find((e) => e.tipo === "texto");
  const doc = { querySelector: (sel) => (sel === "script[data-site-pagina]" ? marcador : sel === primeiro.seletor ? h : null) };
  const pedidos = [];
  const rest = { ler: async (tabela, params) => { pedidos.push([tabela, params]); return [{ version: 3, content: { [primeiro.chave]: { text: "Publicado agora" } } }]; } };
  assert.equal(await iniciarConteudoPublico({ doc, localizacao: { search: "" }, rest }), 3);
  assert.equal(h.childNodes[0].nodeValue, "Publicado agora");
  assert.equal(pedidos[0][0], "site_pages_published", "o público só lê a tabela do publicado");
  assert.equal(pedidos[0][1].page_slug, "eq.quem-somos");
  // dentro do editor não busca nada
  pedidos.length = 0;
  assert.equal(await iniciarConteudoPublico({ doc, localizacao: { search: "?editor-site=1" }, rest }), null);
  assert.equal(pedidos.length, 0);
  // sem marcador, nada
  assert.equal(await iniciarConteudoPublico({ doc: { querySelector: () => null }, localizacao: { search: "" }, rest }), null);
  // erro de rede: página fica como veio
  const h2 = elemento({ tag: "H1", filhos: [texto("Original")] });
  const doc2 = { querySelector: (sel) => (sel === "script[data-site-pagina]" ? marcador : sel === primeiro.seletor ? h2 : null) };
  assert.equal(await iniciarConteudoPublico({ doc: doc2, localizacao: { search: "" }, rest: { ler: async () => { throw new Error("sem rede"); } } }), null);
  assert.equal(h2.childNodes[0].nodeValue, "Original");
});

/* ---------- segurança do código e permissões ---------- */
test("o código do editor nunca monta HTML a partir de texto nem toca em credenciais administrativas", () => {
  const proibidos = [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function/, /service_role/i, /localStorage\.setItem\([^)]*senha/i];
  for (const arquivo of readdirSync(new URL("js/site/", RAIZ)).filter((f) => f.endsWith(".js"))) {
    const codigo = lerArquivo(`js/site/${arquivo}`).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const regra of proibidos) assert.doesNotMatch(codigo, regra, `${arquivo}: ${regra}`);
  }
  for (const arquivo of readdirSync(new URL("js/site/manifesto/", RAIZ))) assert.doesNotMatch(lerArquivo(`js/site/manifesto/${arquivo}`), /innerHTML|<script/i);
});

test("admin: 'Editar site' é botão escondido por padrão e só o Owner o revela", () => {
  const html = lerArquivo("admin.html");
  assert.match(html, /data-section="editar-site"[^>]*\bhidden\b/);
  assert.match(html, /data-admin-workspace="editar-site"[^>]*\bhidden\b/);
  assert.match(html, /href="\/css\/editar-site\.css"/);
  const entrada = lerArquivo("js/admin/admin-entry.js");
  assert.match(entrada, /access\.role === "owner" && !editarSite/);
  assert.match(entrada, /createEditarSite/);
});

function nos(papel) {
  const mapa = new Map();
  const no = (secao) => ({ hidden: true, setAttribute: (n, v) => mapa.set(`${secao}.${n}`, String(v)), getAttribute: (n) => (n === "data-section" ? secao : null), addEventListener() {} });
  const itens = ["jornada", "blog", "editar-site", "pessoas"].map(no);
  const nav = { querySelectorAll: () => itens, querySelector: () => null, addEventListener() {} };
  const mudo = { setAttribute() {}, addEventListener() {}, querySelector: () => null, textContent: "" };
  const root = { dataset: {}, querySelector: (s) => (s === "[data-admin-nav]" ? nav : s.startsWith("[data-admin-user-") || s === "[data-admin-avatar]" ? mudo : null), querySelectorAll: () => [] };
  const shell = createAdminShell({ root });
  shell.setUser({ name: "Teste", role: "x", accessRole: papel, blogNivel: "total" });
  return Object.fromEntries(itens.map((i) => [i.getAttribute("data-section"), !i.hidden]));
}

test("admin: o botão Editar site aparece só para a conta Owner (admin e editor do Blog não o veem)", () => {
  assert.equal(nos("owner")["editar-site"], true);
  assert.equal(nos("admin")["editar-site"], false);
  assert.equal(nos("blog_editor")["editar-site"], false);
  assert.equal(nos("blog_editor").blog, true);
  assert.equal(nos("admin").jornada, true, "as demais seções seguem como estavam");
});
