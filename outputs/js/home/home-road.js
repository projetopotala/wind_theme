import { buildJourneyLayout, sampleSegment } from "./journey-layout.js";
import { GRASS_DEFAULTS, grassSwayOffset, grassTuftsForRange } from "./road-grass.js";

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function locate(layout, progress) {
  const target = clamp(progress) * layout.totalLength;
  let covered = 0;
  for (const segment of layout.segments) {
    if (covered + segment.length >= target) {
      return sampleSegment(segment, (target - covered) / Math.max(1, segment.length));
    }
    covered += segment.length;
  }
  return layout.end;
}

function tracePath(layout) {
  const path = new Path2D();
  const first = layout.segments[0];
  if (!first) return path;
  path.moveTo(
    first.from.x - first.direction.x * layout.height * 3,
    first.from.y - first.direction.y * layout.height * 3,
  );
  for (const segment of layout.segments) {
    if (segment.kind === "curve") {
      if (segment.control1 && segment.control2) {
        path.bezierCurveTo(
          segment.control1.x,
          segment.control1.y,
          segment.control2.x,
          segment.control2.y,
          segment.to.x,
          segment.to.y,
        );
      } else {
        path.quadraticCurveTo(segment.control.x, segment.control.y, segment.to.x, segment.to.y);
      }
    } else {
      path.lineTo(segment.to.x, segment.to.y);
    }
  }
  const last = layout.segments.at(-1);
  path.lineTo(
    last.to.x + last.direction.x * layout.height * 3,
    last.to.y + last.direction.y * layout.height * 3,
  );
  return path;
}

const ROAD_TEXTURE_URL = new URL("../../media/medieval-road-stones.webp", import.meta.url).href;
const GRASS_TEXTURE_URL = new URL("../../media/grama-borda.webp", import.meta.url).href;

/**
 * As quatro camadas do calçamento, da mais larga para a mais estreita.
 *
 * A borda dura vinha de uma faixa marrom opaca 12% mais larga que a textura:
 * sobrava um friso nítido de cada lado e a estrada lia como fita recortada e
 * colada sobre a paisagem. Aqui esse friso vira acostamento borrado, e a textura
 * entra em duas passadas — a de fora translúcida, a de dentro cheia — para a
 * pedra se desfazer na terra em vez de terminar num corte.
 */
export function buildMedievalRoadLayers(baseWidth, texturePattern = null) {
  const width = Math.max(72, Number(baseWidth) || 72);
  const stone = texturePattern || "#b7a487";
  return [
    {
      width: width * 1.34,
      strokeStyle: "rgba(49, 39, 29, .16)",
      shadowColor: "rgba(37, 29, 22, .26)",
      blur: 26,
      shadowOffsetY: 12,
      composite: "source-over",
      lineDash: [],
      alpha: 1,
    },
    {
      width: width * 1.08,
      strokeStyle: "rgba(124, 101, 76, .34)",
      shadowColor: "rgba(96, 76, 55, .28)",
      blur: 15,
      shadowOffsetY: 4,
      composite: "source-over",
      lineDash: [],
      alpha: 1,
    },
    {
      width,
      strokeStyle: stone,
      shadowColor: "transparent",
      blur: 0,
      shadowOffsetY: 0,
      composite: "source-over",
      lineDash: [],
      alpha: .5,
    },
    {
      width: width * .86,
      strokeStyle: stone,
      shadowColor: "transparent",
      blur: 0,
      shadowOffsetY: 0,
      composite: "source-over",
      lineDash: [],
      alpha: 1,
    },
  ];
}

/**
 * Arco da estrada que pode aparecer no quadro.
 *
 * A lista de tufos da estrada inteira é longa e a estrada redesenha a cada
 * quadro de rolagem. Recortar o arco antes de desenhar é o que mantém o custo
 * proporcional ao que se vê, e não ao tamanho da travessia.
 */
export function visibleArcRange({
  layout,
  cameraDistance = 0,
  width = 1440,
  height = 900,
  margin = 200,
} = {}) {
  const total = Math.max(0, Number(layout?.totalLength) || 0);
  // A diagonal cobre o pior caso: estrada atravessando o quadro na diagonal.
  const reach = Math.hypot(width, height) * 0.5 + margin;
  const center = Math.min(total, Math.max(0, Number(cameraDistance) || 0));
  return {
    from: Math.max(0, center - reach),
    to: Math.min(total, center + reach),
  };
}

