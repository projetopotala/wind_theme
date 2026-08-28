import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { PAVEMENT_MASK_RATIO, grassBandWidths } from "../../outputs/js/home/home-road.js";

const LADRILHO = "outputs/media/grama-borda.webp";

test("o ladrilho de grama fecha nos quatro lados", async () => {
  const { data, info } = await sharp(LADRILHO).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  assert.equal(width, height, "o ladrilho precisa ser quadrado para repetir nos dois eixos");

  const coluna = (x) => {
    const valores = [];
    for (let y = 0; y < height; y += 1) {
      const i = (y * width + x) * channels;
      valores.push(data[i], data[i + 1], data[i + 2]);
    }
    return valores;
  };
  const linha = (y) => {
    const valores = [];
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      valores.push(data[i], data[i + 1], data[i + 2]);
    }
    return valores;
  };
  const distancia = (a, b) => {
    let soma = 0;
    for (let i = 0; i < a.length; i += 1) soma += Math.abs(a[i] - b[i]);
    return soma / a.length;
  };

  /*
   * A emenda é invisível quando a diferença entre a última e a primeira coluna
   * é da mesma ordem da diferença entre duas colunas vizinhas quaisquer — ou
   * seja, quando a costura não se destaca do ruído natural da textura. Medir
   * contra as vizinhas, e não contra um limiar absoluto, é o que torna o teste
   * independente da densidade de folhas escolhida.
   *
   * Uma folha cortada na margem em vez de reescrita pelo lado oposto (o erro
   * fácil de cometer no gerador) faz essa razão disparar, e a repetição passa a
   * mostrar linhas de grade ao longo de toda a estrada.
   */
  const razaoVertical = distancia(coluna(width - 1), coluna(0)) / distancia(coluna(250), coluna(251));
  const razaoHorizontal = distancia(linha(height - 1), linha(0)) / distancia(linha(250), linha(251));

  assert.ok(razaoVertical < 1.35, `emenda vertical visível: ${razaoVertical.toFixed(2)}×`);
  assert.ok(razaoHorizontal < 1.35, `emenda horizontal visível: ${razaoHorizontal.toFixed(2)}×`);
});

test("a grama começa antes de a pedra acabar, sem coroa de terra entre as duas", () => {
  for (const largura of [96, 132, 170, 218]) {
    const faixa = grassBandWidths(largura);

    // Onde a grama passa a aparecer, contando do eixo da estrada para fora.
    const inicioDaGrama = faixa.inner / 2 - faixa.innerFeather;
    // Onde a máscara do calçamento ainda está pintando pedra.
    const fimDaPedra = (largura * PAVEMENT_MASK_RATIO) / 2;

    assert.ok(
      inicioDaGrama < fimDaPedra,
      `com estrada de ${largura}px sobra terra nua entre pedra e grama`,
    );
    assert.ok(faixa.outer > faixa.inner, "a faixa precisa ter largura dos dois lados");
  }
});

test("a faixa de grama é desenhada antes do calçamento", async () => {
  const fonte = await readFile("outputs/js/home/home-road.js", "utf8");
  const faixa = fonte.indexOf("drawGrassBand(roadWidth, translateX, translateY);");
  const pedra = fonte.indexOf("drawPavement(layers[2].strokeStyle");

  assert.ok(faixa > 0 && pedra > 0);
  // Invertida a ordem, a pedra é coberta pela faixa nas curvas: a máscara da
  // grama é mais larga que a pista e passaria por cima do calçamento.
  assert.ok(faixa < pedra, "a grama tem que sair antes, para a pedra cobrir a sobra");

  // As lâminas que balançam continuam por último — desenhadas antes, a cópia
  // do calçamento as apagaria (o mesmo defeito já corrigido uma vez).
  assert.ok(fonte.indexOf("drawGrass(roadWidth, grassTufts, grassPhase)") > pedra);
});

/**
 * Dublê de contexto 2D que anota o que foi pedido e onde.
 *
 * Guarda a translação acumulada em cada operação porque é exatamente aí que
 * mora o defeito que este arquivo precisa pegar: a textura pintada na
 * translação errada não dá erro nenhum, só gruda a grama no vidro.
 */
