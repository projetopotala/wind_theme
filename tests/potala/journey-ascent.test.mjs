import assert from "node:assert/strict";
import test from "node:test";
import { JOURNEY_REGIONS } from "../../outputs/js/home/journey-data.js";
import { buildJourneyLayout } from "../../outputs/js/home/journey-layout.js";
import { ASCENT_HEIGHT } from "../../outputs/js/home/home-scenes.js";

const regioes = JOURNEY_REGIONS.filter((region) => region.type === "region");

test("a subida tem altura própria de rolagem", () => {
  assert.equal(typeof ASCENT_HEIGHT, "number");
  assert.ok(ASCENT_HEIGHT >= 60, `subida curta demais: ${ASCENT_HEIGHT}svh`);
});

test("a estrada ganha um segmento a mais para a subida", () => {
  const layout = buildJourneyLayout(regioes, { width: 1440, height: 900 });
  const retas = layout.segments.filter((s) => s.kind === "straight");
  const curvas = layout.segments.filter((s) => s.kind === "curve");

  // Uma reta por região, mais a reta da subida. Uma curva entre regiões vizinhas.
  assert.equal(retas.length, regioes.length + 1);
  assert.equal(curvas.length, regioes.length - 1);
  assert.equal(layout.segments.at(-1).id, "straight-ascent");
});

test("a contagem de blocos do DOM bate com a de segmentos da estrada", () => {
  const layout = buildJourneyLayout(regioes, { width: 1440, height: 900 });
  // Regiões + silêncios + subida, que é como mountJourney monta os blocos.
  const blocosDom = regioes.length + (regioes.length - 1) + 1;
  assert.equal(
    blocosDom,
    layout.segments.length,
    "desalinhamento entre seções do DOM e segmentos da estrada",
  );
});

test("a subida continua na direção da última região, sem dobra", () => {
  const layout = buildJourneyLayout(regioes, { width: 1440, height: 900 });
  const ultimaRegiao = layout.segments.at(-2);
  const subida = layout.segments.at(-1);
  assert.ok(Math.abs(subida.direction.x - ultimaRegiao.direction.x) < 1e-6);
  assert.ok(Math.abs(subida.direction.y - ultimaRegiao.direction.y) < 1e-6);
});
