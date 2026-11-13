/*
 * CONHECIMENTO PÚBLICO DO ASSISTENTE — lado do servidor (IA-01).
 *
 * Fontes, todas públicas:
 *   1. {IA_SITE_URL}/ia/conhecimento.json — texto das páginas públicas, gerado no
 *      repositório (scripts/prepare-ia-conhecimento.mjs) e publicado com o site;
 *   2. blog_posts pela REST com a chave PUBLICÁVEL — a política do banco só devolve
 *      o que está no ar (publicado, ou agendado cuja hora chegou);
 *   3. blog_writer_profiles visíveis, também com a chave publicável.
 * Nenhuma consulta usa a chave secreta. Nada de contas, agendamentos ou rascunhos.
 *
 * As regras de normalização, pontuação e links são as mesmas de
 * outputs/js/assistente/conhecimento.js (um teste exige paridade).
 */

export type Documento = { url: string; titulo: string; descricao: string; texto: string; autor?: string; categoria?: string; tipo: "pagina" | "artigo" | "escritor" };
type Fetch = typeof fetch;

export const PAGINAS_DO_ASSISTENTE = [
  "transcender.html", "travessia.html", "quem-somos.html", "recepcao.html", "atendimentos.html",
  "atendimentos-conceito.html", "saude-integrativa.html", "especialistas.html", "profissionais.html",
  "cursos.html", "atividades.html", "programacao.html", "workshops.html", "mentorias.html",
  "grupos-de-estudo.html", "eventos.html", "cultura.html", "experiencias-culturais.html",
  "inspiracao.html", "revista.html", "blog.html", "escritor.html", "marketplace.html", "palacio.html",
];
export const DESTINOS_SEM_CONTEUDO = ["meu-potala.html"];

export const normalizar = (texto: unknown) => String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const VAZIAS = new Set("a o as os de da do das dos e em no na nos nas um uma uns umas para por com sem que qual quais como onde quando eu voce voces me te se ao aos ha tem ter sobre mais menos muito pouco isso esse essa este esta ola oi bom boa dia tarde noite quero queria gostaria saber posso pode podem algum alguma instituto potala".split(" "));

export function termos(texto: unknown): string[] {
  return [...new Set(normalizar(texto).split(" ").filter((t) => t.length > 2 && !VAZIAS.has(t)))].slice(0, 24);
}

export function pontuar<T extends { titulo: string; descricao: string; texto: string; autor?: string; categoria?: string }>(pergunta: unknown, documentos: T[] = []): T[] {
  const busca = termos(pergunta);
  if (!busca.length) return [];
  return documentos
    .map((doc, ordem) => {
      const cabeca = normalizar(`${doc.titulo} ${doc.descricao} ${doc.autor || ""} ${doc.categoria || ""}`);
      const corpo = normalizar(doc.texto);
      let pontos = 0;
      for (const termo of busca) {
        const raiz = termo.length > 5 ? termo.slice(0, 5) : termo;
        if (cabeca.includes(raiz)) pontos += 3;
        if (corpo.includes(raiz)) pontos += 1;
      }
      return { doc, pontos, ordem };
    })
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem)
    .map((x) => x.doc);
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function linkPermitido(url: unknown): string {
  const texto = String(url ?? "").trim().replace(/^\/+/, "");
  const [caminho, consulta = "", ...resto] = texto.split("?");
  if (resto.length) return "";
  if (!PAGINAS_DO_ASSISTENTE.includes(caminho) && !DESTINOS_SEM_CONTEUDO.includes(caminho) && caminho !== "artigo.html") return "";
  if (!consulta) return caminho === "artigo.html" ? "" : caminho;
  const m = consulta.match(/^(post|nome)=([a-z0-9-]{1,140})$/);
  if (!m || !SLUG.test(m[2])) return "";
  if ((caminho === "artigo.html" && m[1] === "post") || (caminho === "escritor.html" && m[1] === "nome")) return `${caminho}?${m[1]}=${m[2]}`;
  return "";
}

