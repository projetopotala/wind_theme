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
  const limpo = String(nome ?? "").trim().replace(/\s+/g, " ");
  if (!limpo) return slugifyBlogTitle(ASSINATURA_INSTITUCIONAL);
  const base = slugifyBlogTitle(limpo);
  // slugifyBlogTitle devolve "novo-texto" quando nada sobra (assinatura só com letras
  // não latinas ou símbolos): sem isso, assinaturas diferentes cairiam no mesmo endereço.
  const semLetrasLatinas = !/[a-z0-9]/i.test(limpo.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const slug = semLetrasLatinas ? `assinatura-${impressao(limpo.toLowerCase())}` : base;
  return slug.slice(0, 120).replace(/-+$/, "");
}

/* Impressão curta e estável do texto (FNV-1a, 32 bits), só para compor o endereço. */
function impressao(texto) {
  let h = 0x811c9dc5;
  for (const c of texto.normalize("NFC")) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
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
      return { slug, nome: grafiaPrincipal(ordenados), total: ordenados.length, ultimo: ordenados[0]?.publishedAt || "", temas: temasDoEscritor(ordenados), institucional: slug === slugDoEscritor(ASSINATURA_INSTITUCIONAL) };
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

/*
 * PERFIS EDITORIAIS (P2B) - o que a Mesa cadastra para cada endereço de escritor.
 *
 * O perfil é só apresentação pública (nome, texto, imagem). Ele é ligado ao endereço
 * (slug), não a uma conta: não prova identidade nem concede nada. Quem altera é decidido
 * pelo banco (só quem publica). As regras abaixo repetem as do banco, para que o
 * navegador nunca mostre algo que o banco recusaria.
 */
export const LIMITES_DO_PERFIL = Object.freeze({ nome: 120, bio: 1500, alt: 200 });

const IMAGEM_DO_SITE = /^media\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const IMAGEM_DA_BIBLIOTECA = /^https:\/\/[a-z0-9]{20}\.supabase\.co\/storage\/v1\/object\/public\/blog-midia\/[A-Za-z0-9._%-]+$/;

/* Endereço de imagem aceito no perfil: do próprio site ou da biblioteca do Blog. */
export function imagemDePerfilSegura(valor) {
  const url = String(valor ?? "").trim();
  if (!url || url.length > 500 || url.includes("..")) return "";
  return IMAGEM_DO_SITE.test(url) || IMAGEM_DA_BIBLIOTECA.test(url) ? url : "";
}

/* Uma linha do banco (ou do formulário) no formato da página. Linha inválida vira null. */
export function comoPerfil(linha = {}) {
  const slug = slugValido(linha.slug);
  const nome = String(linha.name ?? linha.nome ?? "").trim().slice(0, LIMITES_DO_PERFIL.nome);
  if (!slug || !nome) return null;
  return {
    slug,
    nome,
    bio: String(linha.bio ?? "").trim().slice(0, LIMITES_DO_PERFIL.bio),
    imagem: imagemDePerfilSegura(linha.image ?? linha.imagem),
    imagemAlt: String(linha.image_alt ?? linha.imagemAlt ?? "").trim().slice(0, LIMITES_DO_PERFIL.alt),
    visivel: linha.visible ?? linha.visivel ?? true,
    atualizadoEm: linha.updated_at ?? linha.atualizadoEm ?? null,
  };
}

/* Perfis públicos indexados pelo endereço. Os ocultos nunca entram na página. */
export function perfisPorSlug(linhas = []) {
  const mapa = new Map();
  for (const linha of linhas || []) {
    const perfil = comoPerfil(linha);
    if (perfil && perfil.visivel !== false && !mapa.has(perfil.slug)) mapa.set(perfil.slug, perfil);
  }
  return mapa;
}

/* A apresentação em parágrafos (linha em branco separa). Sem HTML: quem desenha escapa. */
export const paragrafosDaBio = (bio = "") => String(bio).split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);

/* Iniciais para quando não há imagem: "Núcleo de Oráculos" -> "NO". */
export function iniciaisDoEscritor(nome = "") {
  const palavras = String(nome).split(/\s+/).filter((p) => p && !/^(d[aeo]s?|e)$/i.test(p));
  return (palavras.length ? palavras : [String(nome)]).slice(0, 2).map((p) => [...p][0]?.toLocaleUpperCase("pt-BR") || "").join("") || "IP";
}

/*
 * DESCOBERTA DE ESCRITORES (UX): temas, busca por nome e destaque na página inicial.
 * Tudo sai só do que já é público: a assinatura dos textos publicados e, quando houver,
 * o perfil visível. Nada é inventado e nenhum dado privado participa.
 */

/* Categorias abordadas pelo escritor, da mais frequente para a menos, com a contagem real. */
export function temasDoEscritor(textos = []) {
  const contagem = new Map();
  for (const post of textos) {
    const id = String(post?.category || "").trim();
    if (id) contagem.set(id, (contagem.get(id) || 0) + 1);
  }
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([id, total]) => ({ id, total }));
}

const semAcentoDeBusca = (valor) => String(valor ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/* Busca por nome (sem acento, qualquer parte, todas as palavras). Termo vazio devolve todos. */
export function filtrarEscritores(escritores = [], termo = "", perfis = new Map()) {
  const palavras = semAcentoDeBusca(termo).split(" ").filter(Boolean);
  if (!palavras.length) return [...escritores];
  return escritores.filter((item) => {
    const nome = semAcentoDeBusca(`${item.nome} ${perfis.get?.(item.slug)?.nome || ""}`);
    return palavras.every((palavra) => nome.includes(palavra));
  });
}

/* Quem aparece na página inicial: os que mais publicaram, depois por nome. */
export function escritoresEmDestaque(escritores = [], limite = 6) {
  return [...escritores]
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, limite);
}

/* Resumo curto da biografia cadastrada (vazio quando não há). Corta em palavra inteira. */
export function resumoDaBio(bio = "", limite = 150) {
  const texto = paragrafosDaBio(bio).join(" ");
  if (texto.length <= limite) return texto;
  return `${texto.slice(0, limite - 1).replace(/\s+\S*$/, "")}…`;
}
