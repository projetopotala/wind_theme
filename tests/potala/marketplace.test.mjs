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

test("cada região tem direção e ritmo próprios", () => {
  const regioes = JOURNEY_REGIONS.filter((region) => region.type === "region");
  assert.equal(regioes.length, 10);
  assert.ok(DIRECTIONS.length >= regioes.length, `DIRECTIONS tem ${DIRECTIONS.length} para ${regioes.length} regiões`);
  for (let index = 0; index < regioes.length; index += 1) {
    const ritmo = journeyRhythmForIndex(index);
    assert.ok(ritmo.regionHeight > 100, `região ${index} sem altura própria`);
  }
});

test("Marketplace aparece na navegação e no fallback sem script", async () => {
  const secoes = await readFile("outputs/secoes.js", "utf8");
  assert.match(secoes, /marketplace\.html/);
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