/**
 * Largura da máscara do calçamento, em múltiplos da largura da estrada.
 *
 * Exportada porque a faixa de grama precisa saber onde a pedra termina: as duas
 * medidas têm de se sobrepor, e mantê-las como números soltos em funções
 * diferentes fazia com que mexer numa abrisse uma falha na outra sem aviso.
 */
export const PAVEMENT_MASK_RATIO = 0.92;

/**
 * Medidas da faixa de grama que ladeia a estrada, em px.
 *
 * `outer` é a largura do traço que forma o corredor inteiro (pista mais os dois
 * acostamentos) e `inner` a do traço que apaga a pista de volta, deixando só as
 * margens. A regra que importa: a grama tem de COMEÇAR antes de a pedra acabar.
 * Se a borda interna da grama nascer depois do fim da máscara do calçamento,
 * abre-se uma coroa de terra nua entre as duas — que é exatamente a borda feia
 * que a grama veio cobrir. Como a pedra é desenhada por cima, a sobreposição
 * não aparece; a falha, sim.
 */
export function grassBandWidths(roadWidth) {
  const road = Math.max(72, Number(roadWidth) || 72);
  // A 2,24 sobrava quase uma pista inteira de grama de cada lado e a faixa
  // competia com a estrada em vez de debruar. O que se quer é acostamento: uma
  // orla estreita, larga o bastante para a folha existir e curta o bastante
  // para o caminho continuar sendo o assunto.
  const outer = road * 1.5;
  const inner = road * 0.98;
  // Espessura da orla de um lado só: é dentro dela que as franjas têm de caber.
  const espessura = (outer - inner) / 2;

  return {
    outer,
    inner,
    /*
     * As franjas saem da espessura da PRÓPRIA orla, não da largura da estrada.
     *
     * Presas à estrada, elas não encolheram junto quando a faixa estreitou, e
     * as duas passaram a somar mais que a orla inteira: a medição no canvas deu
     * 0,2% da grama chegando a opaca e metade dela abaixo de meio alpha. Uma
     * faixa que é só franja lê como aquarela desbotada ao lado da pedra cheia —
     * sobra esfumado e não sobra grama.
     *
     * Proporcionais, sempre resta um miolo cheio entre as duas quedas, seja
     * qual for a largura da estrada.
     */
    outerFeather: Math.max(4, espessura * 0.3),
    innerFeather: Math.max(3, espessura * 0.2),
  };
}

export function computeRoadWidth({ width = 1440 } = {}) {
  const viewportWidth = Math.max(320, Number(width) || 1440);
  return viewportWidth < 720
    ? Math.max(96, Math.min(132, viewportWidth * 0.275))
    : Math.max(170, Math.min(218, viewportWidth * 0.125));
}

/**
 * Geometria de uma lâmina de grama: base, ponto de controle e ponta.
 *
 * A lâmina cresce pela normal da estrada no ponto dado, para fora da pista —
 * nunca "para cima na tela". Numa estrada que corre quase vertical em trechos
 * longos, "para cima na tela" corre junto do caminho, não para fora dele: a
 * lâmina fica deitada sobre o calçamento e `drawPavement` a cobre. Inclinação
 * e oscilação (`sway`) são perpendiculares ao crescimento — é por aí que a
 * folha entorta e balança, mantendo a base presa à borda.
 *
 * `point` é o formato devolvido por `pointAtDistance`: `{ x, y, normalX,
 * normalY }`.
 */
export function grassBladeGeometry({ point, tuft, baseRadius, sway = 0 }) {
  const outX = point.normalX * tuft.side;
  const outY = point.normalY * tuft.side;
  const perpX = -outY;
  const perpY = outX;
  const bend = tuft.lean * tuft.height + sway;

  // Base para dentro da pedra: a lâmina nasce enraizada na borda do
  // calçamento e cavalga a pedra, em vez de flutuar na terra ao lado.
  const baseX = point.x + outX * baseRadius;
  const baseY = point.y + outY * baseRadius;
  const tipX = baseX + outX * tuft.height + perpX * bend;
  const tipY = baseY + outY * tuft.height + perpY * bend;
  const ctrlX = baseX + outX * tuft.height * 0.55 + perpX * bend * 0.4;
  const ctrlY = baseY + outY * tuft.height * 0.55 + perpY * bend * 0.4;

  return {
    base: { x: baseX, y: baseY },
    control: { x: ctrlX, y: ctrlY },
    tip: { x: tipX, y: tipY },
  };
}

