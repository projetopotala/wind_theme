/**
 * Gera as rotas legais provisórias, metadados SEO, sitemap.xml, robots.txt e
 * os rewrites das páginas públicas.
 *
 * Garantias (cobertas por tests/potala/legal-seo-protecao.test.mjs):
 *  - NÃO reescreve o vercel.json: lê o arquivo, preserva todas as chaves
 *    (buildCommand, outputDirectory e demais) e os rewrites existentes, e só
 *    acrescenta os rewrites que faltam. Sem buildCommand/outputDirectory o script
 *    aborta, para nunca publicar sem a guarda de ambiente (PR-0).
 *  - A origem canônica precisa estar em HOSTS_OFICIAIS (ambiente.js).
 *  - Páginas jurídicas ainda não aprovadas saem com noindex e fora do sitemap.
 *
 * Troca futura de domínio: ver docs/seo-dominio-canonico.md.
 */
import { readFile, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { HOSTS_OFICIAIS } from "../outputs/js/supabase/ambiente.js";

export const ORIGEM_CANONICA_PROVISORIA = "https://wind-theme.vercel.app";

/** Slugs jurídicos com texto aprovado pelo Instituto. Vazio até a aprovação formal. */
export const LEGAIS_APROVADOS = new Set();

const PAGINAS_PRIVADAS = new Set(["admin.html", "blog-admin.html", "confirmar-conta.html", "meu-potala.html"]);
// Na produção, /blog e /blog/ são rewrites para blog-admin.html (editor, privado). O blog público
// é servido como /blog.html; por isso o canonical dele é fixo e nunca pode ser /blog.
const CANONICO_FIXO = new Map([["blog.html", "/blog.html"]]);
// blog.html é servido direto pelo arquivo: não precisa de rewrite.
const SEM_REWRITE = new Set(["blog.html"]);

const METADADOS = new Map([
  ["index.html", { title: "Instituto Cultural Potala", description: "Portal institucional do Instituto Cultural Potala: atendimentos, profissionais, cursos, eventos, cultura e revista." }],
  ["atendimentos-conceito.html", { title: "Caminhos de Atendimento — Instituto Potala", description: "Conheça os caminhos de cuidado e as modalidades de atendimento apresentadas pelo Instituto Potala." }],
  ["atendimentos.html", { title: "Agendamento de Atendimentos — Instituto Potala" }],
  ["transcendido.html", { title: "Portal Institucional — Instituto Potala" }],
  ["profissionais.html", { title: "Profissionais e Especialidades — Instituto Potala" }],
]);

export const PAGINAS_LEGAIS = [
  ["termos-de-uso", "Termos de Uso", ["Escopo e aceite", "Uso responsável do Portal", "Responsabilidades e contato"]],
  ["politica-de-privacidade", "Política de Privacidade", ["Dados tratados", "Finalidades e bases legais", "Direitos e contato"]],
  ["politica-de-cookies", "Política de Cookies", ["Tecnologias essenciais", "Métricas opcionais", "Como revisar sua escolha"]],
  ["politica-de-compra-troca-cancelamento", "Política de Compra, Troca e Cancelamento", ["Compras e confirmações", "Trocas e cancelamentos", "Prazos e atendimento"]],
];

export function resolverOrigem(valor = process.env.POTALA_ORIGEM_CANONICA || ORIGEM_CANONICA_PROVISORIA) {
  let url;
  try { url = new URL(valor); } catch { throw new Error(`Origem canônica inválida: ${valor}`); }
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`Origem canônica deve ser só https://host (recebido: ${valor})`);
  }
  if (!HOSTS_OFICIAIS.includes(url.hostname)) {
    throw new Error(
      `Origem canônica ${url.origin} não está em HOSTS_OFICIAIS (outputs/js/supabase/ambiente.js). ` +
      "Domínio novo exige aprovação e inclusão explícita lá; ver docs/seo-dominio-canonico.md.",
    );
  }
  return url.origin;
}

/**
 * Acrescenta ao vercel.json existente apenas os rewrites que faltam. Nunca remove
 * nem altera chave ou rewrite já presente.
 */
