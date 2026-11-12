/*
 * PÁGINA DO ESCRITOR (escritor.html?nome=<slug>) e ÍNDICE DE ESCRITORES (escritor.html).
 *
 * Lê os textos publicados pela mesma via pública do Caderno (o banco decide o que
 * está no ar) e agrupa pela assinatura. Os cartões são os mesmos do Caderno
 * (cartaoDoPost): imagem, título, resumo e data. Sem dados privados de quem escreve.
 */
import { cartaoDoPost } from "./blog-controller.js";
import { criarBlogPublico } from "./blog-remoto.js";
import { criarRestPublico } from "../supabase/rest.js";
import { apresentacaoDoEscritor, escritoresDoCaderno, hrefDoEscritor, slugValido, textosDoEscritor } from "./escritores.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const contagem = (n) => (n === 1 ? "1 texto" : `${n} textos`);

export function listaDeEscritores(escritores = [], atual = "") {
  if (!escritores.length) return "";
  return `<ul class="escritores-lista">${escritores.map((item) => `<li><a href="${e(hrefDoEscritor(item.nome))}"${item.slug === atual ? ' aria-current="page"' : ""}><span>${e(item.nome)}</span><small>${e(contagem(item.total))}</small></a></li>`).join("")}</ul>`;
}

/* O conteúdo da página. estado: carregando | indisponivel | indice | escritor | vazio */
export function renderizarPagina({ estado, slug = "", publicados = [], erro = "" } = {}) {
  const voltar = `<p class="escritor-voltar"><a href="blog.html">← Voltar ao Caderno</a></p>`;
  if (estado === "carregando") return `<p class="escritor-status" role="status">Carregando os textos publicados…</p>`;
  if (estado === "indisponivel") {
    return `${voltar}<div class="blog-vazio blog-indisponivel" role="alert"><p>${e(erro || "Não foi possível consultar os textos publicados agora.")}</p><button class="cad-botao-contorno" type="button" data-escritor-tentar>Tentar de novo</button></div>`;
  }
  const escritores = escritoresDoCaderno(publicados);
  if (estado === "indice" || !slugValido(slug)) {
    return `${voltar}<header class="escritor-cabeca"><p class="cad-rotulo">Caderno de Travessia</p><h1 id="escritor-titulo">Escritores</h1>
      <p class="escritor-apresentacao">Quem assina os textos do Caderno. Escolha um nome para ver todos os textos publicados.</p></header>
      ${escritores.length ? listaDeEscritores(escritores) : `<p class="blog-vazio">Ainda não há textos publicados no Caderno.</p>`}`;
  }
  const { nome, textos } = textosDoEscritor(publicados, slug);
  if (!textos.length) {
    return `${voltar}<header class="escritor-cabeca"><p class="cad-rotulo">Escritores do Caderno</p><h1 id="escritor-titulo">Nenhum texto publicado</h1>
      <p class="escritor-apresentacao">Não encontramos textos publicados com esta assinatura. Ela pode ter mudado, ou os textos ainda não estão no ar.</p></header>
      ${escritores.length ? `<section class="escritor-outros" aria-labelledby="outros-titulo"><h2 class="cad-rotulo" id="outros-titulo">Outros escritores</h2>${listaDeEscritores(escritores)}</section>` : ""}`;
  }
  const outros = escritores.filter((item) => item.slug !== slugValido(slug));
  return `${voltar}<header class="escritor-cabeca"><p class="cad-rotulo">Escritores do Caderno</p><h1 id="escritor-titulo">${e(nome)}</h1>
      <p class="escritor-apresentacao">${e(apresentacaoDoEscritor({ nome, textos }))}</p></header>
    <section aria-labelledby="escritor-titulo"><div class="blog-grade escritor-grade">${textos.map((post) => cartaoDoPost(post)).join("")}</div></section>
    ${outros.length ? `<section class="escritor-outros" aria-labelledby="outros-titulo"><h2 class="cad-rotulo" id="outros-titulo">Outros escritores</h2>${listaDeEscritores(outros)}</section>` : ""}`;
}

