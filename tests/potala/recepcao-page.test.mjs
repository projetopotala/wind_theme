import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const pageUrl = new URL("../../outputs/recepcao.html", import.meta.url);
const styleUrl = new URL("../../outputs/css/recepcao.css", import.meta.url);
const imageUrl = new URL("../../outputs/media/recepcao-acolhimento.webp", import.meta.url);

test("a Recepção abre como um encontro humano, sem estrelas decorativas", async () => {
  const html = await readFile(pageUrl, "utf8");
  const hero = html.match(/<section class="reception-hero"[\s\S]*?<\/section>/)?.[0] ?? "";

  assert.match(html, /<section class="reception-hero"/);
  assert.match(html, /<h1[^>]*>Recepção<\/h1>/);
  assert.match(html, /src="media\/recepcao-acolhimento\.webp"/);
  assert.match(html, /alt="[^"]*(recepcionista|visitante|conversa)[^"]*"/i);
  assert.doesNotMatch(html, /★|✦|class="[^"]*star/i);
  assert.doesNotMatch(hero, /Você não precisa saber por onde começar|Encontrar um primeiro caminho/i);
});

test("a página oferece todos os destaques permanentes da Recepção", async () => {
  const html = await readFile(pageUrl, "utf8");

  assert.match(html, /Não sei por onde começar/i);
  assert.match(html, /Posso ajudar você\?/i);
  assert.match(html, /Primeira visita/i);
  assert.match(html, /Aconselhamento Holístico/i);
  assert.match(html, /Perguntas Frequentes/i);
  assert.match(html, /Recomendações Inteligentes/i);
  assert.match(html, /Preciso de ajuda/i);
  assert.match(html, /Antes de ir embora/i);
  assert.match(html, /Atendimento humano/i);
  assert.match(html, /Interface em preparação/i);
  assert.doesNotMatch(html, /assistente virtual disponível|IA disponível agora/i);
});

test("a Home e a navegação conduzem para a nova Recepção", async () => {
  const journey = await readFile(new URL("../../outputs/js/home/journey-data.js", import.meta.url), "utf8");
  const home = await readFile(new URL("../../outputs/transcendido.html", import.meta.url), "utf8");

  /*
   * A CHECAGEM MUDOU DE LUGAR, e não de propósito.
   *
   * Ela olhava o menu de treze seções de `secoes.js`, que saiu do ar: as
   * páginas de seção passaram a ter uma barra fina com as portas que a
   * Travessia não oferece (especialistas, workshops, mentorias), e o índice das
   * seções ficou onde sempre esteve de verdade — na jornada da Home.
   *
   * O que o teste protege continua igual: uma seção que existe e não está
   * listada em lugar nenhum é uma página órfã, alcançável só por quem souber a
   * URL de cor.
   */
  assert.match(journey, /id:\s*"recepcao"[\s\S]*?href:\s*"recepcao\.html"/);
  assert.match(home, /recepcao\.html/);
});

test("a imagem da Recepção possui resolução suficiente para o hero", async () => {
  await access(imageUrl);
  const metadata = await sharp(fileURLToPath(imageUrl)).metadata();

  assert.ok((metadata.width ?? 0) >= 1200);
  assert.ok((metadata.height ?? 0) >= 900);
  await access(styleUrl);
});