/** Banho quente aplicado por cima da grama, para ela caber na paleta sépia. */
export const GRASS_TINT = "rgba(150, 124, 74, .17)";

/**
 * Pinta a faixa de grama numa tela auxiliar.
 *
 * Recebe o contexto em vez de fechá-lo dentro de `createHomeRoad` porque a
 * ordem das operações aqui é toda ela frágil — máscara, recorte, textura,
 * banho — e cada passo trocado de lugar produz um defeito diferente e mudo.
 * Com o contexto por parâmetro, um dublê consegue conferir essa ordem.
 */
export function paintGrassBand(target, {
  path,
  band,
  pattern,
  width = 0,
  height = 0,
  ratio = 1,
  translateX = 0,
  translateY = 0,
} = {}) {
  if (!target || !path || !band || !pattern) return;

  target.setTransform(ratio, 0, 0, ratio, 0, 0);
  target.clearRect(0, 0, width, height);

  // Máscara: o corredor inteiro borrado, com a pista apagada de dentro dele.
  target.save();
  target.translate(translateX, translateY);
  target.lineJoin = "round";
  target.lineCap = "round";

  target.filter = `blur(${band.outerFeather.toFixed(1)}px)`;
  target.strokeStyle = "#fff";
  target.lineWidth = band.outer;
  target.stroke(path);

  target.globalCompositeOperation = "destination-out";
  target.filter = `blur(${band.innerFeather.toFixed(1)}px)`;
  target.lineWidth = band.inner;
  target.stroke(path);

  target.filter = "none";
  target.restore();

  /*
   * A textura é presa ao CHÃO, não à tela.
   *
   * O padrão nasce na origem do sistema de coordenadas atual — pintar sem a
   * translação da câmera prendia a grama ao vidro: a estrada rolava e a folha
   * ficava parada no mesmo pixel, como se a paisagem deslizasse por baixo de um
   * gramado imóvel. Com a mesma translação do traçado, cada folha fica presa ao
   * ponto do chão onde nasceu e acompanha a estrada.
   *
   * O retângulo é recuado pela translação justamente para continuar cobrindo a
   * tela inteira depois de o sistema ter se deslocado.
   *
   * `source-in` mantém só o que está dentro da máscara, então a faixa herda a
   * queda suave das duas bordas em vez de terminar em corte reto.
   */
  target.save();
  target.translate(translateX, translateY);
  target.globalCompositeOperation = "source-in";
  target.fillStyle = pattern;
  target.fillRect(-translateX, -translateY, width, height);
  target.restore();

  // Banho quente: o ladrilho é um verde de meio-dia e a travessia é sépia. Sem
  // ele a faixa lê como decalque colado ao lado da pedra. `source-atop` mantém
  // o recorte já conquistado, então o banho não vaza para fora da faixa.
  target.globalCompositeOperation = "source-atop";
  target.fillStyle = GRASS_TINT;
  target.fillRect(0, 0, width, height);
  target.globalCompositeOperation = "source-over";
}

