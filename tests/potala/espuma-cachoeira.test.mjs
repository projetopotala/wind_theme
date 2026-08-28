import assert from "node:assert/strict";
import test from "node:test";

import { ARRIVAL_FRAGMENT_SHADER } from "../../outputs/js/chegada/shaders/arrival-fragment.js";

/** O trecho do shader entre dois marcadores de bloco. */
function bloco(marcador, seguinte) {
  const inicio = ARRIVAL_FRAGMENT_SHADER.indexOf(`// ${marcador}`);
  assert.notEqual(inicio, -1, `bloco ${marcador} sumiu do shader`);
  const fim = ARRIVAL_FRAGMENT_SHADER.indexOf(`// ${seguinte}`, inicio);
  assert.notEqual(fim, -1, `bloco ${seguinte} sumiu do shader`);
  return ARRIVAL_FRAGMENT_SHADER.slice(inicio, fim);
}

const ESPUMA = bloco("ESPUMA", "MIST");
const QUEDA = bloco("WATERFALL", "ESPUMA");

test("a espuma nasce onde a queda encontra a água, não ao longo da parede", () => {
  // A interseção das duas máscaras é o poço de impacto. Sem waterMask aqui a
  // espuma acende também sobre a pedra seca atrás da lâmina.
  assert.match(ESPUMA, /float impact = waterfall \* waterMask;/);

  // E o rastro que escapa para o poço tem de excluir o corpo da queda, senão a
  // espuma da água sobe pela parede da cachoeira.
  assert.match(ESPUMA, /spill\s*=\s*waterMask\s*\*\s*\(1\.0 - waterfall\)/);
});

test("a espuma procura a queda ACIMA do pixel, não abaixo", () => {
  /*
   * vUv vem do clip space e as texturas sobem com UNPACK_FLIP_Y_WEBGL: uv.y = 1
   * é o TOPO da tela, então SOMAR em uv.y olha para cima. Trocado o sinal, o
   * rastro de espuma aparece no céu acima da cachoeira em vez de no poço — e
   * nada no shader acusa o erro, porque a conta continua válida.
   */
  const amostras = [...ESPUMA.matchAll(/uv \+ vec2\(0\.0, (0\.\d+)\)/g)].map((m) => Number(m[1]));
  assert.equal(amostras.length, 2, "as duas leituras de altura precisam existir");
  assert.ok(amostras.every((valor) => valor > 0), "somar em uv.y é olhar para cima");

  // Duas alturas diferentes: é a diferença entre elas que faz a espuma decair
  // ao se afastar. Iguais, a faixa volta a ter intensidade constante e lava o
  // poço inteiro de branco — medido, 36% para 52% de pixels claros no poço.
  assert.notEqual(amostras[0], amostras[1]);
});

test("a espuma anda mais devagar que o respingo da queda", () => {
  /*
   * É o que mais denuncia espuma falsa: bolha arrastada pela superfície anda a
   * uma fração da velocidade da água que cai. Se os dois campos correrem no
   * mesmo ritmo, o pé da cachoeira vira um único borrão em movimento.
   */
  const ritmos = (trecho) => [...trecho.matchAll(/uFallPhase \* (\d+\.\d+)/g)].map((m) => Number(m[1]));

  const espuma = ritmos(ESPUMA);
  const queda = ritmos(QUEDA);

  assert.ok(espuma.length >= 2, "a espuma precisa de campos próprios");
  assert.ok(queda.length >= 2, "o corpo da queda precisa dos seus");

  assert.ok(
    Math.max(...espuma) < Math.min(...queda),
    `espuma (até ${Math.max(...espuma)}) tem que ser mais lenta que a queda (a partir de ${Math.min(...queda)})`,
  );
});

test("a espuma é somada e dessaturada, não misturada por cima da água", () => {
  // Misturada, a água por baixo perde o dourado do amanhecer e o poço vira
  // cinza — foi assim que a primeira versão da espuma do pé estragou a cena.
  assert.match(ESPUMA, /color \+= foamMass \* bubbles/);

  // E a dessaturação é o que impede o dourado de tingir a bolha de laranja,
  // desfazendo a leitura de espuma.
  assert.match(ESPUMA, /color = mix\(color, vec3\(dot\(color/);
});

test("a espuma não volta a se apoiar na borda reta da máscara", () => {
  /*
   * A versão anterior tirava a forma de `fallBasin` — a borda de baixo da
   * máscara da cachoeira, que é quase uma reta — e desenhava uma barra acesa
   * atravessando o poço. Foi removida por isso (96b44f6), depois de já ter sido
   * amaciada com ruído sem resolver: o problema não era a textura, era a fonte.
   *
   * A interseção das máscaras e o rastro que escorre dela não têm borda reta
   * para herdar. Este teste existe para que a barra não volte pela porta dos
   * fundos numa próxima mexida na espuma.
   */
  assert.doesNotMatch(
    ESPUMA.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""),
    /fallBasin/,
    "a espuma voltou a se apoiar na borda reta da máscara",
  );
});
