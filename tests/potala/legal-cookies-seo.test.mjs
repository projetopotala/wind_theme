import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readConsent, saveConsent, analyticsAllowed } from "../../outputs/js/shared/privacy-consent.js";
import { activateApprovedAnalytics } from "../../outputs/js/shared/analytics-gate.js";

const ORIGEM = "https://wind-theme.vercel.app";
const PRIVADAS = ["admin.html", "blog-admin.html", "meu-potala.html", "confirmar-conta.html"];
const LEGAIS = ["termos-de-uso", "politica-de-privacidade", "politica-de-cookies", "politica-de-compra-troca-cancelamento"];

const read = relative => readFile(new URL(`../../outputs/${relative}`, import.meta.url), "utf8");
const memory = () => { const values = new Map(); return { getItem:key => values.get(key) ?? null, setItem:(key,value) => values.set(key,value) }; };
const locs = sitemap => [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);

test("quatro rotas legais deixam explícita a dependência de aprovação e não são indexáveis", async () => {
  for (const slug of LEGAIS) {
    const html = await read(`${slug}.html`);
    assert.match(html, /Conteúdo jurídico aguardando aprovação/);
    assert.match(html, new RegExp(`rel="canonical" href="${ORIGEM}/${slug}"`));
    assert.match(html, /privacy-consent\.js/);
    assert.match(html, /name="robots" content="noindex, follow"/, "texto incompleto não pode ser indexado");
    assert.doesNotMatch(html, /oficialmente aprovad/i, "não apresentar como documento aprovado");
  }
});

test("consentimento começa ausente, persiste recusa e permite revisão", () => {
  const storage = memory();
  assert.equal(readConsent(storage), null);
  const denied = saveConsent({ analytics:false }, storage, () => "2026-10-30T12:00:00.000Z");
  assert.deepEqual(denied, { version:1, essential:true, analytics:false, decidedAt:"2026-10-30T12:00:00.000Z" });
  assert.equal(analyticsAllowed(storage), false);
  saveConsent({ analytics:true }, storage, () => "2026-10-30T12:01:00.000Z");
  assert.equal(analyticsAllowed(storage), true);
});

test("consentimento permanece seguro quando localStorage não está disponível", () => {
  const unavailable = { getItem:() => { throw new Error("storage blocked"); }, setItem:() => { throw new Error("storage blocked"); } };
  const denied = saveConsent({ analytics:false }, unavailable, () => "2026-10-30T12:02:00.000Z");
  assert.equal(denied.analytics, false);
  assert.equal(analyticsAllowed(unavailable), false);
});

test("analytics não carrega sem consentimento ou configuração aprovada", () => {
  const appended = [];
  const documentRef = { createElement: () => ({ dataset:{} }), head:{ append: node => appended.push(node) } };
  assert.equal(activateApprovedAnalytics({ documentRef, config:null }), false);
  assert.equal(activateApprovedAnalytics({ documentRef, config:{ approved:false, src:"https://example.test/a.js" } }), false);
  assert.equal(appended.length, 0);
  assert.equal(activateApprovedAnalytics({ documentRef, config:{ approved:true, src:"https://analytics.example.test/a.js" }, isAllowed:() => true }), true);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, "https://analytics.example.test/a.js");
});

