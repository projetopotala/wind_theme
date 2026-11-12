/*
 * PÁGINA DO ESCRITOR (escritor.html?nome=<slug>) e ÍNDICE DE ESCRITORES (escritor.html).
 *
 * Lê os textos publicados pela mesma via pública do Caderno (o banco decide o que
 * está no ar) e agrupa pela assinatura. Os cartões são os mesmos do Caderno
 * (cartaoDoPost): imagem, título, resumo e data. Sem dados privados de quem escreve.
 *
 * P2B: quando a Mesa cadastrou um perfil visível para o endereço, a página mostra o
 * nome público, a apresentação e a imagem dele. Sem perfil (ou se a leitura dos
 * perfis falhar), segue a apresentação neutra da P2A. O endereço nunca muda.
 */
import { cartaoDoPost } from "./blog-controller.js";
import { criarBlogPublico } from "./blog-remoto.js";
import { criarRestPublico } from "../supabase/rest.js";
import {
  apresentacaoDoEscritor, escritoresDoCaderno, iniciaisDoEscritor, imagemDePerfilSegura, paragrafosDaBio, perfisPorSlug, slugValido, textosDoEscritor,
} from "./escritores.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const contagem = (n) => (n === 1 ? "1 texto" : `${n} textos`);
const hrefDoSlug = (slug) => `escritor.html?nome=${encodeURIComponent(slug)}`;
const comoMapa = (perfis) => (perfis instanceof Map ? perfis : perfisPorSlug(perfis));

export function listaDeEscritores(escritores = [], atual = "") {
  if (!escritores.length) return "";
  return `<ul class="escritores-lista">${escritores.map((item) => `<li><a href="${e(hrefDoSlug(item.slug))}"${item.slug === atual ? ' aria-current="page"' : ""}><span>${e(item.nome)}</span><small>${e(contagem(item.total))}</small></a></li>`).join("")}</ul>`;
}

/* Escritores do Caderno com o nome público do perfil, quando houver. */
const escritoresComPerfil = (publicados, mapa) => escritoresDoCaderno(publicados)
  .map((item) => ({ ...item, nome: mapa.get(item.slug)?.nome || item.nome }))
  .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

function retrato(nome, perfil) {
  const imagem = imagemDePerfilSegura(perfil?.imagem);
  return imagem
    ? `<figure class="escritor-retrato"><img src="${e(imagem)}" alt="${e(perfil.imagemAlt || "")}" width="160" height="160" decoding="async"></figure>`
    : `<div class="escritor-retrato escritor-retrato--iniciais" aria-hidden="true">${e(iniciaisDoEscritor(nome))}</div>`;
}

function cabecaDoEscritor({ nome, perfil, textos }) {
  const bio = paragrafosDaBio(perfil?.bio);
  const quantos = textos.length === 1 ? "1 texto publicado" : `${textos.length} textos publicados`;
  const texto = bio.length
    ? `${bio.map((p) => `<p class="escritor-apresentacao">${e(p)}</p>`).join("")}${textos.length ? `<p class="escritor-contagem">${e(quantos)} no Caderno de Travessia.</p>` : ""}`
    : `<p class="escritor-apresentacao">${e(textos.length ? apresentacaoDoEscritor({ nome, textos }) : "")}</p>`;
  return `<header class="escritor-cabeca escritor-cabeca--perfil">${retrato(nome, perfil)}
      <div class="escritor-cabeca__texto"><p class="cad-rotulo">Escritores do Caderno</p><h1 id="escritor-titulo">${e(nome)}</h1>${texto}</div></header>`;
}

/* O conteúdo da página. estado: carregando | indisponivel | indice | escritor | vazio */
export function renderizarPagina({ estado, slug = "", publicados = [], perfis = [], erro = "" } = {}) {
  const voltar = `<p class="escritor-voltar"><a href="blog.html">← Voltar ao Caderno</a></p>`;
  if (estado === "carregando") return `<p class="escritor-status" role="status">Carregando os textos publicados…</p>`;
  if (estado === "indisponivel") {
    return `${voltar}<div class="blog-vazio blog-indisponivel" role="alert"><p>${e(erro || "Não foi possível consultar os textos publicados agora.")}</p><button class="cad-botao-contorno" type="button" data-escritor-tentar>Tentar de novo</button></div>`;
  }
  const mapa = comoMapa(perfis);
  const escritores = escritoresComPerfil(publicados, mapa);
  const alvo = slugValido(slug);
  if (estado === "indice" || !alvo) {
    return `${voltar}<header class="escritor-cabeca"><p class="cad-rotulo">Caderno de Travessia</p><h1 id="escritor-titulo">Escritores</h1>
      <p class="escritor-apresentacao">Quem assina os textos do Caderno. Escolha um nome para ver todos os textos publicados.</p></header>
      ${escritores.length ? listaDeEscritores(escritores) : `<p class="blog-vazio">Ainda não há textos publicados no Caderno.</p>`}`;
  }
  const { nome: assinatura, textos } = textosDoEscritor(publicados, alvo);
  const perfil = mapa.get(alvo) || null;
  const outros = escritores.filter((item) => item.slug !== alvo);
  const secaoOutros = outros.length ? `<section class="escritor-outros" aria-labelledby="outros-titulo"><h2 class="cad-rotulo" id="outros-titulo">Outros escritores</h2>${listaDeEscritores(outros)}</section>` : "";
  if (!textos.length && !perfil) {
    return `${voltar}<header class="escritor-cabeca"><p class="cad-rotulo">Escritores do Caderno</p><h1 id="escritor-titulo">Nenhum texto publicado</h1>
      <p class="escritor-apresentacao">Não encontramos textos publicados com esta assinatura. Ela pode ter mudado, ou os textos ainda não estão no ar.</p></header>
      ${secaoOutros}`;
  }
  const nome = perfil?.nome || assinatura;
  const lista = textos.length
    ? `<section aria-labelledby="escritor-titulo"><div class="blog-grade escritor-grade">${textos.map((post) => cartaoDoPost(post)).join("")}</div></section>`
    : `<p class="blog-vazio">Ainda não há textos publicados com esta assinatura.</p>`;
  return `${voltar}${cabecaDoEscritor({ nome, perfil, textos })}${lista}${secaoOutros}`;
}

