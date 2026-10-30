import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readConsent, saveConsent, analyticsAllowed } from "../../outputs/js/shared/privacy-consent.js";
import { activateApprovedAnalytics } from "../../outputs/js/shared/analytics-gate.js";

const read = relative => readFile(new URL(`../../outputs/${relative}`, import.meta.url), "utf8");
const memory = () => { const values = new Map(); return { getItem:key => values.get(key) ?? null, setItem:(key,value) => values.set(key,value) }; };

test("quatro rotas legais deixam explícita a dependência de aprovação", async () => {
  for (const file of ["termos-de-uso.html","politica-de-privacidade.html","politica-de-cookies.html","politica-de-compra-troca-cancelamento.html"]) {
    const html = await read(file);
    assert.match(html, /Conteúdo jurídico aguardando aprovação/);
    assert.match(html, /rel="canonical"/);
    assert.match(html, /privacy-consent\.js/);
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

test("sitemap, robots e redirects excluem áreas privadas", async () => {
  const [sitemap, robots, config] = await Promise.all([read("sitemap.xml"), read("robots.txt"), read("vercel.json")]);
  assert.match(sitemap, /politica-de-privacidade/);
  assert.doesNotMatch(sitemap, /\/admin|\/meu-potala|\/confirmar-conta/);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Sitemap: https:\/\/www\.institutopotala\.com\/sitemap\.xml/);
  const parsed = JSON.parse(config);
  assert.deepEqual(parsed.redirects, [], "sem mapa legado aprovado, nenhuma origem é inventada");
  assert.deepEqual(parsed.rewrites.slice(0, 2), [
    { source:"/admin", destination:"/admin.html" },
    { source:"/admin/", destination:"/admin.html" },
  ]);
  assert.ok(parsed.rewrites.some(item => item.source === "/meu-potala/:path*" && item.destination === "/meu-potala.html"));
  assert.ok(parsed.rewrites.some(item => item.source === "/politica-de-cookies" && item.destination === "/politica-de-cookies.html"));
});

test("páginas públicas recebem canonical e áreas privadas permanecem noindex", async () => {
  const publicHtml = await read("quem-somos.html");
  assert.match(publicHtml, /rel="canonical" href="https:\/\/www\.institutopotala\.com\/quem-somos"/);
  for (const file of ["admin.html","blog-admin.html","meu-potala.html","confirmar-conta.html"]) assert.match(await read(file), /name="robots"[^>]*noindex/i);
});

test("títulos e descrições públicas são únicos e a raiz tem descrição", async () => {
  const files = ["index.html","atendimentos-conceito.html","atendimentos.html","transcendido.html","profissionais.html","profissional.html"];
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

test("diálogo devolve foco para um controle que permanece visível", async () => {
  const source = await read("js/shared/privacy-consent.js");
  assert.match(source, /saved && banner\.hidden \? manageButton : dialogOpener/);
});
