import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../../outputs/quem-somos.html", import.meta.url);
const styleUrl = new URL("../../outputs/css/quem-somos.css", import.meta.url);

test("Quem Somos abre com uma composição editorial de texto e imagem", async () => {
  const html = await readFile(pageUrl, "utf8");

  assert.match(html, /<section class="about-hero"/);
  assert.match(html, /<h1[^>]*>[^<]+<\/h1>/);
  assert.match(html, /<figure class="about-hero-visual"/);
  assert.match(html, /src="media\/quem-somos-acolhimento\.webp"/);
  assert.match(html, /alt="[^"]+"/);
});

test("a página conduz da visão humana à história e ao propósito do Instituto", async () => {
  const html = await readFile(pageUrl, "utf8");

  assert.match(html, /id="visao"/);
  assert.match(html, /id="historia"/);
  assert.match(html, /id="ecossistema"/);
  assert.match(html, /26 de maio de 2012/);
  assert.match(html, /Avalokiteshvara/);
  assert.match(html, /class="about-signature"/);
});

test("a página evita catálogo de cards e mantém retorno para a travessia", async () => {
  const html = await readFile(pageUrl, "utf8");

  assert.doesNotMatch(html, /article-group|card-grid|class="card/);
  assert.match(html, /href="transcendido\.html"[^>]*>Voltar à travessia/);
  assert.match(html, /css\/quem-somos\.css/);
});

test("o hero apresenta uma imagem humana de acolhimento", async () => {
  const html = await readFile(pageUrl, "utf8");
  const imageUrl = new URL("../../outputs/media/quem-somos-acolhimento.webp", import.meta.url);

  await access(imageUrl);
  assert.match(html, /src="media\/quem-somos-acolhimento\.webp"/);
  assert.match(html, /alt="[^"]*(pessoas|grupo|encontro)[^"]*"/i);
});

test("a faixa marrom permanece contida no hero e não cobre a seção seguinte", async () => {
  const css = await readFile(styleUrl, "utf8");

  assert.match(css, /--about-earth:\s*#[0-9a-f]{6}/i);
  assert.match(css, /\.about-hero\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.about-hero::before\s*\{[^}]*background:\s*var\(--about-earth\)/s);
});