export function createHomeRoad(canvas, { regions = [], viewport = {} } = {}) {
  if (!canvas) throw new TypeError("canvas é obrigatório para a estrada");
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return { setProgress() {}, resize() {}, destroy() {} };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width = Math.max(320, viewport.width || innerWidth);
  let height = Math.max(480, viewport.height || innerHeight);
  let ratio = Math.min(devicePixelRatio || 1, 1.5);
  let layout = buildJourneyLayout(regions, { width, height });
  let path = tracePath(layout);
  let progress = 0;
  let offsetX = 0;
  let offsetY = 0;
  let renderedProgress = -1;
  let renderedOffset = "";
  let grassPhase = 0;
  // Tempo real do último quadro em que a grama animou — não o dt fixo que a
  // versão anterior assumia (`0.016`, ~1 quadro a 60fps). Assumir dt fixo faz
  // a velocidade da oscilação depender da taxa de quadros do dispositivo;
  // integrar com o tempo real decorrido mantém a mesma velocidade em
  // qualquer taxa.
  let lastGrassTime = 0;
  let frameId = 0;
  let paused = document.hidden;
  let destroyed = false;
  let roadTexture = null;
  let grassTexture = null;
  const textureImage = new Image();
  const grassImage = new Image();
  const pavement = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const pavementContext = pavement ? pavement.getContext("2d", { alpha: true }) : null;
  // Tela separada da do calçamento: as duas são montadas no mesmo quadro e
  // reaproveitar uma só obrigaria a copiar a faixa antes de montar a pedra.
  const shoulder = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const shoulderContext = shoulder ? shoulder.getContext("2d", { alpha: true }) : null;

  function configureCanvas() {
    ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (pavement) {
      pavement.width = canvas.width;
      pavement.height = canvas.height;
    }
    if (shoulder) {
      shoulder.width = canvas.width;
      shoulder.height = canvas.height;
    }
  }

  /** Ponto e normal da estrada a uma distância de arco dada. */
  function pointAtDistance(distance) {
    let covered = 0;
    for (const segment of layout.segments) {
      if (covered + segment.length >= distance) {
        const local = (distance - covered) / Math.max(1, segment.length);
        const here = sampleSegment(segment, local);
        const ahead = sampleSegment(segment, Math.min(1, local + 0.01));
        const dx = ahead.x - here.x;
        const dy = ahead.y - here.y;
        const size = Math.hypot(dx, dy) || 1;
        // Normal é a tangente girada 90°.
        return { x: here.x, y: here.y, normalX: -dy / size, normalY: dx / size };
      }
      covered += segment.length;
    }
    return null;
  }

  /**
   * Desenha a grama nas duas bordas.
   *
   * Cada tufo é posicionado pela normal da curva no ponto correspondente, então
   * a grama acompanha o traçado em vez de ser uma faixa reta ao lado dele.
   * Os tufos chegam prontos (`draw()` já os calculou, para decidir se a
   * animação continua rodando) em vez de recalculados aqui.
   */
  function drawGrass(roadWidth, tufts, phase) {
    if (!tufts.length) return;

    const half = roadWidth * 0.5;
    const baseRadius = half * 0.94;
    context.lineCap = "round";

    for (const tuft of tufts) {
      const point = pointAtDistance(tuft.distance);
      if (!point) continue;
      const sway = reducedMotion ? 0 : grassSwayOffset(tuft, phase);
      const { base, control, tip } = grassBladeGeometry({ point, tuft, baseRadius, sway });

      context.strokeStyle = tuft.height > 12
        ? "rgba(96, 118, 62, .62)"
        : "rgba(118, 132, 76, .5)";
      context.lineWidth = 1.4;
      context.beginPath();
      context.moveTo(base.x, base.y);
      context.quadraticCurveTo(control.x, control.y, tip.x, tip.y);
      context.stroke();
    }
  }

  /**
   * Desenha a faixa de grama que ladeia a estrada.
   *
   * A textura entra como padrão repetido em espaço de tela, e não como imagem
   * esticada ao longo do traçado: esticar sobre uma curva deforma a folha e
   * denuncia a repetição justo onde o olho mais olha. Repetido, o ladrilho
   * cobre qualquer traçado sem deformar — e como grama não tem direção
   * dominante, a repetição não lê como padrão.
   *
   * A forma sai por recorte, não por duas faixas desenhadas de cada lado:
   * traça-se o corredor inteiro borrado e depois a pista é apagada de dentro
   * dele (`destination-out`). Duas faixas paralelas separadas não fecham nas
   * curvas — a de dentro encurta, a de fora estica, e aparecem falhas na
   * quina. O recorte acompanha a curva porque é o mesmo traçado.
   */
  function drawGrassBand(roadWidth, translateX, translateY) {
    if (!shoulder || !grassTexture) return;
    paintGrassBand(shoulderContext, {
      path,
      band: grassBandWidths(roadWidth),
      pattern: grassTexture,
      width,
      height,
      ratio,
      translateX,
      translateY,
    });

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    // Quase opaca: a 0,8 o bege do fundo subia através da grama e a orla lia
    // como aquarela desbotada ao lado da pedra cheia. O que ainda esfuma a
    // faixa nas pontas é a própria máscara, não esta transparência geral.
    context.globalAlpha = 0.97;
    context.drawImage(shoulder, 0, 0);
    context.restore();
  }

  /**
   * Desenha o calçamento com borda desfeita de verdade.
   *
   * Empilhar traços de larguras diferentes só produz degraus de opacidade — a
   * medição na borda dava 56, 178, 255, que o olho lê como faixas. Aqui a forma
   * da estrada é primeiro pintada borrada numa tela auxiliar, virando máscara de
   * transparência contínua, e a textura entra por `source-in` dentro dela. A
   * pedra herda a queda suave da máscara e a estrada termina esfumada na terra.
   */
  function drawPavement(stone, roadWidth, translateX, translateY) {
    if (!pavement) return;
    const feather = Math.max(6, roadWidth * (reducedMotion ? .06 : .1));
    pavementContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    pavementContext.clearRect(0, 0, width, height);
    pavementContext.save();
    pavementContext.translate(translateX, translateY);
    pavementContext.lineJoin = "round";
    pavementContext.lineCap = "round";

    pavementContext.filter = `blur(${feather.toFixed(1)}px)`;
    pavementContext.strokeStyle = "#fff";
    pavementContext.lineWidth = roadWidth * PAVEMENT_MASK_RATIO;
    pavementContext.stroke(path);

    pavementContext.filter = "none";
    pavementContext.globalCompositeOperation = "source-in";
    pavementContext.strokeStyle = stone;
    pavementContext.lineWidth = roadWidth * 1.4;
    pavementContext.stroke(path);

    pavementContext.globalCompositeOperation = "source-over";
    pavementContext.restore();

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(pavement, 0, 0);
    context.restore();
  }

  function draw() {
    frameId = 0;
    if (destroyed || paused) return;

    const now = performance.now();
    // Tolera até 250ms (pausa breve, aba trocada sem passar por
    // visibilitychange) sem deixar a grama saltar de fase; sem o teto, um
    // gap grande no relógio real produziria uma oscilação visível de uma vez.
    const dt = lastGrassTime ? Math.min(0.25, Math.max(0, (now - lastGrassTime) / 1000)) : 0;
    lastGrassTime = now;

    const arc = visibleArcRange({
      layout,
      cameraDistance: progress * layout.totalLength,
      width,
      height,
    });
    const grassTufts = grassTuftsForRange({
      from: arc.from,
      to: arc.to,
      spacing: GRASS_DEFAULTS.spacing,
      seed: 17,
    });
    // A grama balançando é a única coisa que pode mudar num quadro parado —
    // progresso e offset iguais ao quadro anterior. Isso costuma acontecer
    // bem quando o visitante olha a borda da estrada em repouso; sem esta
    // condição o loop de `draw()` parava e a grama congelava exatamente aí.
    // Custo medido como desprezível: ~15 segmentos, ~160 tufos visíveis.
    const animatingGrass = !reducedMotion && grassTufts.length > 0;

    const offsetSignature = `${offsetX.toFixed(1)}:${offsetY.toFixed(1)}`;
    const staticFrame = renderedProgress === progress && renderedOffset === offsetSignature;
    if (staticFrame && !animatingGrass) return;
    renderedProgress = progress;
    renderedOffset = offsetSignature;
    const camera = locate(layout, progress);
    const roadWidth = computeRoadWidth({ width });

    const layers = buildMedievalRoadLayers(roadWidth, roadTexture);
    const translateX = width * .5 + offsetX - camera.x;
    const translateY = height * .54 + offsetY - camera.y;

    context.clearRect(0, 0, width, height);
    context.save();
    context.translate(translateX, translateY);
    context.lineJoin = "round";
    context.lineCap = "round";

    // Sombra no chão e acostamento: são manchas, e o borrão da própria sombra já
    // resolve a borda delas.
    for (const layer of layers.slice(0, 2)) {
      context.globalCompositeOperation = layer.composite;
      context.globalAlpha = layer.alpha ?? 1;
      context.strokeStyle = layer.strokeStyle;
      context.lineWidth = layer.width;
      context.setLineDash(layer.lineDash);
      context.shadowColor = layer.shadowColor;
      context.shadowBlur = reducedMotion ? layer.blur * .45 : layer.blur;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = layer.shadowOffsetY || 0;
      context.stroke(path);
    }

    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.restore();

    // Integra com o tempo real decorrido (`dt`, em segundos) em vez do dt fixo
    // que a versão anterior assumia — mantém o `* 0.9` original, então a
    // velocidade a 60fps não muda, mas passa a valer em qualquer taxa.
    if (animatingGrass) grassPhase += dt * 0.9;
    // Antes do calçamento: a pedra é desenhada por cima e cobre a sobra da
    // faixa, deixando a grama nascer de sob a borda em vez de encostar nela.
    drawGrassBand(roadWidth, translateX, translateY);
    drawPavement(layers[2].strokeStyle, roadWidth, translateX, translateY);

    // A grama tem que ser desenhada DEPOIS do calçamento: `drawPavement` monta
    // sua máscara borrada numa tela auxiliar e a copia por cima de tudo que já
    // estava no canvas. Se a grama for pintada antes, essa cópia a apaga —
    // mesmo com a base cavalgando a borda da pista, como aqui.
    context.save();
    context.translate(translateX, translateY);
    drawGrass(roadWidth, grassTufts, grassPhase);
    context.restore();

    // Sem grama para animar (repouso total ou movimento reduzido) o laço para
    // e só volta a rodar quando `setProgress`/`setOffset` pedirem um quadro.
    // Com grama, ele se mantém sozinho: é isso que faz a oscilação continuar
    // parado numa região, sem depender de o visitante estar rolando.
    if (animatingGrass) queueDraw();
  }

  function queueDraw() {
    if (!frameId && !paused && !destroyed) frameId = requestAnimationFrame(draw);
  }

  function resize(nextViewport = {}) {
    width = Math.max(320, nextViewport.width || innerWidth);
    height = Math.max(480, nextViewport.height || innerHeight);
    layout = buildJourneyLayout(regions, { width, height });
    path = tracePath(layout);
    configureCanvas();
    renderedProgress = -1;
    queueDraw();
  }

  function onVisibilityChange() {
    paused = document.hidden;
    if (paused) {
      cancelAnimationFrame(frameId);
      // O quadro cancelado não executará draw() para liberar este id.
      // Sem zerá-lo, o retorno pelo bfcache limpa o canvas no resize,
      // mas queueDraw() não repinta nem a estrada nem a grama.
      frameId = 0;
    } else {
      renderedProgress = -1;
      // Zera o relógio da grama: sem isso, o próximo quadro mediria o tempo
      // inteiro em que a aba ficou oculta como se fosse um `dt` de animação.
      lastGrassTime = 0;
      queueDraw();
    }
  }

  configureCanvas();
  textureImage.decoding = "async";
  textureImage.onload = () => {
    if (destroyed) return;
    roadTexture = context.createPattern(textureImage, "repeat");
    if (roadTexture?.setTransform && typeof DOMMatrix === "function") {
      // Pedra menor: a 0,64 o paralelepípedo ficava do tamanho de um degrau e a
      // faixa lia como parede de pedra, não como caminho visto de longe.
      roadTexture.setTransform(new DOMMatrix().scale(.46));
    }
    renderedProgress = -1;
    queueDraw();
  };
  textureImage.src = ROAD_TEXTURE_URL;
  grassImage.decoding = "async";
  grassImage.onload = () => {
    if (destroyed) return;
    grassTexture = context.createPattern(grassImage, "repeat");
    if (grassTexture?.setTransform && typeof DOMMatrix === "function") {
      // Folha menor que a pedra: em escala 1 uma única folha tinha o
      // comprimento de meia pista e a faixa lia como mato alto, não como
      // acostamento visto de longe. A 0,34 ainda lia grossa ao lado do
      // paralelepípedo, que é a referência de escala mais próxima que o olho tem.
      grassTexture.setTransform(new DOMMatrix().scale(.26));
    }
    renderedProgress = -1;
    queueDraw();
  };
  grassImage.src = GRASS_TEXTURE_URL;
  document.addEventListener("visibilitychange", onVisibilityChange);
  queueDraw();

  return {
    get layout() { return layout; },
    setProgress(nextProgress) {
      const next = Number(clamp(nextProgress).toFixed(4));
      if (next === progress && renderedProgress >= 0) return;
      progress = next;
      queueDraw();
    },
    setOffset(nextX = 0, nextY = 0) {
      offsetX = Number(nextX) || 0;
      offsetY = Number(nextY) || 0;
      queueDraw();
    },
    resize,
    destroy() {
      destroyed = true;
      textureImage.onload = null;
      grassImage.onload = null;
      cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
