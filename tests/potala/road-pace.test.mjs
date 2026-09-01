import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildJourneyLayout } from "../../outputs/js/home/journey-layout.js";
import { JOURNEY_REGIONS } from "../../outputs/js/home/journey-data.js";

/**
 * A estrada é desenhada num canvas e a câmera corre por ela conforme a rolagem.
 * A velocidade que se vê é uma razão: quantos pixels de estrada passam por pixel
 * de scroll. Ela não está escrita em lugar nenhum — nasce do encontro entre o
 * comprimento dos trechos, aqui, e a altura das seções, no CSS. Este teste é o
 * único lugar onde as duas pontas se olham.
 */

const VIEWPORT = { width: 1440, height: 810 };

/** Altura de uma região, lida do CSS, em múltiplos da altura da tela. */
async function regionHeightInScreens() {
  const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");
    // O par virou a unidade de rolagem: é a altura DELE que diz quanto de estrada
  // passa por passagem. `--region-height` continua existindo, mas descreve o
  // bloco dentro do palco, que não anda com a rolagem.
  const found = css.match(/--pair-height,\s*(\d+(?:\.\d+)?)svh/);
  assert.ok(found, "não achei --pair-height no CSS da jornada");
  return Number(found[1]) / 100;
}

test("a estrada não corre muito mais rápido que a rolagem", async () => {
  const layout = buildJourneyLayout(JOURNEY_REGIONS, VIEWPORT);
  const screens = await regionHeightInScreens();
  const scrollPerRegion = screens * VIEWPORT.height;

  // segments alterna reta e curva; a [2] é a reta da segunda região, sem o
  // comprimento estendido que a primeira e a última recebem.
  const straight = layout.segments[2];
  assert.equal(straight.kind, "straight");

  const pace = straight.length / scrollPerRegion;

  // Acima de ~1,4 a estrada dispara sob os pés de quem lê e a travessia vira
  // corrida; abaixo de ~0,9 ela fica colada na página e perde a vida própria.
  assert.ok(pace > 0.9, `estrada lenta demais: ${pace.toFixed(2)}× a rolagem`);
  assert.ok(pace < 1.4, `estrada rápida demais: ${pace.toFixed(2)}× a rolagem`);
});

test("retas e curvas encolhem juntas, para a estrada não ficar mais agitada", () => {
  const solta = buildJourneyLayout(JOURNEY_REGIONS, VIEWPORT);
  const straight = solta.segments[2];
  const curve = solta.segments[1];

  // A proporção entre reta e curva é o que dá o ritmo do caminho. Escalar só as
  // retas deixaria as curvas mais frequentes — mais agitação, não menos.
  //
  // O teto subiu de 3,2 para 3,6 por medição: com a curva no comprimento antigo,
  // a estrada virava 90° a até 7,6× a velocidade da reta, porque o arco inteiro
  // passava no silêncio curto. Encurtar o arco é o que permite igualar as duas
  // velocidades sem alongar a travessia. Abaixo de 1,4 as curvas voltam a ser
  // longas demais e a travessia vira um zigue-zague.
  const ritmo = straight.length / curve.length;
  assert.ok(ritmo > 1.4 && ritmo < 3.6, `ritmo reta/curva fora de esquadro: ${ritmo.toFixed(2)}`);
});
