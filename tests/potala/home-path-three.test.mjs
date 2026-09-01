import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildRibbonAttributes,
  qualityForViewport,
} from "../../outputs/js/home/home-path-three.js";

/** Reta na diagonal: a normal esperada é conhecida de antemão. */
const diagonal = (t) => ({ x: t, y: t, z: 0 });

test("a fita tem dois vértices por amostra, um de cada lado do eixo", () => {
  const { positions, sides, arcs, indices } = buildRibbonAttributes(diagonal, 4);

  assert.equal(sides.length, 10, "5 amostras × 2 lados");
  assert.equal(positions.length, 30, "3 componentes por vértice");
  assert.deepEqual(sides.slice(0, 4), [-1, 1, -1, 1]);

  // O arco vai de 0 a 1 e é igual nos dois vértices da mesma amostra: é ele que
  // a revelação corta, e um par descasado abriria um dente na ponta da linha.
  assert.equal(arcs[0], 0);
  assert.equal(arcs[1], 0);
  assert.equal(arcs.at(-1), 1);
  assert.deepEqual(arcs.slice(2, 4), [0.25, 0.25]);

  // Dois triângulos por trecho.
  assert.equal(indices.length, 4 * 6);
});

test("a normal é perpendicular à tangente, e não paralela a ela", () => {
  const { normals } = buildRibbonAttributes(diagonal, 4);

  /*
   * O erro fácil neste porte é empurrar o vértice ao longo da tangente em vez
   * da perpendicular: a fita colapsa numa reta de espessura zero e a linha
   * simplesmente some da tela, sem erro nenhum no console.
   */
  const raiz = Math.SQRT1_2;
  for (let i = 0; i < normals.length; i += 2) {
    const [nx, ny] = [normals[i], normals[i + 1]];
    assert.ok(Math.abs(Math.hypot(nx, ny) - 1) < 1e-6, "a normal precisa ser unitária");
    // Tangente da diagonal é (0,707; 0,707); a perpendicular é (-0,707; 0,707).
    assert.ok(Math.abs(nx * raiz + ny * raiz) < 1e-6, "normal e tangente não podem se alinhar");
  }
});

test("a fita acompanha a curva em vez de esticar entre as pontas", () => {
  // Curva em L: se as normais fossem calculadas uma vez só, a metade vertical
  // sairia com a largura da metade horizontal e a quina apareceria.
  const ele = (t) => (t < 0.5 ? { x: t * 2, y: 0, z: 0 } : { x: 1, y: (t - 0.5) * 2, z: 0 });
  const { normals } = buildRibbonAttributes(ele, 8);

  const inicio = [normals[0], normals[1]];
  const fim = [normals.at(-2), normals.at(-1)];
  assert.ok(
    Math.abs(inicio[0] - fim[0]) > 0.5 || Math.abs(inicio[1] - fim[1]) > 0.5,
    "a normal tem que mudar junto com a direção da curva",
  );
});

test("qualidade limita densidade de pixels no desktop e no mobile", () => {
  assert.deepEqual(qualityForViewport({ width: 1440, devicePixelRatio: 3 }), {
    dpr: 1.5,
    segments: 320,
  });
  assert.deepEqual(qualityForViewport({ width: 480, devicePixelRatio: 3 }), {
    dpr: 1.25,
    segments: 220,
  });
});

test("movimento reduzido usa geometria mais leve", () => {
  const quality = qualityForViewport({ width: 1440, devicePixelRatio: 3, reducedMotion: true });
  assert.equal(quality.dpr, 1);
  assert.equal(quality.segments, 160);
});

test("o brilho é uma queda contínua, não uma casca de opacidade fixa", async () => {
  const fonte = await readFile(
    new URL("../../outputs/js/home/home-path-three.js", import.meta.url),
    "utf8",
  );

  /*
   * A técnica é o ponto: núcleo e halo saem de funções da distância ao eixo,
   * calculadas por pixel. Voltar a duas malhas — um tubo dentro do outro — traz
   * de volta a borda dura do halo, que é o que fazia a linha ler como objeto
   * dourado em vez de luz.
   */
  assert.match(fonte, /float core = 1\.0 - smoothstep/, "o núcleo precisa ser um degrau estreito");
  assert.match(fonte, /float glow = exp\(-distance \* distance/, "o halo precisa ser uma gaussiana");
  assert.doesNotMatch(fonte, /TubeGeometry/, "a fita substituiu os tubos");

  // A revelação corta pelo comprimento do arco, e não por intervalo de índices.
  assert.match(fonte, /if \(vArc > uReveal\) discard;/);
});

test("o shader converte a cor para sRGB na saída", async () => {
  const fonte = await readFile(
    new URL("../../outputs/js/home/home-path-three.js", import.meta.url),
    "utf8",
  );

  /*
   * THREE.Color guarda o valor em espaço linear e é o renderizador que o
   * converte de volta na saída — mas só para os materiais dele. Um
   * ShaderMaterial que escreve gl_FragColor direto pula essa etapa, e a cor
   * chega à tela mais escura e mais saturada do que foi pedida, sem erro
   * nenhum: medido, 0xf3e2c2 saía como rgb(229,194,138) até esta linha entrar.
   */
  assert.match(fonte, /#include <colorspace_fragment>/);
});
