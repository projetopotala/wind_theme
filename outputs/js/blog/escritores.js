/*
 * ESCRITORES DO CADERNO (P2A) — quem assina os textos publicados.
 *
 * A autoria pública é a ASSINATURA do texto (o campo "author" que a Mesa grava e
 * que o artigo já mostra como "Por …"). Nada aqui usa blog_posts.created_by: o
 * identificador da conta, o e-mail e os dados privados de quem escreve nunca
 * chegam à página. Texto sem assinatura aparece como "Instituto Potala"
 * (normalizePost já faz isso), sem atribuir o texto a uma pessoa.
 *
 * Só entram textos que o banco devolveu como publicados (a política do banco
 * decide: publicado, ou agendado cuja hora chegou). Rascunho e pendência não
 * passam por aqui.
 */
import { normalizePosts, slugifyBlogTitle } from "./blog-model.js";

export const ASSINATURA_INSTITUCIONAL = "Instituto Potala";

/* Endereço estável do escritor: a assinatura sem acentos, minúscula, com hífens. */
export function slugDoEscritor(nome) {
  const limpo = String(nome ?? "").trim();
  return limpo ? slugifyBlogTitle(limpo) : slugifyBlogTitle(ASSINATURA_INSTITUCIONAL);
}

export const hrefDoEscritor = (nome) => `escritor.html?nome=${encodeURIComponent(slugDoEscritor(nome))}`;

/* Só aceita o formato que slugDoEscritor produz; qualquer outra coisa vira "sem escritor". */
export function slugValido(valor) {
  const texto = String(valor ?? "").trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(texto) && texto.length <= 140 ? texto : "";
}

const recentesPrimeiro = (a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""))
  || String(a.title).localeCompare(String(b.title), "pt-BR");

/* A grafia exibida: a mais usada entre os textos (empate: a do texto mais recente). */
function grafiaPrincipal(textos) {
  const contagem = new Map();
  for (const post of textos) contagem.set(post.author, (contagem.get(post.author) || 0) + 1);
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ASSINATURA_INSTITUCIONAL;
}

/* Todos os escritores com ao menos um texto publicado, em ordem alfabética. */
export function escritoresDoCaderno(publicados = []) {
  const grupos = new Map();
  for (const post of normalizePosts(publicados).filter((item) => item.status === "published")) {
    const slug = slugDoEscritor(post.author);
    if (!grupos.has(slug)) grupos.set(slug, []);
    grupos.get(slug).push(post);
  }
  return [...grupos.entries()]
    .map(([slug, textos]) => {
      const ordenados = [...textos].sort(recentesPrimeiro);
      return { slug, nome: grafiaPrincipal(ordenados), total: ordenados.length, ultimo: ordenados[0]?.publishedAt || "", institucional: slug === slugDoEscritor(ASSINATURA_INSTITUCIONAL) };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/* Os textos publicados de um escritor, do mais recente ao mais antigo. */
export function textosDoEscritor(publicados = [], slug = "") {
  const alvo = slugValido(slug);
  if (!alvo) return { slug: "", nome: "", textos: [] };
  const textos = normalizePosts(publicados)
    .filter((post) => post.status === "published" && slugDoEscritor(post.author) === alvo)
    .sort(recentesPrimeiro);
  return { slug: alvo, nome: textos.length ? grafiaPrincipal(textos) : "", textos };
}

/* Apresentação neutra: não há biografia cadastrada; nada é inventado sobre a pessoa. */
export function apresentacaoDoEscritor({ nome = "", textos = [] } = {}) {
  if (!nome) return "";
  const quantos = textos.length === 1 ? "1 texto publicado" : `${textos.length} textos publicados`;
  return slugDoEscritor(nome) === slugDoEscritor(ASSINATURA_INSTITUCIONAL)
    ? `Textos assinados pelo Instituto Potala no Caderno de Travessia · ${quantos}.`
    : `Textos assinados por ${nome} no Caderno de Travessia · ${quantos}.`;
}
