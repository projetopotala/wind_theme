import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as homePath from "../../outputs/js/home/home-path-three.js";

const { buildRibbonAttributes, qualityForViewport } = homePath;

test("o trajeto permanece apagado no Bem-vindo e só nasce quando a jornada começa", () => {
  assert.equal(typeof homePath.pathEntranceState, "function");
  const hidden = homePath.pathEntranceState({ active:false, elapsedMs:1800, scrollProgress:.4 });
  const start = homePath.pathEntranceState({ active:true, elapsedMs:0, scrollProgress:0 });
  const middle = homePath.pathEntranceState({ active:true, elapsedMs:900, scrollProgress:0 });
  const end = homePath.pathEntranceState({ active:true, elapsedMs:1800, scrollProgress:0 });

  assert.deepEqual(hidden, { reveal:0, opacity:0, complete:true });
  assert.deepEqual(start, { reveal:0, opacity:0, complete:false });
  assert.ok(middle.reveal > 0 && middle.reveal < .075);
  assert.ok(middle.opacity > 0 && middle.opacity < 1);
  assert.deepEqual(end, { reveal:.075, opacity:1, complete:true });
});

test("o scroll pode conduzir a ponta sem saltar a posição renderizada", () => {
  assert.equal(typeof homePath.advanceHomePathProgress, "function");
  const first = homePath.advanceHomePathProgress(0, .8);
  const second = homePath.advanceHomePathProgress(first, .8);
  assert.ok(first > 0 && first < .8);
  assert.ok(second > first && second < .8);
  assert.equal(homePath.advanceHomePathProgress(.79999, .8), .8);

  const scrolled = homePath.pathEntranceState({ active:true, elapsedMs:200, scrollProgress:.4 });
  assert.equal(scrolled.reveal, .4, "a introdução não pode atrasar quem já rolou");
});

test("movimento reduzido mostra o início do caminho sem animá-lo", () => {
  assert.deepEqual(
    homePath.pathEntranceState({ active:true, elapsedMs:0, scrollProgress:0, reducedMotion:true }),
    { reveal:.075, opacity:1, complete:true },
  );
});

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

test("o trajeto mantém presença sem dominar telas pequenas", () => {
  assert.equal(typeof homePath.pathVisualProfile, "function");

  const celular = homePath.pathVisualProfile({ width: 390, height: 844 });
  const desktop = homePath.pathVisualProfile({ width: 1440, height: 900 });

  assert.ok(celular.ribbonPixels >= 28 && celular.ribbonPixels <= 38);
  assert.ok(celular.offsetPixels <= -70 && celular.offsetPixels >= -125);
  assert.ok(desktop.ribbonPixels >= 44 && desktop.ribbonPixels <= 60);
  assert.equal(desktop.offsetPixels, 0);
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

  /*
   * Duas cores, e a virada acontece onde o núcleo acaba.
   *
   * Chapada, a fita só podia ser uma das duas coisas de que já se reclamou:
   * clara demais lia como arame, dourada demais lia como fio de metal. A
   * mistura reusa "core" de propósito — uma segunda rampa descolaria da
   * primeira e a borda de cor viraria um contorno visível.
   *
   * O coração precisa carregar a cor porque é o único trecho com alfa cheio:
   * medido, o halo cai a 41 de alfa a 4px do eixo e some em 12px. Um coração
   * branco com halo dourado continuava lendo como fio branco.
   */
  assert.match(fonte, /vec3 cor = mix\(uGold, uCore, core\);/);
  assert.match(fonte, /gl_FragColor = vec4\(cor, alpha \* uOpacity\);/);
});

test("a ponta da linha lidera em vez de se apagar", async () => {
  const fonte = await readFile(
    new URL("../../outputs/js/home/home-path-three.js", import.meta.url),
    "utf8",
  );

  /*
   * Só com `discard` a fita terminava numa aresta reta e perpendicular: um toco
   * de ponta chata parado no céu, que era o que mais denunciava a luz como
   * objeto desenhado. A lâmina resolve — mas precisa encolher quando ainda há
   * pouco arco revelado, senão ela e a do começo se cruzam e apagam a linha
   * inteira. Medido antes desse cuidado: nada era desenhado até uns 8% de
   * rolagem, e o trajeto parecia não existir no alto da página.
   */
  assert.match(fonte, /float lamina = min\(uTipFade, uReveal \* 0\.5\);/);
  assert.match(fonte, /float cauda = smoothstep\(0\.0, lamina \* 0\.6, vArc\);/);

  /*
   * A primeira lâmina apagava a ponta ao longo de todo o seu comprimento, e com
   * isso a cabeça da luz virava o trecho mais fraco da fita: medido num quadro
   * de 450px, 15px de largura no rastro contra 9px perto da ponta, sumindo
   * depois. Uma luz que desce tem o contrário disso.
   *
   * As três peças que desfazem aquilo: a fita AFINA na ponta, o corte fecha o
   * último fio de arco, e a brasa acende um halo largo em volta da cabeça.
   */
  assert.match(fonte, /float estreita = mix\(0\.44, 1\.0, smoothstep\(0\.0, lamina, atras\)\);/);
  assert.match(fonte, /float distance = eixo \/ estreita;/);
  assert.match(fonte, /float corte = smoothstep\(0\.0, lamina \* 0\.18, atras\);/);

  /*
   * A brasa mede por "eixo", a distância NOMINAL ao eixo, e não por "distance",
   * que já vem estreitada. Medindo pela estreitada, o afinamento encolhia o
   * halo mais rápido do que a brasa o acendia e a cabeça continuava sendo o
   * trecho mais fino da fita — que é justamente o defeito.
   */
  // A quebra de linha da declaração não é parte do que se afirma aqui.
  const numaLinha = fonte.replace(/\s+/g, " ");
  assert.match(numaLinha, /float brasa = exp\(-eixo \* eixo \/ 5\.0\) \* 0\.19 \* exp\(-\(atras \* atras\) \/ \(lamina \* lamina \* 0\.42\)\) \* uHeadGlow;/);

  // E as três têm de entrar no alfa, senão ficam calculadas e ignoradas.
  assert.match(fonte, /float alpha = clamp\(core \* 0\.94 \+ glow \+ brasa, 0\.0, 1\.0\) \* corte \* cauda;/);
});

