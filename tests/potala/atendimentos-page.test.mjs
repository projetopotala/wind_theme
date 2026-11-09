import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const pageUrl = new URL("../../outputs/atendimentos.html", import.meta.url);
const styleUrl = new URL("../../outputs/css/atendimentos.css", import.meta.url);
const imageUrl = new URL("../../outputs/media/atendimentos-sala-viva.webp", import.meta.url);

test("Atendimentos abre com a fotografia da sala ocupando a cena e o texto editorial sobre ela", async () => {
  const html = await readFile(pageUrl, "utf8");
  const hero = html.match(/<section class="care-hero"[\s\S]*?<\/section>/)?.[0] ?? "";

  assert.match(hero, /<figure class="care-hero-visual cena-viva"/);
  assert.match(hero, /src="media\/atendimentos-sala-viva\.webp"/);
  assert.match(hero, /alt="[^"]*(sala|maca|vela|bambu)[^"]*"/i);
  assert.match(hero, /<div class="care-hero-copy"/);
  assert.match(hero, /<h1[^>]*>Atendimentos<\/h1>/);
  assert.match(hero, /&amp; caminhos para cuidar/i);
  assert.doesNotMatch(html, /atend-vidraca|atend-moldura/);
});

test("a página orienta antes de apresentar possibilidades de atendimento", async () => {
  const html = await readFile(pageUrl, "utf8");

  assert.match(html, /id="orientacao"/);
  assert.match(html, /Compreender vem antes de escolher/i);
  assert.match(html, /id="possibilidades"/);
  assert.match(html, /mais de 150/i);
  assert.match(html, /id="oraculos"/);
  assert.match(html, /id="acesso"/);
  assert.match(html, /presencial e online/i);
  assert.match(html, /atendimento solidário/i);
  assert.match(html, /href="travessia\.html"[^>]*>Voltar à travessia/i);
});

test("a composição se reduz a uma coluna no mobile", async () => {
  const css = await readFile(styleUrl, "utf8");

  assert.match(css, /\.care-hero\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:/s);
  assert.match(css, /@media\s*\(max-width:\s*800px\)[\s\S]*?\.care-hero\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});

test("o título completo cabe na largura de um telefone", async () => {
  const css = await readFile(styleUrl, "utf8");
  const mobileRule = css.match(
    /@media\s*\(max-width:\s*600px\)[\s\S]*?\.care-hero h1\s*\{[^}]*font-size:\s*clamp\([^,]+,\s*([\d.]+)vw/s,
  );

  assert.ok(mobileRule, "a escala mobile do título precisa ser explícita");
  assert.ok(Number(mobileRule[1]) <= 14, "Atendimentos não pode ultrapassar a tela estreita");
});

test("o título permanece dentro da coluna editorial no desktop", async () => {
  const css = await readFile(styleUrl, "utf8");
  const desktopRule = css.match(
    /\.care-hero h1\s*\{[^}]*font-size:\s*clamp\([^,]+,\s*([\d.]+)vw/s,
  );

  assert.ok(desktopRule, "a escala desktop do título precisa ser explícita");
  assert.ok(Number(desktopRule[1]) <= 6, "Atendimentos não pode escapar pela direita");
});

test("a imagem humana possui resolução suficiente para a abertura", async () => {
  await access(imageUrl);
  const metadata = await sharp(fileURLToPath(imageUrl)).metadata();

  assert.ok((metadata.width ?? 0) >= 1200);
  assert.ok((metadata.height ?? 0) >= 900);
});

test("navegação de Atendimentos tem alvos de ~44px e o retorno vai para a Travessia", async () => {
  const html = await readFile(pageUrl, "utf8");
  const css = (await readFile(styleUrl, "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  const redesign = (await readFile(new URL("../../outputs/css/atendimentos-redesign.css", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(html, /<a href="travessia\.html">Voltar à travessia<\/a>/);
  assert.doesNotMatch(html, /href="transcendido\.html"/, "o rodapé não deve voltar para a Home");
  assert.match(css, /\.care-footer a\s*\{[^}]*min-height:\s*44px/);
  assert.match(redesign, /\[data-section="atendimentos"\] \.portal-header__brand\s*\{[^}]*min-height:\s*44px/);
  assert.match(redesign, /\[data-section="atendimentos"\] \.portal-header__nav a\s*\{[^}]*padding-block:\s*16px/);
});

test("cabeçalho: o link Travessia de Atendimentos vai a travessia.html e a marca também leva à Travessia", async () => {
  const { mountPortalHeader } = await import("../../outputs/js/shared/portal-header.js");
  const montar = (opcoes) => {
    let header = null;
    mountPortalHeader({ ...opcoes, documentRef: { querySelector: () => null, createElement: () => ({}), body: { prepend: (h) => { header = h; } } } });
    return header.innerHTML;
  };
  const atendimentos = montar({ current: "atendimentos", travessiaHref: "travessia.html" });
  assert.match(atendimentos, /class="portal-header__brand" href="travessia\.html"/);
  assert.match(atendimentos, /<a href="travessia\.html">Travessia<\/a>/);

  // as outras páginas não mudam: sem a opção, o padrão também é a Travessia
  const padrao = montar({ current: "cursos" });
  assert.match(padrao, /<a href="travessia\.html">Travessia<\/a>/);

  // e só Atendimentos passa a opção
  const secoes = await readFile(new URL("../../outputs/js/secoes.js", import.meta.url), "utf8");
  assert.match(secoes, /mountPortalHeader\(\{ current, \.\.\.\(current === "atendimentos" \? \{ travessiaHref: "travessia\.html" \} : \{\}\) \}\)/);
});