/* Mesmo endereço de escritor da P2A (slugifyBlogTitle). Assinatura sem letras latinas fica sem link. */
export function slugDoEscritor(nome: unknown): string {
  const limpo = String(nome ?? "").trim() || "Instituto Potala";
  const slug = limpo.normalize("NFD").replace(/['’]/g, "").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug.slice(0, 120).replace(/-+$/, "");
}

const texto = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const SEM_MARCACAO = (v: string) => v.replace(/\*\*|__|\[([^\]]*)\]\([^)]*\)/g, "$1");

function documentoDoArtigo(doc: Record<string, unknown>): Documento | null {
  const slug = String(doc.slug || doc.id || "");
  if (!SLUG.test(slug)) return null;
  const blocos = Array.isArray(doc.content) ? doc.content as Record<string, unknown>[] : [];
  const corpo = texto(blocos.filter((b) => ["paragraph", "heading", "quote"].includes(String(b?.type))).map((b) => SEM_MARCACAO(String(b.text || ""))).join(" "), 900);
  const descricao = texto(doc.excerpt, 400);
  /* Sem corpo nem resumo não há o que dizer do artigo: só ocuparia o contexto (ex.: posts de teste vazios). */
  if (!corpo && !descricao) return null;
  const autor = texto(doc.author, 120) || "Instituto Potala";
  return {
    tipo: "artigo", url: `artigo.html?post=${slug}`, titulo: texto(doc.title, 200), descricao,
    autor, categoria: texto(doc.category, 60), texto: corpo,
  };
}

/* Carrega e mantém em cache (por instância) a base pública. Falha de uma fonte não derruba as outras. */
export function criarFonteDeConhecimento({ siteUrl, supabaseUrl, chavePublicavel, fetchImpl = fetch, ttlMs = 10 * 60 * 1000, agora = () => Date.now(), timeoutMs = 4000 }: {
  siteUrl: string; supabaseUrl: string; chavePublicavel: string; fetchImpl?: Fetch; ttlMs?: number; agora?: () => number; timeoutMs?: number;
}) {
  let cache: { em: number; docs: Documento[] } | null = null;
  const obter = async (url: string, headers: Record<string, string> = {}) => {
    const r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw new Error(`fonte-${r.status}`);
    return r.json();
  };
  const rest = (caminho: string) => obter(`${supabaseUrl}/rest/v1/${caminho}`, { apikey: chavePublicavel, Authorization: `Bearer ${chavePublicavel}` });

  async function carregar(): Promise<Documento[]> {
    if (cache && agora() - cache.em < ttlMs) return cache.docs;
    const [paginas, posts, perfis] = await Promise.allSettled([
      obter(`${siteUrl.replace(/\/+$/, "")}/ia/conhecimento.json`),
      rest("blog_posts?select=document,status,publish_at"),
      rest("blog_writer_profiles?select=slug,name,bio&visible=eq.true"),
    ]);
    const docs: Documento[] = [];
    if (paginas.status === "fulfilled") {
      for (const p of (paginas.value?.paginas || []) as Record<string, unknown>[]) {
        const url = linkPermitido(p.url);
        if (url) docs.push({ tipo: "pagina", url, titulo: texto(p.titulo, 120), descricao: texto(p.descricao, 300), texto: texto(p.texto, 9000) });
      }
    }
    const escritores = new Map<string, Documento>();
    if (posts.status === "fulfilled" && Array.isArray(posts.value)) {
      for (const linha of posts.value as Record<string, unknown>[]) {
        const artigo = documentoDoArtigo((linha?.document || {}) as Record<string, unknown>);
        if (!artigo) continue;
        docs.push(artigo);
        const slug = slugDoEscritor(artigo.autor);
        if (SLUG.test(slug) && !escritores.has(slug)) {
          escritores.set(slug, { tipo: "escritor", url: `escritor.html?nome=${slug}`, titulo: artigo.autor || "", descricao: `Escritor do Caderno de Travessia (Blog do Instituto Potala).`, texto: "" });
        }
      }
    }
    if (perfis.status === "fulfilled" && Array.isArray(perfis.value)) {
      for (const p of perfis.value as Record<string, unknown>[]) {
        const e = escritores.get(String(p.slug));
        if (e) { e.titulo = texto(p.name, 120) || e.titulo; e.texto = texto(p.bio, 800); }
      }
    }
    docs.push(...escritores.values());
    if (!docs.length) throw new Error("conhecimento-indisponivel");
    cache = { em: agora(), docs };
    return docs;
  }
  return { carregar };
}