/* Título, descrição, canônico e robots coerentes com a página estática. */
export function metadados({ estado, slug = "", publicados = [], origem = "" } = {}) {
  const base = `${origem}/escritor.html`;
  if (estado !== "escritor") {
    return { titulo: "Escritores — Caderno de Travessia — Instituto Potala", descricao: "Quem assina os textos do Caderno de Travessia do Instituto Potala.", canonico: base, indexar: estado === "indice" };
  }
  const { nome, textos } = textosDoEscritor(publicados, slug);
  if (!textos.length) return { titulo: "Escritor não encontrado — Caderno de Travessia", descricao: "Não há textos publicados com esta assinatura.", canonico: base, indexar: false };
  return {
    titulo: `${nome} — Escritores do Caderno de Travessia — Instituto Potala`,
    descricao: apresentacaoDoEscritor({ nome, textos }),
    canonico: `${base}?nome=${encodeURIComponent(slugValido(slug))}`,
    indexar: true,
  };
}

function aplicarMetadados(doc, meta) {
  doc.title = meta.titulo;
  const garantir = (seletor, criar) => doc.head.querySelector(seletor) || doc.head.appendChild(criar());
  garantir('meta[name="description"]', () => Object.assign(doc.createElement("meta"), { name: "description" })).setAttribute("content", meta.descricao);
  garantir('link[rel="canonical"]', () => Object.assign(doc.createElement("link"), { rel: "canonical" })).setAttribute("href", meta.canonico);
  garantir('meta[name="robots"]', () => Object.assign(doc.createElement("meta"), { name: "robots" })).setAttribute("content", meta.indexar ? "index, follow" : "noindex, follow");
  for (const [prop, valor] of [["og:title", meta.titulo], ["og:description", meta.descricao], ["og:url", meta.canonico]]) {
    garantir(`meta[property="${prop}"]`, () => { const m = doc.createElement("meta"); m.setAttribute("property", prop); return m; }).setAttribute("content", valor);
  }
}

export function montarEscritor(doc = document, { blog = null, local = globalThis.location } = {}) {
  const raiz = doc.querySelector("[data-escritor-root]");
  if (!raiz) return null;
  const fonte = blog || criarBlogPublico({ rest: criarRestPublico(), aoFalhar: (erro) => console.warn("Caderno: leitura do banco falhou (escritor).", erro) });
  const slug = slugValido(new URLSearchParams(local?.search || "").get("nome") || "");
  const trilha = doc.querySelector("[data-escritor-trilha]");
  const desenhar = (estado, extra = {}) => {
    raiz.innerHTML = renderizarPagina({ estado, slug, ...extra });
    // Carregando ou falha passageira do banco: não mexe em título, canônico nem robots
    // (um "noindex" por instabilidade tiraria a página dos buscadores sem motivo).
    if (estado === "carregando" || estado === "indisponivel") return;
    const final = estado === "escritor" && !textosDoEscritor(extra.publicados, slug).textos.length ? "vazio" : estado;
    aplicarMetadados(doc, metadados({ estado: final, slug, publicados: extra.publicados || [], origem: local?.origin || "" }));
    if (trilha) trilha.textContent = final === "escritor" ? textosDoEscritor(extra.publicados, slug).nome : "Escritores";
  };
  const carregar = () => {
    desenhar("carregando");
    return fonte.listarPublicados().then(
      (publicados) => desenhar(slug ? "escritor" : "indice", { publicados }),
      (erro) => desenhar("indisponivel", { erro: erro?.message }),
    );
  };
  raiz.addEventListener("click", (evento) => {
    if (evento.target.closest?.("[data-escritor-tentar]")) void carregar();
  });
  return { pronto: carregar() };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => montarEscritor(document), { once: true });
  else montarEscritor(document);
}