const resumir = (texto, limite = 160) => (texto.length <= limite ? texto : `${texto.slice(0, limite - 1).replace(/\s+\S*$/, "")}…`);

/* Título, descrição, canônico e robots coerentes com a página estática. */
export function metadados({ estado, slug = "", publicados = [], perfis = [], origem = "" } = {}) {
  const base = `${origem}/escritor.html`;
  if (estado !== "escritor") {
    return { titulo: "Escritores — Caderno de Travessia — Instituto Potala", descricao: "Quem assina os textos do Caderno de Travessia do Instituto Potala.", canonico: base, indexar: estado === "indice" };
  }
  const alvo = slugValido(slug);
  const { nome: assinatura, textos } = textosDoEscritor(publicados, alvo);
  const perfil = comoMapa(perfis).get(alvo) || null;
  if (!textos.length && !perfil) return { titulo: "Escritor não encontrado — Caderno de Travessia", descricao: "Não há textos publicados com esta assinatura.", canonico: base, indexar: false };
  const nome = perfil?.nome || assinatura;
  const bio = paragrafosDaBio(perfil?.bio).join(" ");
  const imagem = imagemDePerfilSegura(perfil?.imagem);
  return {
    titulo: `${nome} — Escritores do Caderno de Travessia — Instituto Potala`,
    descricao: bio ? resumir(bio) : textos.length ? apresentacaoDoEscritor({ nome, textos }) : `${nome} no Caderno de Travessia do Instituto Potala.`,
    canonico: `${base}?nome=${encodeURIComponent(alvo)}`,
    // Perfil sem nenhum texto publicado ainda não é indexado: a página é quase vazia.
    indexar: textos.length > 0,
    imagem: imagem ? (imagem.startsWith("https://") ? imagem : `${origem}/${imagem}`) : "",
  };
}

function aplicarMetadados(doc, meta) {
  doc.title = meta.titulo;
  const garantir = (seletor, criar) => doc.head.querySelector(seletor) || doc.head.appendChild(criar());
  garantir('meta[name="description"]', () => Object.assign(doc.createElement("meta"), { name: "description" })).setAttribute("content", meta.descricao);
  garantir('link[rel="canonical"]', () => Object.assign(doc.createElement("link"), { rel: "canonical" })).setAttribute("href", meta.canonico);
  garantir('meta[name="robots"]', () => Object.assign(doc.createElement("meta"), { name: "robots" })).setAttribute("content", meta.indexar ? "index, follow" : "noindex, follow");
  const og = [["og:title", meta.titulo], ["og:description", meta.descricao], ["og:url", meta.canonico]];
  if (meta.imagem) og.push(["og:image", meta.imagem]);
  for (const [prop, valor] of og) {
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
    const mapa = comoMapa(extra.perfis || []);
    const temConteudo = textosDoEscritor(extra.publicados, slug).textos.length > 0 || mapa.has(slug);
    const final = estado === "escritor" && !temConteudo ? "vazio" : estado;
    aplicarMetadados(doc, metadados({ estado: final, slug, publicados: extra.publicados || [], perfis: mapa, origem: local?.origin || "" }));
    if (trilha) trilha.textContent = final === "escritor" ? (mapa.get(slug)?.nome || textosDoEscritor(extra.publicados, slug).nome) : "Escritores";
  };
  const carregar = () => {
    desenhar("carregando");
    // Os perfis são complemento: listarPerfis nunca falha (sem perfis, a página segue neutra).
    return Promise.all([fonte.listarPublicados(), fonte.listarPerfis ? fonte.listarPerfis() : []]).then(
      ([publicados, perfis]) => desenhar(slug ? "escritor" : "indice", { publicados, perfis: perfisPorSlug(perfis) }),
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