test("nenhuma ferramenta de rastreamento é habilitada nas páginas", async () => {
  const { readdirSync } = await import("node:fs");
  const dir = new URL("../../outputs/", import.meta.url);
  for (const file of readdirSync(dir).filter(name => name.endsWith(".html"))) {
    const html = await readFile(new URL(file, dir), "utf8");
    assert.doesNotMatch(html, /googletagmanager|gtag\(|clarity\.ms|hotjar|plausible|fbq\(|connect\.facebook/i, file);
    assert.doesNotMatch(html, /POTALA_ANALYTICS\s*=/, `${file} não pode definir analytics aprovado`);
  }
});

test("sitemap só lista páginas públicas e existentes; jurídicas incompletas e áreas privadas ficam de fora", async () => {
  const sitemap = await read("sitemap.xml");
  const urls = locs(sitemap);
  assert.ok(urls.length > 10);
  for (const url of urls) {
    assert.ok(url.startsWith(`${ORIGEM}/`), `origem canônica provisória em ${url}`);
    const caminho = new URL(url).pathname;
    const arquivo = caminho === "/" ? "index.html" : caminho.endsWith(".html") ? caminho.slice(1) : `${caminho.slice(1)}.html`;
    assert.ok(existsSync(new URL(`../../outputs/${arquivo}`, import.meta.url)), `${url} deve existir na main`);
    const html = await read(arquivo);
    assert.doesNotMatch(html, /name="robots"[^>]*noindex/i, `${url} é noindex`);
  }
  assert.doesNotMatch(sitemap, /institutopotala\.com/);
  assert.doesNotMatch(sitemap, /\/admin|\/blog-admin|\/meu-potala|\/confirmar-conta/);
  for (const slug of LEGAIS) assert.ok(!urls.includes(`${ORIGEM}/${slug}`), `${slug} incompleto fora do sitemap`);
});

test("robots.txt aponta para o sitemap provisório e não conflita com noindex", async () => {
  const robots = await read("robots.txt");
  assert.match(robots, new RegExp(`Sitemap: ${ORIGEM.replaceAll(".", "\\.")}/sitemap\\.xml`));
  assert.doesNotMatch(robots, /institutopotala\.com/);
  const bloqueados = [...robots.matchAll(/^Disallow:\s*(\S+)/gim)].map(match => match[1]);
  for (const file of PRIVADAS) {
    const rota = `/${file.replace(/\.html$/, "")}`;
    assert.match(await read(file), /name="robots"[^>]*noindex/i, `${file} usa noindex`);
    assert.ok(!bloqueados.some(regra => rota.startsWith(regra)), `${rota} está em noindex e não pode estar em Disallow (o robô não leria o noindex)`);
  }
});

test("vercel.json recebe rewrites das páginas públicas sem remover nada e sem destinos inexistentes", async () => {
  const parsed = JSON.parse(await read("vercel.json"));
  assert.deepEqual(parsed.rewrites.slice(0, 2), [
    { source:"/admin", destination:"/admin.html" },
    { source:"/admin/", destination:"/admin.html" },
  ]);
  assert.ok(parsed.rewrites.some(item => item.source === "/meu-potala/:path*" && item.destination === "/meu-potala.html"));
  assert.ok(parsed.rewrites.some(item => item.source === "/politica-de-cookies" && item.destination === "/politica-de-cookies.html"));
  assert.ok(!("redirects" in parsed) && !("trailingSlash" in parsed), "sem mapa legado aprovado, nada de redirects nem trailingSlash");
  for (const item of parsed.rewrites) assert.ok(existsSync(new URL(`../../outputs${item.destination}`, import.meta.url)), `${item.destination} existe`);
});

test("páginas públicas recebem canonical provisório e JSON-LD coerente; áreas privadas permanecem noindex", async () => {
  const publicHtml = await read("quem-somos.html");
  assert.match(publicHtml, new RegExp(`rel="canonical" href="${ORIGEM}/quem-somos"`));
  assert.match(publicHtml, new RegExp(`"url":"${ORIGEM}"`));
  for (const file of ["index.html", "transcendido.html"]) assert.match(await read(file), new RegExp(`"url":"${ORIGEM}"`));
  for (const file of PRIVADAS) assert.match(await read(file), /name="robots"[^>]*noindex/i);
});

test("títulos e descrições públicas são únicos e a raiz tem descrição", async () => {
  const files = ["index.html","atendimentos-conceito.html","atendimentos.html","transcendido.html","profissionais.html"];
  const pages = await Promise.all(files.map(read));
  const titles = pages.map(html => html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]);
  assert.equal(new Set(titles).size, titles.length);
  assert.match(pages[0], /<meta name="description" content="[^"]+">/);
  assert.notEqual(
    pages[1].match(/<meta name="description" content="([^"]+)">/)?.[1],
    pages[3].match(/<meta name="description" content="([^"]+)">/)?.[1],
  );
});

test("CSS preserva 320px sem esconder overflow global", async () => {
  const css = await read("css/legal-privacy.css");
  assert.match(css, /@media \(max-width:390px\)/);
  assert.doesNotMatch(css, /html\s*,\s*body[^}]*overflow-x\s*:\s*hidden/s);
  assert.match(css, /prefers-reduced-motion/);
});

test("consentimento usa border-box: as páginas legais não carregam o reset global e o banner não pode passar da tela", async () => {
  const css = (await read("css/legal-privacy.css")).replace(/\/\*[\s\S]*?\*\//g, "");
  const bloco = css.match(/([^{}]*)\{\s*box-sizing:\s*border-box;?\s*\}/)?.[1] ?? "";
  for (const seletor of [".potala-consent", ".potala-consent *", ".potala-consent-settings", ".potala-consent-settings *", ".potala-consent-manage", ".potala-legal-nav"]) {
    assert.ok(bloco.split(",").map(item => item.trim()).includes(seletor), `falta border-box em ${seletor}`);
  }
  assert.doesNotMatch(bloco, /(^|,)\s*(\*|html|body)\s*(,|$)/, "reset restrito ao consentimento, sem afetar o resto do Portal");
  assert.match(css, /\.potala-consent-settings menu button\s*\{[^}]*min-height:\s*2\.75rem/, "botões do diálogo com área de toque de 44px");
});

test("diálogo devolve foco para um controle que permanece visível", async () => {
  const source = await read("js/shared/privacy-consent.js");
  assert.match(source, /saved && banner\.hidden \? manageButton : dialogOpener/);
});
