import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JOURNEY_REGIONS } from "../../outputs/js/home/journey-data.js";
import { DIRECTIONS } from "../../outputs/js/home/journey-layout.js";
import { journeyRhythmForIndex } from "../../outputs/js/home/home-scenes.js";

test("Marketplace é uma região da travessia", () => {
  const marketplace = JOURNEY_REGIONS.find((region) => region.id === "marketplace");
  assert.ok(marketplace, "região marketplace ausente");
  assert.equal(marketplace.href, "marketplace.html");
  assert.ok(marketplace.title);
  assert.ok(marketplace.description);
});

test("toda regiao recebe direcao e ritmo, quantas forem", () => {
  /*
   * A contagem de regioes deixou de ser fixa: as novidades sao marcadas por tag
   * e podem ser criadas pelo painel. Exigir uma tabela MAIOR que a lista deixou
   * de fazer sentido — as tabelas passaram a ciclar, e o que precisa ser
   * garantido e que nenhum indice caia num buraco.
   *
   * O teste vai bem alem da contagem atual de proposito: e ali, depois do fim
   * das tabelas, que o defeito antigo morava — o indice grudava na ultima
   * entrada e a jornada acelerava sem que nada acusasse.
   */
  const regioes = JOURNEY_REGIONS.filter((region) => region.type === "region");
  assert.ok(regioes.length >= 11, `so ${regioes.length} regioes`);
  assert.ok(DIRECTIONS.length >= 8, "o compasso da estrada ficou curto demais para nao se repetir");

  for (let index = 0; index < regioes.length + 12; index += 1) {
    const ritmo = journeyRhythmForIndex(index);
    assert.ok(ritmo.regionHeight > 100, `indice ${index} sem altura propria`);
    assert.ok(ritmo.silenceHeight > 0, `indice ${index} sem silencio`);
    assert.ok(DIRECTIONS[index % DIRECTIONS.length], `indice ${index} sem direcao`);
  }
});

test("Marketplace aparece no indice das secoes e no fallback sem script", async () => {
  /*
   * A CHECAGEM MUDOU DE LUGAR, e nao de propósito.
   *
   * Ela olhava o menu de treze seções de `seções.js`, que saiu do ar: as
   * páginas de seção passaram a ter uma barra fina com as portas que a
   * Travessia nao oferece (especialistas, workshops, mentorias), e o índice das
   * seções ficou onde sempre esteve de verdade — na jornada da Home.
   *
   * O que o teste protege continua igual: uma seção que existe e não ésta
   * listada em lugar nenhum é uma página órfã, alcançável só por quem souber a
   * URL de cor.
   */
  const jornada = await readFile("outputs/js/home/journey-data.js", "utf8");
  assert.match(jornada, /id: "marketplace"[\s\S]*?href: "marketplace\.html"/);
  const home = await readFile("outputs/transcendido.html", "utf8");
  assert.match(home, /marketplace\.html/);
});

test("a página do Marketplace segue o novo padrão fotográfico das seções", async () => {
  const page = await readFile("outputs/marketplace.html", "utf8");
  assert.match(page, /<body data-section="marketplace"/);
  assert.match(page, /data-section-family="photographic"/);
  assert.match(page, /secoes\.css/);
  assert.match(page, /secoes\.js/);
  assert.match(page, /article-back/);
  // Endereço e telefone reais do instituto, como nas outras páginas.
  assert.match(page, /Rua 24 de Maio, 748/);
  assert.match(page, /\(19\) 3834-6147/);
});