export function mesclarVercelJson(existente, rewritesGerados) {
  if (!existente || typeof existente !== "object") throw new Error("vercel.json inválido");
  for (const chave of ["buildCommand", "outputDirectory"]) {
    if (typeof existente[chave] !== "string" || !existente[chave]) {
      throw new Error(`vercel.json sem "${chave}": a guarda de ambiente da PR-0 seria perdida; abortando.`);
    }
  }
  const atuais = Array.isArray(existente.rewrites) ? existente.rewrites : [];
  const porOrigem = new Map(atuais.map(item => [item.source, item]));
  const novos = [];
  for (const item of rewritesGerados) {
    const ja = porOrigem.get(item.source);
    if (ja) {
      if (ja.destination !== item.destination) {
        throw new Error(`Conflito de rewrite em ${item.source}: ${ja.destination} x ${item.destination}`);
      }
      continue;
    }
    novos.push(item);
  }
  return { ...existente, rewrites: [...atuais, ...novos] };
}

const semAcentoNoAtributo = texto => texto.replaceAll('"', "&quot;");

export function paginaLegalHtml({ origem, slug, titulo, secoes, aprovado }) {
  const robots = aprovado ? "" : '<meta name="robots" content="noindex, follow">';
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo} — Instituto Potala</title><meta name="description" content="${semAcentoNoAtributo(titulo)} do Instituto Potala. Conteúdo jurídico sujeito à aprovação institucional.">
${robots}<link rel="canonical" href="${origem}/${slug}"><link rel="stylesheet" href="/css/legal-privacy.css">
<script type="module" src="/js/shared/privacy-consent.js"></script><script type="module" src="/js/shared/analytics-gate.js"></script></head>
<body class="legal-page"><a class="skip-link" href="#conteudo">Ir para o conteúdo</a><main class="legal-shell" id="conteudo">
<nav class="legal-breadcrumbs" aria-label="Navegação estrutural"><a href="/transcendido">Portal Potala</a><span aria-hidden="true">/</span><span>${titulo}</span></nav>
<header class="legal-header"><p class="legal-kicker">Informações legais</p><h1>${titulo}</h1>
<p class="legal-status" role="status"><strong>Conteúdo jurídico aguardando aprovação.</strong><br>Esta rota integra a estrutura contratada, mas o texto definitivo será publicado somente após fornecimento ou aprovação formal do Instituto Potala.</p></header>
<div class="legal-sections">${secoes.map(secao => `<section><h2>${secao}</h2><p>Seção reservada para o conteúdo jurídico aprovado pelo Instituto Potala.</p></section>`).join("")}</div>
<footer class="legal-footer"><p>Instituto Cultural Potala</p></footer>
</main></body></html>`;
}

/** Mantém o caminho do canonical existente e troca só a origem; sem canonical, usa o caminho calculado. */
export function definirCanonical(html, origem, caminhoPadrao, forcar = false) {
  const existente = /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/i.exec(html);
  if (existente) {
    let caminho = caminhoPadrao;
    if (!forcar) { try { caminho = new URL(existente[1]).pathname; } catch { /* mantém o padrão */ } }
    return html.replace(existente[0], `<link rel="canonical" href="${origem}${caminho}">`);
  }
  return html.replace(/<\/head>/i, `  <link rel="canonical" href="${origem}${caminhoPadrao}">\n</head>`);
}

export function definirOrganizacao(html, origem) {
  const dados = JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: "Instituto Cultural Potala", url: origem });
  const bloco = `<script type="application/ld+json">${dados}</script>`;
  if (/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/i.test(html)) {
    return html.replace(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/i, bloco);
  }
  return html.replace(/<\/head>/i, `  ${bloco}\n</head>`);
}

const temNoindex = html => /<meta\s+(?=[^>]*name=["']robots["'])(?=[^>]*noindex)[^>]*>/i.test(html);

export async function gerar({ saida = path.resolve("outputs"), origem = resolverOrigem(), legaisAprovados = LEGAIS_APROVADOS } = {}) {
  origem = resolverOrigem(origem);
  // Lê primeiro: se o vercel.json não tiver a guarda de ambiente, nada é escrito.
  const caminhoVercel = path.join(saida, "vercel.json");
  const vercelAtual = JSON.parse(await readFile(caminhoVercel, "utf8"));
  mesclarVercelJson(vercelAtual, []);
  const rotasPrivadas = new Set(
    vercelAtual.rewrites
      .filter(item => PAGINAS_PRIVADAS.has(item.destination.replace(/^\//, "")))
      .map(item => item.source.replace(/\/$/, "") || "/"),
  );

  for (const [slug, titulo, secoes] of PAGINAS_LEGAIS) {
    await writeFile(path.join(saida, `${slug}.html`), paginaLegalHtml({ origem, slug, titulo, secoes, aprovado: legaisAprovados.has(slug) }));
  }

  const legaisSlugs = new Set(PAGINAS_LEGAIS.map(([slug]) => slug));
  const arquivosHtml = readdirSync(saida).filter(arquivo => arquivo.endsWith(".html") && !PAGINAS_PRIVADAS.has(arquivo));
  const noSitemap = [];
  for (const arquivo of arquivosHtml) {
    const alvo = path.join(saida, arquivo);
    let html = await readFile(alvo, "utf8");
    const meta = METADADOS.get(arquivo);
    if (meta?.title) html = html.replace(/<title[^>]*>.*?<\/title>/is, `<title>${meta.title}</title>`);
    if (meta?.description) {
      const descricao = `<meta name="description" content="${meta.description}">`;
      html = /<meta\s+(?=[^>]*name=["']description["'])[^>]*>/i.test(html)
        ? html.replace(/<meta\s+(?=[^>]*name=["']description["'])[^>]*>/i, descricao)
        : html.replace(/<\/head>/i, `  ${descricao}\n</head>`);
    }
    const slug = arquivo === "index.html" ? "/" : `/${arquivo.replace(/\.html$/, "")}`;
    html = definirCanonical(html, origem, CANONICO_FIXO.get(arquivo) ?? slug, CANONICO_FIXO.has(arquivo));
    const canonicoAtual = new URL(/<link\s+rel="canonical"\s+href="([^"]+)"/i.exec(html)[1]).pathname.replace(/\/$/, "");
    if (rotasPrivadas.has(canonicoAtual)) {
      throw new Error(`${arquivo}: canonical ${canonicoAtual} aponta para uma rota administrativa; abortando.`);
    }
    if (!/js\/shared\/privacy-consent\.js/.test(html)) {
      html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="/css/legal-privacy.css">\n  <script type="module" src="/js/shared/privacy-consent.js"></script>\n  <script type="module" src="/js/shared/analytics-gate.js"></script>\n</head>`);
    }
    if (["index.html", "transcendido.html", "quem-somos.html"].includes(arquivo)) html = definirOrganizacao(html, origem);
    await writeFile(alvo, html);

    const nome = arquivo.replace(/\.html$/, "");
    const legalPendente = legaisSlugs.has(nome) && !legaisAprovados.has(nome);
    if (!legalPendente && !temNoindex(html)) noSitemap.push(CANONICO_FIXO.get(arquivo) ?? slug);
  }

  const urls = [...new Set(noSitemap)].sort();
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${origem}${url === "/" ? "/" : url}</loc></url>`).join("\n")}\n</urlset>\n`;
  await writeFile(path.join(saida, "sitemap.xml"), sitemap);
  // Áreas privadas ficam fora do sitemap e carregam meta noindex. Não entram em
  // Disallow: o robot precisa conseguir ler o noindex (regras conflitantes o ocultariam).
  await writeFile(path.join(saida, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${origem}/sitemap.xml\n`);

  const rewritesGerados = arquivosHtml
    .filter(arquivo => arquivo !== "index.html" && !SEM_REWRITE.has(arquivo))
    .map(arquivo => ({ source: `/${arquivo.replace(/\.html$/, "")}`, destination: `/${arquivo}` }));
  const vercel = mesclarVercelJson(vercelAtual, rewritesGerados);
  await writeFile(caminhoVercel, `${JSON.stringify(vercel, null, 2)}\n`);
  return { origem, sitemap: urls, rewritesAdicionados: vercel.rewrites.length - vercelAtual.rewrites.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const resultado = await gerar();
  console.log(`legal-seo: origem ${resultado.origem}, ${resultado.sitemap.length} URLs no sitemap, ${resultado.rewritesAdicionados} rewrites novos.`);
}