/*
 * Monta o contexto da pergunta: até 5 páginas e 4 artigos/escritores mais relevantes,
 * dentro de um orçamento de caracteres. Sem acerto, entram as páginas de orientação
 * (Recepção, Atendimentos, Cursos, Blog) para o modelo poder encaminhar.
 */
/*
 * O trecho da página que interessa à pergunta: janelas de ~450 caracteres pontuadas
 * pelos termos; as melhores entram na ordem original, até o tamanho pedido. Sem acerto,
 * o começo da página (onde ficam título e resumo).
 */
export function trechoRelevante(textoPagina: string, pergunta: string, tamanho: number): string {
  if (textoPagina.length <= tamanho) return textoPagina;
  const busca = termos(pergunta).map((t) => (t.length > 5 ? t.slice(0, 5) : t));
  const janelas: { i: number; texto: string; pontos: number }[] = [];
  for (let i = 0, n = 0; i < textoPagina.length; i += 450, n++) {
    const pedaco = textoPagina.slice(i, i + 450);
    const norm = normalizar(pedaco);
    janelas.push({ i: n, texto: pedaco, pontos: busca.reduce((s, t) => s + (norm.includes(t) ? 1 : 0), 0) });
  }
  const escolhidas = new Set<number>([0]);
  let total = janelas[0].texto.length;
  for (const j of [...janelas].sort((a, b) => b.pontos - a.pontos || a.i - b.i)) {
    if (!j.pontos || total + j.texto.length > tamanho) continue;
    escolhidas.add(j.i);
    total += j.texto.length;
  }
  return janelas.filter((j) => escolhidas.has(j.i)).map((j) => j.texto).join(" … ");
}

export const PAGINAS_DE_ORIENTACAO = ["recepcao.html", "atendimentos.html", "cursos.html", "programacao.html", "blog.html"];

export function montarContexto(pergunta: string, docs: Documento[], { orcamento = 9000 } = {}) {
  const relevantes = pontuar(pergunta, docs);
  const paginas = relevantes.filter((d) => d.tipo === "pagina").slice(0, 5);
  const outros = relevantes.filter((d) => d.tipo !== "pagina").slice(0, 4);
  if (!paginas.length) paginas.push(...docs.filter((d) => d.tipo === "pagina" && PAGINAS_DE_ORIENTACAO.includes(d.url)));
  const escolhidos = [...paginas, ...outros];
  let restante = orcamento;
  const blocos: string[] = [];
  for (const d of escolhidos) {
    const corpo = trechoRelevante(d.texto, pergunta, Math.max(0, Math.min(d.tipo === "pagina" ? 2200 : 700, restante - 300)));
    const bloco = `### ${d.titulo} (${d.tipo})\nlink: ${d.url}${d.autor ? `\nautor: ${d.autor}` : ""}\nresumo: ${d.descricao}\ntrecho: ${corpo}`;
    if (bloco.length > restante) break;
    blocos.push(bloco);
    restante -= bloco.length;
  }
  // Links aceitos na resposta: todas as páginas públicas conhecidas + artigos/escritores que existem de fato.
  const existentes = new Map<string, string>();
  for (const d of docs) existentes.set(d.url, d.titulo);
  return { texto: blocos.join("\n\n"), linksExistentes: existentes, fontes: escolhidos.map((d) => d.url) };
}