test("a câmera mira acima da cabeça, e a luz desce dentro do quadro", async () => {
  const fonte = await readFile(
    new URL("../../outputs/js/home/home-path-three.js", import.meta.url),
    "utf8",
  );

  /*
   * Mirando ABAIXO da cabeça, a ponta da luz parava a 35% do alto do quadro e
   * os dois terços de baixo ficavam sem linha nenhuma — medido lendo os pixels
   * da fita, igual em todos os valores de rolagem, de 0,15 a 1,0. A linha não
   * descia: entrava pelo topo e terminava logo ali. Com a mira acima, a cabeça
   * cai para 57% do quadro e o rastro ocupa o resto.
   *
   * O sinal é o teste: um `-` aqui devolve o defeito inteiro.
   */
  const mira = fonte.match(/camera\.lookAt\([^;]*\);/);
  assert.ok(mira, "a câmera precisa de um alvo explícito");
  assert.match(mira[0], /point\.y \+ 0\.2/);
});

test("o deslocamento em pixels vira unidades de mundo na mesma proporção", async () => {
  const { worldShiftForPixels } = await import("../../outputs/js/home/home-path-three.js");

  const tela = { viewportWidth: 1280, viewportHeight: 800 };
  const meio = worldShiftForPixels({ pixels: 640, ...tela });
  const inteiro = worldShiftForPixels({ pixels: 1280, ...tela });

  /*
   * A grade da página mede em pixels e a cena do trajeto em unidades de mundo
   * vistas por uma câmera em perspectiva. Quando a página abre para um lado, o
   * vão anda — e a linha precisa andar o MESMO tanto, ou passa a cruzar o
   * bloco. Medido no navegador: pedindo 223px a linha andou 228, e pedindo
   * -238 andou -243.
   */
  assert.ok(Math.abs(inteiro - meio * 2) < 1e-9, "a conversão precisa ser linear");
  assert.equal(worldShiftForPixels({ pixels: 0, ...tela }), 0);
  assert.ok(worldShiftForPixels({ pixels: -100, ...tela }) < 0, "o sinal precisa sobreviver");

  /*
   * A largura da janela NÃO entra na conta: a razão de aspecto aparece na
   * largura visível e se cancela com a divisão por viewportWidth, sobrando
   * mundo-por-pixel em função só da altura. Isso é o que se quer — o mesmo
   * deslocamento em pixels move a linha o mesmo tanto em qualquer janela, e é
   * por isso que ela continua dentro do vão numa tela larga.
   */
  const largo = worldShiftForPixels({ pixels: 640, viewportWidth: 2560, viewportHeight: 800 });
  assert.ok(Math.abs(largo - meio) < 1e-9, "a largura da janela não pode mudar o passo");

  const baixo = worldShiftForPixels({ pixels: 640, viewportWidth: 1280, viewportHeight: 400 });
  assert.ok(baixo > meio, "janela mais baixa cobre menos mundo, então cada pixel vale mais");
});

test("a câmera usa o deslocamento lateral, e no sentido contrário", async () => {
  const fonte = await readFile(
    new URL("../../outputs/js/home/home-path-three.js", import.meta.url),
    "utf8",
  );

  // Calcular o deslocamento e não aplicá-lo deixa a linha parada no meio da
  // tela enquanto o vão anda — e o bloco aberto passa por cima dela.
  assert.match(fonte, /const totalLateral = lateral \+ responsiveLateral/);
  assert.match(fonte, /camera\.position\.set\(point\.x \* 0\.12 - totalLateral/);
  assert.match(fonte, /camera\.lookAt\(point\.x \* 0\.22 - totalLateral/);
});
