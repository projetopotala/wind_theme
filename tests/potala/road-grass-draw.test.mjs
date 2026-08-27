import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as homeRoad from "../../outputs/js/home/home-road.js";

const homeRoadUrl = new URL("../../outputs/js/home/home-road.js", import.meta.url);

test("o intervalo visível cobre a câmera e descarta o resto da estrada", () => {
  assert.equal(typeof homeRoad.visibleArcRange, "function");

  const layout = { totalLength: 10000 };
  const range = homeRoad.visibleArcRange({
    layout,
    cameraDistance: 5000,
    width: 1440,
    height: 900,
    margin: 200,
  });

  assert.ok(range.from < 5000 && range.to > 5000, "a câmera precisa estar dentro do intervalo");
  assert.ok(range.to - range.from < layout.totalLength, "não pode devolver a estrada inteira");
  assert.ok(range.from >= 0, "não pode pedir arco negativo");
  assert.ok(range.to <= layout.totalLength, "não pode passar do fim da estrada");
});

test("perto das pontas o intervalo encolhe em vez de sair da estrada", () => {
  const layout = { totalLength: 1000 };
  const inicio = homeRoad.visibleArcRange({ layout, cameraDistance: 0, width: 1440, height: 900, margin: 200 });
  const fim = homeRoad.visibleArcRange({ layout, cameraDistance: 1000, width: 1440, height: 900, margin: 200 });
  assert.equal(inicio.from, 0);
  assert.equal(fim.to, 1000);
});

// Correção 1 — a lâmina cresce PELA NORMAL da estrada, para fora da pista, não
// "para cima na tela". Numa estrada vertical, crescer para cima deita a folha
// ao longo do caminho e o calçamento a cobre; estes testes travam a direção.
test("estrada vertical (normal horizontal): a ponta se desloca na horizontal, não na vertical", () => {
  assert.equal(typeof homeRoad.grassBladeGeometry, "function");

  const point = { x: 100, y: 200, normalX: 1, normalY: 0 };
  const tuft = { side: 1, height: 12, lean: 0, phase: 0 };
  const { base, tip } = homeRoad.grassBladeGeometry({ point, tuft, baseRadius: 10, sway: 0 });

  const deslocamentoHorizontal = Math.abs(tip.x - base.x);
  const deslocamentoVertical = Math.abs(tip.y - base.y);

  assert.ok(
    deslocamentoHorizontal > 10,
    `a ponta precisa se afastar da base na horizontal, saiu ${deslocamentoHorizontal}`,
  );
  assert.ok(
    deslocamentoVertical < deslocamentoHorizontal,
    // É isso que falha se alguém reintroduzir `tipY = baseY - height`: o
    // deslocamento vertical dispararia mesmo com a estrada correndo na
    // horizontal (normal apontando para os lados).
    `o deslocamento vertical (${deslocamentoVertical}) precisa ficar pequeno perto do horizontal (${deslocamentoHorizontal})`,
  );
});

test("estrada horizontal (normal vertical): a ponta se desloca na vertical, não na horizontal", () => {
  const point = { x: 100, y: 200, normalX: 0, normalY: 1 };
  const tuft = { side: 1, height: 12, lean: 0, phase: 0 };
  const { base, tip } = homeRoad.grassBladeGeometry({ point, tuft, baseRadius: 10, sway: 0 });

  const deslocamentoHorizontal = Math.abs(tip.x - base.x);
  const deslocamentoVertical = Math.abs(tip.y - base.y);

  assert.ok(
    deslocamentoVertical > 10,
    `a ponta precisa se afastar da base na vertical, saiu ${deslocamentoVertical}`,
  );
  assert.ok(
    deslocamentoHorizontal < deslocamentoVertical,
    `o deslocamento horizontal (${deslocamentoHorizontal}) precisa ficar pequeno perto do vertical (${deslocamentoVertical})`,
  );
});

test("o lado do tufo joga a ponta para lados opostos da estrada", () => {
  const point = { x: 100, y: 200, normalX: 1, normalY: 0 };
  const tuftEsquerda = { side: -1, height: 12, lean: 0, phase: 0 };
  const tuftDireita = { side: 1, height: 12, lean: 0, phase: 0 };

  const esquerda = homeRoad.grassBladeGeometry({ point, tuft: tuftEsquerda, baseRadius: 10, sway: 0 });
  const direita = homeRoad.grassBladeGeometry({ point, tuft: tuftDireita, baseRadius: 10, sway: 0 });

  // As bases também ficam em lados opostos (raio de base aplicado pela normal
  // multiplicada pelo lado).
  assert.ok(esquerda.base.x < point.x, "base do lado -1 precisa ficar antes do centro");
  assert.ok(direita.base.x > point.x, "base do lado 1 precisa ficar depois do centro");
  assert.ok(esquerda.tip.x < point.x, "ponta do lado -1 precisa ficar antes do centro");
  assert.ok(direita.tip.x > point.x, "ponta do lado 1 precisa ficar depois do centro");
});

// Correção 2 — a grama tem que ser desenhada DEPOIS de `drawPavement`. Antes,
// a máscara borrada do calçamento (copiada por cima do canvas inteiro via
// `drawImage`) apagava a grama pintada antes dela. Este teste é estrutural,
// sobre o próprio fonte: garante que ninguém reordene o `draw()` de volta.
test("dentro de draw(), drawGrass é chamado depois de drawPavement", async () => {
  const source = await readFile(homeRoadUrl, "utf8");

  const drawStart = source.indexOf("function draw()");
  assert.notEqual(drawStart, -1, "função draw() não encontrada");
  // Próxima função de nível superior após draw(), para delimitar seu corpo.
  const drawEnd = source.indexOf("\n  function queueDraw()", drawStart);
  assert.notEqual(drawEnd, -1, "fim de draw() não encontrado");
  const body = source.slice(drawStart, drawEnd);

  const pavementCallIndex = body.indexOf("drawPavement(");
  const grassCallIndex = body.indexOf("drawGrass(");

  assert.notEqual(pavementCallIndex, -1, "chamada a drawPavement não encontrada em draw()");
  assert.notEqual(grassCallIndex, -1, "chamada a drawGrass não encontrada em draw()");
  assert.ok(
    grassCallIndex > pavementCallIndex,
    "drawGrass precisa ser chamado depois de drawPavement: drawPavement copia sua " +
      "máscara borrada por cima do canvas inteiro, e se a grama for pintada antes " +
      "essa cópia a apaga",
  );
});
