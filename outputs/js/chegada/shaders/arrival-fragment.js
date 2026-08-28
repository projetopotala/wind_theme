import { SHADER_NOISE } from "./shader-noise.js";

export const ARRIVAL_FRAGMENT_SHADER = `
  // As fases de água, queda e nuvem são acumuladas na CPU e chegam já somadas,
  // então crescem sem limite ao longo da sessão. Em mediump (16 bits) uma fase
  // na casa das centenas perde a parte fracionária e o ruído congela em degraus;
  // por isso o fragmento pede highp e só cai para mediump onde não existir.
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif

  varying vec2 vUv;
  uniform sampler2D uImage;
  uniform sampler2D uDepth;
  uniform sampler2D uWaterMask;
  uniform sampler2D uWaterfallMask;
  uniform sampler2D uCanopyMask;
  uniform sampler2D uMistMask;
  uniform sampler2D uSkyMask;
  uniform vec2 uPointer;
  uniform vec2 uResolution;
  uniform vec2 uImageSize;
  uniform float uCamera;
  uniform float uDepthAmount;
  uniform float uFog;
  uniform float uLight;
  uniform float uPath;
  uniform float uTime;
  uniform float uRiverMotion;
  uniform float uWind;
  uniform vec2 uWindDir;
  uniform float uSun;
  uniform float uMistReveal;
  uniform float uAttention;
  uniform vec2 uAttentionUv;
  uniform float uHasWaterMask;
  uniform float uHasWaterfallMask;
  uniform float uHasCanopyMask;
  uniform float uHasMistMask;
  uniform float uHasSkyMask;
  uniform float uClouds;
  // Fases integradas na CPU. Elas nunca podem ser reconstruídas aqui como
  // tempo × velocidade: a velocidade muda quando o visitante encosta num lugar,
  // e o produto salta junto — é o que fazia a cachoeira e a nuvem piscarem.
  uniform float uRiverPhase;
  uniform float uFallPhase;
  uniform vec2 uCloudDrift;
  uniform vec2 uRippleUv;
  uniform float uRippleTime;
  uniform float uRippleStrength;
  uniform float uOverscan;
  uniform float uCameraZoom;
  uniform float uFarParallax;
  uniform float uNearParallax;
  uniform float uCanopyMaxUv;
  uniform float uWaterMaxUv;
  uniform float uWaterfallMaxUv;
  uniform float uDebugView;
  uniform float uDebugMaskMix;

  ${SHADER_NOISE}

  vec2 coverUv(vec2 uv) {
    float viewportAspect = uResolution.x / max(uResolution.y, 1.0);
    float imageAspect = uImageSize.x / max(uImageSize.y, 1.0);
    vec2 result = uv;
    if (viewportAspect > imageAspect) {
      result.y = (uv.y - 0.5) * (imageAspect / viewportAspect) + 0.5;
    } else {
      result.x = (uv.x - 0.5) * (viewportAspect / imageAspect) + 0.5;
    }
    return result;
  }

  float maskValue(sampler2D map, vec2 uv, float enabled) {
    return mix(0.0, texture2D(map, uv).r, enabled);
  }

  void main() {
    vec2 sceneUv = 0.5 + (coverUv(vUv) - 0.5) * uOverscan;
    float zoom = 1.0 - uCamera * uCameraZoom;
    sceneUv = 0.5 + (sceneUv - 0.5) * zoom;
    sceneUv.y -= uCamera * 0.004 * (texture2D(uDepth, clamp(sceneUv, 0.002, 0.998)).r);

    float depth = texture2D(uDepth, clamp(sceneUv, 0.002, 0.998)).r;
    float nearFactor = smoothstep(0.32, 0.86, depth);
    vec2 pointerParallax = uPointer
      * mix(uFarParallax, uNearParallax, nearFactor)
      * max(uDepthAmount, 0.35);

    // DEPTH PARALLAX
    vec2 uv = sceneUv + pointerParallax;

    float waterMask = maskValue(uWaterMask, uv, uHasWaterMask);
    float waterfall = maskValue(uWaterfallMask, uv, uHasWaterfallMask);
    float canopy = maskValue(uCanopyMask, uv, uHasCanopyMask);
    float mistMask = maskValue(uMistMask, uv, uHasMistMask);

    float attentionDistance = distance(uv, uAttentionUv);
    float attentionField = uAttention * exp(-attentionDistance * attentionDistance * 42.0);

    // CANOPY
    vec2 wind = normalize(uWindDir + vec2(0.0001, 0.0));
    float branch = noise(uv * 7.0 + vec2(uTime * 0.11, 0.0));
    float leaf = noise(uv * 28.0 + vec2(uTime * 0.55, uTime * 0.18));
    vec2 canopyWarp = (
        wind * (branch - 0.5) * 0.65
        + vec2(leaf - 0.5, (leaf - 0.5) * 0.35) * 0.35
      ) * canopy * uCanopyMaxUv * (0.45 + uWind);

    // WATER
    float flow = uRiverPhase;
    float n1 = noise(uv * vec2(18.0, 11.0) + vec2(flow * 0.8, flow * 0.15));
    float n2 = noise(uv * vec2(42.0, 26.0) - vec2(flow * 1.4, flow * 0.2));
    vec2 waterWarp = vec2(n1 - 0.5, n2 - 0.5) * waterMask * uWaterMaxUv * max(uRiverMotion, 0.4);

    float rippleAge = max(uRippleTime, 0.0);
    float rippleWave = sin(distance(uv, uRippleUv) * 70.0 - rippleAge * 7.0);
    vec2 rippleWarp = vec2(rippleWave) * 0.0007 * uRippleStrength * waterMask
      * (1.0 - smoothstep(0.0, 0.16, distance(uv, uRippleUv)));

    // WATERFALL
    // A máscara é lida de novo um pouco acima e um pouco abaixo do pixel. Onde
    // ela some logo abaixo estamos no pé da queda (espuma); onde some logo acima
    // estamos no lábio, onde a água ainda desce lisa. Isso separa as três
    // leituras que fazem uma cachoeira parecer cachoeira sem geometria nova.
    //
    // O deslocamento é maior que os filetes e as pedras dentro da máscara — ela
    // é fina, não é um bloco — para que a leitura pegue a borda de verdade da
    // queda e não cada vão entre dois fios de água.
    //
    // ATENÇÃO À ORIENTAÇÃO. vUv vem do clip space, onde y = +1 é o topo, e as
    // texturas sobem com UNPACK_FLIP_Y_WEBGL. Então uv.y = 1 é o TOPO da tela e
    // descer é DIMINUIR uv.y — o contrário do que a intuição de imagem sugere.
    // fallY inverte isso de uma vez: tudo na queda é escrito nela, onde somar
    // significa descer, e nenhuma linha abaixo precisa lembrar do sinal.
    float fallY = -uv.y;
    float fallBelow = maskValue(uWaterfallMask, uv - vec2(0.0, 0.020), uHasWaterfallMask);
    float fallAbove = maskValue(uWaterfallMask, uv + vec2(0.0, 0.014), uHasWaterfallMask);
    float fallBody = waterfall * smoothstep(0.12, 0.5, fallBelow);
    float fallBasin = waterfall * smoothstep(0.5, 0.1, fallBelow);
    float fallLip = waterfall * smoothstep(0.45, 0.08, fallAbove);

    // O ruído é achatado no eixo y e apertado no x: cada célula vira um filete
    // vertical, que é o que o olho lê como queda. Três camadas em velocidades
    // diferentes dão o véu ao fundo, o fio à frente e o respingo por cima.
    float veil = noise(vec2(uv.x * 150.0, fallY * 16.0 - uFallPhase));
    float strand = noise(vec2(uv.x * 74.0, fallY * 10.0 - uFallPhase * 1.62));
    float spray = noise(vec2(uv.x * 40.0, fallY * 30.0 - uFallPhase * 2.45));
    float churn = noise(vec2(uv.x * 56.0 + uFallPhase * 0.5, fallY * 46.0 - uFallPhase * 3.1));
    float fallEnergy = mix(0.78, 1.16, uRiverMotion);

    vec2 fallWarp = vec2(
      (strand - 0.5) * 0.24 + (churn - 0.5) * 0.5 * fallBasin,
      (veil - 0.5) + (spray - 0.5) * 0.55
    ) * waterfall * uWaterfallMaxUv * fallEnergy;

    uv = clamp(uv + canopyWarp + waterWarp + rippleWarp + fallWarp, 0.001, 0.999);
    vec3 color = texture2D(uImage, uv).rgb;

    float glint = smoothstep(0.62, 0.9, n2) * smoothstep(0.48, 0.82, n1);
    color += waterMask * glint * vec3(0.11, 0.1, 0.08) * max(uRiverMotion, 0.4);
    color *= 1.0 - waterMask * (0.02 + n1 * 0.03);

    // Corpo da queda: filetes claros e vãos escuros. Sem os vãos a água vira um
    // borrão branco chapado e perde a velocidade.
    float streaks = smoothstep(0.40, 0.86, veil * 0.55 + strand * 0.55);
    color += fallBody * pow(streaks, 2.0) * vec3(0.24, 0.25, 0.26) * fallEnergy;
    color -= fallBody * (1.0 - streaks) * vec3(0.05, 0.05, 0.045);

    // Lábio: um brilho fino e contínuo onde a lâmina ainda não se quebrou.
    color += fallLip * pow(veil, 3.0) * vec3(0.12, 0.13, 0.14);

    // ESPUMA
    //
    // Três coisas separam espuma de água clara, e o corpo da queda já tinha só
    // a primeira:
    //
    // 1. Ela nasce no IMPACTO, não ao longo da queda. A interseção das duas
    //    máscaras — a da cachoeira com a da água — é exatamente o poço onde a
    //    lâmina bate, e era o único sinal da cena que nada usava.
    // 2. Ela ESCAPA para o poço. A máscara da queda termina na linha d'água,
    //    mas a espuma não: ela é carregada para fora, sobre o rio. Amostrar a
    //    máscara bem acima do pixel diz "tem queda em cima de mim" e desenha
    //    esse rastro onde máscara nenhuma alcança.
    // 3. Ela é LENTA. É o que mais denuncia espuma falsa: bolha arrastada pela
    //    superfície anda a uma fração da velocidade da água que cai. Por isso a
    //    fase destes campos é multiplicada por 0,3 e não pelos 2,4–3,1 dos
    //    respingos — mesma cena, tempos diferentes.
    //
    // ATENÇÃO À ORIENTAÇÃO: como no bloco acima, uv.y = 1 é o TOPO, então somar
    // em uv.y olha para CIMA. fallOverhead procura a queda acima do pixel.
    float impact = waterfall * waterMask;
    // Duas leituras a alturas diferentes fazem a espuma DECAIR ao se afastar da
    // queda. Com uma só, a faixa saía de intensidade constante e lavava o poço
    // inteiro de branco — medido, 36% para 52% de pixels claros no poço, o que
    // o olho lê como neblina baixa e não como espuma. Perto da queda as duas
    // acusam água caindo em cima; longe, só a mais alta, e sobra pouco mais de
    // um quarto da força.
    float over1 = maskValue(uWaterfallMask, uv + vec2(0.0, 0.028), uHasWaterfallMask);
    float over2 = maskValue(uWaterfallMask, uv + vec2(0.0, 0.078), uHasWaterfallMask);
    // O fator (1 - waterfall) tira daqui o que já é corpo de queda: este termo é só
    // o que sobrou boiando na água aberta, senão a espuma do poço subiria pela
    // parede da cachoeira.
    float spill = waterMask * (1.0 - waterfall)
      * (smoothstep(0.12, 0.55, over1) * 0.74 + smoothstep(0.12, 0.55, over2) * 0.26);

    // Bolhas em duas escalas: aglomerados grandes que se desfazem devagar e uma
    // granulação fina por dentro deles. Uma escala só lê como chapa de tinta.
    float foamCells = noise(vec2(uv.x * 30.0 - uFallPhase * 0.16, uv.y * 21.0 - uFallPhase * 0.30));
    float foamGrain = noise(vec2(uv.x * 88.0 + uFallPhase * 0.22, uv.y * 54.0 - uFallPhase * 0.38));
    // Janela estreita de propósito: aberta (0,40–0,82) a soma quase nunca saía
    // dos meios-tons e a espuma virava um lençol uniforme. Apertada, cada
    // aglomerado se fecha numa bolha com vão escuro ao lado — que é o que dá a
    // leitura de espuma em vez de tinta branca.
    float bubbles = smoothstep(0.50, 0.74, foamCells * 0.62 + foamGrain * 0.5);

    // NADA AQUI SE APOIA EM fallBasin, e isso é deliberado.
    //
    // A versão anterior da espuma tirava a forma da borda de baixo da máscara,
    // que é quase uma reta — e desenhava uma barra acesa atravessando o poço.
    // Foi por isso que ela foi removida (96b44f6). Amaciar aquela barra com
    // ruído já tinha sido tentado e não bastou: o problema não era a textura,
    // era a fonte. A interseção das máscaras e o rastro que escorre dela não
    // têm borda reta nenhuma para herdar.
    //
    // O impacto pesa mais que o rastro: é ali que a lâmina bate.
    float foamMass = clamp(impact * 1.9 + spill * 0.8, 0.0, 1.0);

    // Duas camadas: o véu leitoso que a espuma deixa mesmo entre as bolhas, e as
    // bolhas em si por cima dele. Só as bolhas dá renda vazada; só o véu dá
    // neblina. Juntos dão espuma.
    color += foamMass * vec3(0.055, 0.060, 0.065) * fallEnergy;
    color += foamMass * bubbles * vec3(0.34, 0.35, 0.355) * fallEnergy;
    // Espuma é branca: o pouco de dessaturação aqui é o que impede o dourado do
    // amanhecer de tingir a bolha de laranja e desfazer a leitura.
    color = mix(color, vec3(dot(color, vec3(0.33))), foamMass * bubbles * 0.16);

    // Névoa que sobe do impacto. Frequência baixa e fase lenta: é ar com água,
    // não respingo — respingo já existe no corpo da queda, e repetir o mesmo
    // ritmo aqui achataria os dois num borrão só.
    float plume = noise(vec2(uv.x * 11.0 + uFallPhase * 0.07, fallY * 8.0 - uFallPhase * 0.44));
    color += impact * smoothstep(0.34, 0.86, plume) * vec3(0.075, 0.080, 0.085);

    // MIST
    float mistA = noise(vec2(uv.x * 1.6 + uTime * 0.018, uv.y * 3.0));
    float mistB = noise(vec2(uv.x * 0.8 - uTime * 0.031, uv.y * 1.7 + uTime * 0.008));
    float mist = smoothstep(0.28, 0.78, mix(mistA, mistB, 0.48)) * mistMask * uFog;
    mist *= 1.0 - uMistReveal * 0.72;
    color = mix(color, vec3(0.86, 0.88, 0.90), mist * 0.22);

    // LIGHTING
    float sky = smoothstep(0.48, 0.16, sceneUv.y);
    color *= 1.0 + sky * uSun * 0.1;
    color += sky * uSun * vec3(0.06, 0.045, 0.016);

    // CLOUDS
    // A máscara de céu recorta a serra, então a nuvem nunca pinta sobre a
    // montanha: ela desaparece na cumeada e reaparece do outro lado, que é o que
    // dá a leitura de estar passando por trás. Como o bloco entra depois do
    // brilho do sol e antes da graduação final, o miolo denso encobre o disco e
    // ainda recebe a luz geral da cena.
    float skyMask = maskValue(uSkyMask, uv, uHasSkyMask);
    vec2 cloudDrift = uCloudDrift;

    // Duas camadas em velocidades diferentes dão paralaxe entre a massa alta e o
    // detalhe baixo. A janela estreita do smoothstep é o que separa nuvem de
    // névoa: aberta demais, o campo inteiro vira véu cinza e apaga o amanhecer.
    float bank = fbm(uv * vec2(7.5, 11.0) + cloudDrift * 0.55);
    float detail = fbm(uv * vec2(15.75, 20.9) - cloudDrift * 2.1 + 17.3);
    float field = bank * 0.68 + detail * 0.42;

    float density = smoothstep(0.53, 0.65, field);
    float lit = smoothstep(0.56, 0.75, field);
    vec3 cloudTone = mix(
      vec3(0.74, 0.75, 0.80),
      mix(vec3(0.97, 0.95, 0.92), vec3(1.0, 0.94, 0.80), uSun),
      lit
    );

    float cloud = density * skyMask * uClouds;
    color = mix(color, cloudTone, cloud * 0.75);
    color += cloud * (1.0 - cloud) * uSun * vec3(0.10, 0.075, 0.035);

    color *= 0.92 + uLight * 0.2;
    color += attentionField * vec3(0.045, 0.035, 0.02);
    color = mix(color, color + vec3(0.07, 0.05, 0.025), uPath * 0.12 * (1.0 - mistMask));

    if (uDebugView > 0.5 && uDebugView < 1.5) {
      color = vec3(depth);
    } else if (uDebugView > 1.5 && uDebugView < 2.5) {
      color = mix(color, vec3(waterMask, 0.15, waterMask), max(uDebugMaskMix, 0.5));
    } else if (uDebugView > 2.5 && uDebugView < 3.5) {
      color = mix(color, vec3(waterfall, 0.2, 0.8), max(uDebugMaskMix, 0.5));
    } else if (uDebugView > 3.5 && uDebugView < 4.5) {
      color = mix(color, vec3(0.15, canopy, 0.2), max(uDebugMaskMix, 0.5));
    } else if (uDebugView > 4.5 && uDebugView < 5.5) {
      color = mix(color, vec3(mistMask), max(uDebugMaskMix, 0.5));
    } else if (uDebugView > 5.5 && uDebugView < 6.5) {
      color = texture2D(uImage, clamp(sceneUv, 0.001, 0.999)).rgb;
    } else if (uDebugView > 6.5 && uDebugView < 7.5) {
      color = mix(color, vec3(0.2, skyMask, skyMask), max(uDebugMaskMix, 0.5));
    } else if (uDebugView > 7.5 && uDebugView < 8.5) {
      color = mix(color, vec3(fallBasin, fallBody, fallLip), max(uDebugMaskMix, 0.5));
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;
