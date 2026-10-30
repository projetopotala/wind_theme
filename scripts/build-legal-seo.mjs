import { readFile, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import path from "node:path";

const output = path.resolve("outputs");
const origin = "https://www.institutopotala.com";
const privatePages = new Set(["admin.html", "blog-admin.html", "confirmar-conta.html", "meu-potala.html"]);
const excluded = new Set(["index.html", "blog.html"]);
const metadata = new Map([
  ["index.html", { title:"Instituto Cultural Potala", description:"Portal institucional do Instituto Cultural Potala: atendimentos, profissionais, cursos, eventos, cultura e revista." }],
  ["atendimentos-conceito.html", { title:"Caminhos de Atendimento — Instituto Potala", description:"Conheça os caminhos de cuidado e as modalidades de atendimento apresentadas pelo Instituto Potala." }],
  ["atendimentos.html", { title:"Agendamento de Atendimentos — Instituto Potala" }],
  ["transcendido.html", { title:"Portal Institucional — Instituto Potala" }],
  ["profissionais.html", { title:"Profissionais e Especialidades — Instituto Potala" }],
  ["profissional.html", { title:"Perfil Profissional — Instituto Potala" }],
]);
const legal = [
  ["termos-de-uso", "Termos de Uso", ["Escopo e aceite", "Uso responsável do Portal", "Responsabilidades e contato"]],
  ["politica-de-privacidade", "Política de Privacidade", ["Dados tratados", "Finalidades e bases legais", "Direitos e contato"]],
  ["politica-de-cookies", "Política de Cookies", ["Tecnologias essenciais", "Métricas opcionais", "Como revisar sua escolha"]],
  ["politica-de-compra-troca-cancelamento", "Política de Compra, Troca e Cancelamento", ["Compras e confirmações", "Trocas e cancelamentos", "Prazos e atendimento"]],
];

const legalHtml = (slug, title, sections) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Instituto Potala</title><meta name="description" content="${title} do Instituto Potala. Conteúdo jurídico sujeito à aprovação institucional.">
<link rel="canonical" href="${origin}/${slug}"><link rel="stylesheet" href="/css/legal-privacy.css">
<script type="module" src="/js/shared/privacy-consent.js"></script><script type="module" src="/js/shared/analytics-gate.js"></script></head>
<body class="legal-page"><a class="skip-link" href="#conteudo">Ir para o conteúdo</a><main class="legal-shell" id="conteudo">
<nav class="legal-breadcrumbs" aria-label="Navegação estrutural"><a href="/transcendido">Portal Potala</a><span aria-hidden="true">/</span><span>${title}</span></nav>
<header class="legal-header"><p class="legal-kicker">Informações legais</p><h1>${title}</h1>
<p class="legal-status" role="status"><strong>Conteúdo jurídico aguardando aprovação.</strong><br>Esta rota integra a estrutura contratada, mas o texto definitivo será publicado somente após fornecimento ou aprovação formal do Instituto Potala.</p></header>
<div class="legal-sections">${sections.map(section => `<section><h2>${section}</h2><p>Seção reservada para o conteúdo jurídico aprovado pelo Instituto Potala.</p></section>`).join("")}</div>
<footer class="legal-footer"><p>Instituto Cultural Potala</p></footer>
</main></body></html>`;

for (const [slug, title, sections] of legal) await writeFile(path.join(output, `${slug}.html`), legalHtml(slug, title, sections));

const htmlFiles = readdirSync(output).filter(file => file.endsWith(".html") && !privatePages.has(file));
for (const file of htmlFiles) {
  const target = path.join(output, file);
  let html = await readFile(target, "utf8");
  const pageMetadata = metadata.get(file);
  if (pageMetadata?.title) html = html.replace(/<title[^>]*>.*?<\/title>/is, `<title>${pageMetadata.title}</title>`);
  if (pageMetadata?.description) {
    const description = `<meta name="description" content="${pageMetadata.description}">`;
    html = /<meta\s+(?=[^>]*name=["']description["'])[^>]*>/i.test(html)
      ? html.replace(/<meta\s+(?=[^>]*name=["']description["'])[^>]*>/i, description)
      : html.replace(/<\/head>/i, `  ${description}\n</head>`);
  }
  const slug = file === "index.html" ? "/" : file === "blog.html" ? "/revista" : `/${file.replace(/\.html$/, "")}`;
  const canonical = `${origin}${slug}`;
  if (!/rel=["']canonical["']/i.test(html)) html = html.replace(/<\/head>/i, `  <link rel="canonical" href="${canonical}">\n</head>`);
  if (!/js\/shared\/privacy-consent\.js/.test(html)) html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="/css/legal-privacy.css">\n  <script type="module" src="/js/shared/privacy-consent.js"></script>\n  <script type="module" src="/js/shared/analytics-gate.js"></script>\n</head>`);
  if (["index.html", "transcendido.html", "quem-somos.html"].includes(file) && !/application\/ld\+json/.test(html)) {
    const data = JSON.stringify({ "@context":"https://schema.org", "@type":"Organization", name:"Instituto Cultural Potala", url:origin });
    html = html.replace(/<\/head>/i, `  <script type="application/ld+json">${data}</script>\n</head>`);
  }
  await writeFile(target, html);
}

const urls = [...new Set([...htmlFiles.filter(file => !excluded.has(file)).map(file => `/${file.replace(/\.html$/, "")}`), ...legal.map(([slug]) => `/${slug}`)])].sort();
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${origin}${url}</loc></url>`).join("\n")}\n</urlset>\n`;
await writeFile(path.join(output, "sitemap.xml"), sitemap);
await writeFile(path.join(output, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /blog-admin\nDisallow: /meu-potala\nDisallow: /confirmar-conta\nSitemap: ${origin}/sitemap.xml\n`);

const publicFiles = htmlFiles.filter(file => !excluded.has(file));
const rewrites = [
  { source:"/admin", destination:"/admin.html" },
  { source:"/admin/", destination:"/admin.html" },
  { source:"/blog", destination:"/blog-admin.html" },
  { source:"/blog/", destination:"/blog-admin.html" },
  { source:"/confirmar-conta", destination:"/confirmar-conta.html" },
  { source:"/confirmar-conta/", destination:"/confirmar-conta.html" },
  { source:"/meu-potala", destination:"/meu-potala.html" },
  { source:"/meu-potala/:path*", destination:"/meu-potala.html" },
  ...publicFiles.map(file => ({ source:`/${file.replace(/\.html$/, "")}`, destination:`/${file}` })),
];
// Redirecionamentos de URLs antigas dependem do mapa aprovado pelo Instituto.
// Rewrites dão URLs amigáveis sem inventar origens ou alterar URLs legadas.
await writeFile(path.join(output, "vercel.json"), `${JSON.stringify({ trailingSlash:false, redirects:[], rewrites }, null, 2)}\n`);