function contextoDeMentira() {
  const chamadas = [];
  const pilha = [];
  let tx = 0;
  let ty = 0;
  return {
    chamadas,
    canvas: { width: 800, height: 600 },
    filter: "none",
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineJoin: "",
    lineCap: "",
    globalCompositeOperation: "source-over",
    setTransform() { tx = 0; ty = 0; },
    clearRect() {},
    save() { pilha.push([tx, ty]); },
    restore() { [tx, ty] = pilha.pop() || [0, 0]; },
    translate(x, y) { tx += x; ty += y; },
    stroke() {
      chamadas.push({ tipo: "stroke", tx, ty, lineWidth: this.lineWidth, composite: this.globalCompositeOperation });
    },
    fillRect(x, y) {
      chamadas.push({ tipo: "fillRect", x, y, tx, ty, fillStyle: this.fillStyle, composite: this.globalCompositeOperation });
    },
  };
}

test("a textura da grama fica presa ao chão, não à tela", async () => {
  const { paintGrassBand, grassBandWidths: medidas } = await import("../../outputs/js/home/home-road.js");
  const padrao = { patternMarker: true };
  const alvo = contextoDeMentira();

  paintGrassBand(alvo, {
    path: {},
    band: medidas(200),
    pattern: padrao,
    width: 800,
    height: 600,
    translateX: 137,
    translateY: -412,
  });

  const textura = alvo.chamadas.find((c) => c.tipo === "fillRect" && c.fillStyle === padrao);
  assert.ok(textura, "a textura precisa ser pintada");

  // Sem esta translação a estrada rola por baixo de um gramado imóvel.
  assert.equal(textura.tx, 137);
  assert.equal(textura.ty, -412);
  // E o retângulo recua o mesmo tanto, senão a faixa fica sem textura no
  // pedaço da tela que a translação empurrou para fora.
  assert.equal(textura.x, -137);
  assert.equal(textura.y, 412);
});

test("a máscara é recortada antes de a textura entrar", async () => {
  const { paintGrassBand, grassBandWidths: medidas } = await import("../../outputs/js/home/home-road.js");
  const padrao = { patternMarker: true };
  const alvo = contextoDeMentira();

  paintGrassBand(alvo, {
    path: {},
    band: medidas(200),
    pattern: padrao,
    width: 800,
    height: 600,
    translateX: 10,
    translateY: 20,
  });

  const recorte = alvo.chamadas.findIndex((c) => c.composite === "destination-out");
  const textura = alvo.chamadas.findIndex((c) => c.fillStyle === padrao);
  const banho = alvo.chamadas.findIndex((c) => c.composite === "source-atop");

  // Textura antes do recorte: ela é apagada junto com a pista. Banho antes da
  // textura: ele não tem em que se apoiar e some.
  assert.ok(recorte >= 0 && textura > recorte, "a pista tem que ser apagada antes da textura");
  assert.ok(banho > textura, "o banho quente vem depois da textura");
});

test("sobra miolo cheio entre as duas franjas da orla", () => {
  for (const largura of [96, 132, 170, 218, 400]) {
    const faixa = grassBandWidths(largura);
    const espessura = (faixa.outer - faixa.inner) / 2;
    const miolo = espessura - faixa.outerFeather - faixa.innerFeather;

    /*
     * Franjas somando mais que a espessura da orla deixam a faixa inteira em
     * meio-tom: medido no canvas, 0,2% da grama chegava a opaca e metade ficava
     * abaixo de meio alpha, o que lê como aquarela desbotada ao lado da pedra.
     * O defeito não aparece em nenhum outro teste — a faixa continua sendo
     * desenhada, só que nunca cheia.
     */
    assert.ok(
      miolo > espessura * 0.3,
      `com estrada de ${largura}px a orla é quase só franja (miolo de ${miolo.toFixed(1)}px em ${espessura.toFixed(1)}px)`,
    );
  }
});
