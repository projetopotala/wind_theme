import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const ler = (nome) => readFileSync(new URL(`../../outputs/${nome}`, import.meta.url), "utf8");
test("a Home leva a todas as seções do Portal e de volta à Travessia", () => {
  const home = ler("atendimentos-conceito.html");
  const gaveta = /<nav class="drawer-grid drawer-portal"[\s\S]*?<\/nav>/.exec(home)?.[0] || "";
  const destinos = [...gaveta.matchAll(/href="([\w-]+\.html)"/g)].map((item) => item[1]);
  for (const pagina of ["quem-somos.html", "recepcao.html", "atendimentos.html", "cursos.html", "atividades.html", "cultura.html", "blog.html", "travessia.html"]) {
    assert.ok(destinos.includes(pagina), `a gaveta não leva a ${pagina}`);
  }
  for (const pagina of destinos) assert.ok(existsSync(new URL(`../../outputs/${pagina}`, import.meta.url)), `link quebrado: ${pagina}`);
});

test("ao entrar há só o Bem-vindo e um texto; o resto da abertura vem logo abaixo", () => {
  const pagina = ler("atendimentos-conceito.html");
  const entrada = /<section class="entrada" id="boas-vindas"[\s\S]*?<\/section>/.exec(pagina)?.[0] || "";
  assert.ok(entrada, "sem a tela de entrada");
  assert.ok(pagina.indexOf('id="boas-vindas"') < pagina.indexOf('<section class="hero"'), "a entrada vem antes da abertura");
  /* O texto continua no HTML: sem JavaScript, é ele que aparece; com JS, vira partículas. */
  assert.match(entrada, /<h1 class="display entrada__titulo" id="boas-vindas-titulo" data-texto-particulas="esquerda">Bem-vindo<\/h1>/);
  /* Uma frase só, com o efeito de digitação (TextType); sem JavaScript, ela aparece inteira. */
  const frase = /<p class="entrada__texto" data-texto-digitado>([^<]+)<\/p>/.exec(entrada)?.[1] || "";
  assert.equal(frase, "O Instituto Cultural Potala é um lugar de encontro entre cuidado, conhecimento e cultura.");
  assert.equal((frase.match(/[.!?]/g) || []).length, 1, "mais de uma frase");
  /* Só isso: nenhum link, imagem, marcador ou botão disputando a entrada. */
  assert.equal((entrada.match(/<(h1|p)[\s>]/g) || []).length, 2);
  assert.doesNotMatch(entrada, /<a |<img|<button|class="(pill|eyebrow)"/);

  /* A abertura continua com o que não coube na entrada, sem repetir o texto. */
  const abertura = /<section class="hero"[\s\S]*?<\/section>/.exec(pagina)?.[0] || "";
  assert.match(abertura, /<h2 class="display hero-titulo">Não sabe o que procura\?<\/h2>/);
  assert.match(abertura, /<a class="btn btn-primary hero-recepcao" href="recepcao\.html">Conversar com a Recepção/);
  assert.match(abertura, /A Recepção escuta sua pergunta/);
  assert.doesNotMatch(abertura, /O Instituto Cultural Potala é um lugar de encontro|<h1/);

  const css = ler("css/atendimentos-conceito.css");
  assert.match(css, /\.entrada\{[^}]*min-height:100svh/);
  assert.match(css, /\.entrada__conteudo\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/, "a abertura usa uma composição editorial em duas áreas");
  assert.match(css, /\.entrada__texto\{[^}]*grid-column:2/, "a frase ocupa uma área independente do título");
});

test("cabeçalho e linha da jornada chegam com a primeira rolagem e somem de novo no topo", () => {
  const pagina = ler("atendimentos-conceito.html");
  const cabeca = pagina.slice(0, pagina.indexOf("</head>"));
  /* Só no topo e sem âncora: quem chega a uma seção pelo link vê a página inteira. */
  assert.match(cabeca, /if \(!location\.hash\) \{/);
  assert.match(cabeca, /classList\.toggle\("na-entrada", window\.scrollY <= 4\)/);
  const css = ler("css/atendimentos-conceito.css");
  assert.match(css, /\.na-entrada \.topbar\{[^}]*opacity:0/);
  assert.match(css, /\.na-entrada \.topbar:focus-within\{[^}]*opacity:1/, "quem navega pelo teclado não perde o cabeçalho");
  assert.match(css, /\.na-entrada \.journey-thread\{[^}]*opacity:0/);
});

test("o Bem-vindo vira texto de partículas (React Bits ParticleText) sem perder o título nem os cliques ao redor", async () => {
  const pagina = ler("atendimentos-conceito.html");
  assert.match(pagina, /<script type="module" src="js\/texto-de-particulas\.js"><\/script>/);
  assert.match(pagina.slice(0, pagina.indexOf("</head>")), /document\.documentElement\.classList\.add\("js"\)/);

  const modulo = ler("js/texto-de-particulas.js");
  assert.match(modulo, /ParticleText — React Bits \(https:\/\/reactbits\.dev\), por David Haz/);
  assert.match(modulo, /MIT \+ Commons Clause/);
  assert.match(modulo, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(modulo, /fetch\(|localStorage|sessionStorage/);

  const { hexToRgb, mixRgb, easeOutCubic } = await import("../../outputs/js/texto-de-particulas.js");
  assert.deepEqual(hexToRgb("#18362f"), { r: 24, g: 54, b: 47 });
  assert.equal(hexToRgb("azul"), null);
  assert.deepEqual(mixRgb({ r: 0, g: 0, b: 0 }, { r: 200, g: 100, b: 50 }, 0.5), { r: 100, g: 50, b: 25 });
  assert.equal(easeOutCubic(1), 1);

  const css = ler("css/atendimentos-conceito.css");
  /* A área de desenho sangra além do título para as partículas espalhadas não serem cortadas, mas não pode roubar cliques. */
  assert.match(css, /\.particle-text__canvas\{[^}]*pointer-events:none/);
  assert.match(modulo, /titulo\.dataset\.textoParticulas === "centro" \? "center" : "left"/, "o alinhamento vem do próprio título");
  assert.match(css, /\.particle-text__sr\{[^}]*clip:rect\(0 0 0 0\)/, "o título continua para leitores de tela");
  assert.match(css, /\.js \[data-texto-particulas\]:not\(\.particle-text--pronto\)\{[^}]*animation:particulas-reserva/, "se o JS falhar, o título aparece sozinho");
});

test("a frase da entrada é digitada e apagada como no TextType, e o ciclo segue os tempos do original", async () => {
  const pagina = ler("atendimentos-conceito.html");
  assert.match(pagina, /<script type="module" src="js\/texto-digitado\.js"><\/script>/);
  const modulo = ler("js/texto-digitado.js");
  assert.match(modulo, /TextType — React Bits \(https:\/\/reactbits\.dev\), por David Haz/);
  assert.match(modulo, /MIT \+ Commons Clause/);
  assert.match(modulo, /prefers-reduced-motion: reduce/);

  const { estadoInicial, esperaAntes, acao } = await import("../../outputs/js/texto-digitado.js");
  const opcoes = { typingSpeed: 50, initialDelay: 100, pauseDuration: 2000, deletingSpeed: 30, loop: true };
  const frases = ["ab"];
  let estado = estadoInicial();
  const passos = [];
  for (let i = 0; i < 8; i += 1) {
    const espera = esperaAntes(estado, frases, opcoes);
    estado = acao(estado, frases, opcoes);
    passos.push([espera, estado.texto, estado.apagando]);
  }
  assert.deepEqual(passos, [
    [150, "a", false], // espera inicial + velocidade de digitação
    [50, "ab", false],
    [2000, "ab", true], // pausa com a frase inteira, e começa a apagar
    [30, "a", true],
    [30, "", true],
    [0, "", false], // frase apagada: volta ao começo (uma frase só: a mesma)
    [150, "a", false],
    [50, "ab", false],
  ]);

  /* Sem laço, para na frase inteira. */
  let parado = estadoInicial();
  for (let i = 0; i < 2; i += 1) parado = acao(parado, frases, { ...opcoes, loop: false });
  assert.equal(esperaAntes(parado, frases, { ...opcoes, loop: false }), null);

  const css = ler("css/atendimentos-conceito.css");
  /* A frase inteira reserva o espaço: o Bem-vindo não sobe e desce enquanto ela é digitada. */
  assert.match(css, /\.text-type__molde\{[^}]*visibility:hidden/);
  assert.match(css, /\.text-type__cursor\{[^}]*animation:text-type-piscar/);
});

test("a entrada tem o Bem-vindo grande e detalhes de fundo decorativos, sem nada que se leia ou clique", () => {
  const pagina = ler("atendimentos-conceito.html");
  const entrada = /<section class="entrada" id="boas-vindas"[\s\S]*?<\/section>/.exec(pagina)?.[0] || "";
  const fundo = /<div class="entrada__fundo" aria-hidden="true">[\s\S]*?<\/div>/.exec(entrada)?.[0] || "";
  assert.ok(fundo, "sem os detalhes de fundo");
  for (const peca of ["entrada__aneis", "entrada__serra"]) assert.match(fundo, new RegExp(`class="${peca}`), `sem ${peca}`);
  assert.doesNotMatch(fundo, /entrada__ramo/, "sem os ramos desenhados em traço");
  assert.doesNotMatch(fundo, /<text|<a |<img/);

  const css = ler("css/atendimentos-conceito.css");
  assert.match(css, /\.entrada__titulo\{[^}]*font-size:clamp\(6\.8rem,12\.5vw,11\.4rem\)/, "o Bem-vindo mantém escala editorial");
  assert.match(css, /\.entrada::before\{[^}]*radial-gradient\([^}]*mask-image/, "malha de pontos que se apaga no centro");
  assert.ok(existsSync(new URL("../../outputs/media/atendimentos-conceito/bem-vindo-relevo.webp", import.meta.url)), "o fundo em relevo existe no projeto");
  assert.match(css, /\.entrada__fundo::before\{[^}]*bem-vindo-relevo\.webp/, "o relevo aparece atrás dos traços e do conteúdo");
  assert.match(css, /\.entrada__conteudo\{[^}]*z-index:1/, "o texto fica acima do fundo");
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.entrada__fundo \*, \.entrada__fundo::before\{animation:none/, "o relevo e os traços param com movimento reduzido");
});

test("a linha que acompanha a rolagem tem destaque: traço cheio, halo e ponta com aura", () => {
  const pagina = ler("atendimentos-conceito.html");
  const linha = /<svg class="journey-thread"[\s\S]*?<\/svg>/.exec(pagina)?.[0] || "";
  /* O halo vem antes do traço (fica por baixo) e a aura antes da ponta. */
  assert.ok(linha.indexOf("data-journey-halo") < linha.indexOf("data-journey-path"), "halo por baixo do traço");
  assert.ok(linha.indexOf("data-journey-aura") < linha.indexOf("data-journey-tip"), "aura por baixo da ponta");

  const css = ler("css/atendimentos-conceito.css");
  const traco = /\.journey-thread \[data-journey-path\]\{([^}]*)\}/.exec(css)?.[1] || "";
  assert.ok(Number(/stroke-width:([\d.]+)/.exec(traco)?.[1]) >= 2.4, "traço ainda fino");
  assert.match(css, /\.journey-thread__halo\{[^}]*stroke-width:(9|1\d)/);
  assert.match(css, /\.journey-thread__aura\{[^}]*animation:linha-aura/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.journey-thread__aura\{display:none/);

  /* O JavaScript desenha halo e traço juntos, e a aura segue a ponta. */
  const js = ler("js/atendimentos-conceito.js");
  assert.match(js, /halo\?\.style\.setProperty\("stroke-dashoffset"/);
  assert.match(js, /aura\?\.setAttribute\("cx"/);
});

test("a linha fica acima do véu, mas é recortada onde a fotografia aparece", () => {
  const pagina = ler("atendimentos-conceito.html");
  const css = ler("css/atendimentos-conceito.css");
  const js = ler("js/atendimentos-conceito.js");
  assert.match(css, /\.journey-thread\{z-index:2\}/, "o fio deve ficar à frente do véu");
  assert.match(pagina, /<clipPath[^>]*id="journey-photo-clip"[\s\S]*?data-journey-photo-clip/, "falta o recorte das fotos");
  assert.match(pagina, /<g[^>]*clip-path="url\(#journey-photo-clip\)"/, "halo, traço e ponta precisam do mesmo recorte");
  assert.match(js, /\.hero-visual > img/, "a foto da abertura também cobre o fio");
  assert.match(js, /--essay-window-left/, "o recorte acompanha a janela móvel do ensaio");
});

/* Percorre cada curva cúbica do traçado e devolve os pontos, a maior
   inclinação (graus em relação à vertical), a maior virada dentro de 80 px de
   linha e os pontos que caem dentro de alguma área de texto. */
function percorrer(desenho, desvios = []) {
  const numeros = desenho.match(/-?\d+(?:\.\d+)?/g).map(Number);
  let [x0, y0] = numeros.slice(0, 2);
  const pontos = [[x0, y0]];
  const invasoes = [];
  let inclinacao = 0;
  let sobe = false;
  for (let i = 2; i + 5 < numeros.length; i += 6) {
    const [c1x, c1y, c2x, c2y, x1, y1] = numeros.slice(i, i + 6);
    for (let k = 1; k <= 120; k += 1) {
      const t = k / 120;
      const u = 1 - t;
      const x = u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1;
      const y = u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1;
      const dx = 3 * (u * u * (c1x - x0) + 2 * u * t * (c2x - c1x) + t * t * (x1 - c2x));
      const dy = 3 * (u * u * (c1y - y0) + 2 * u * t * (c2y - c1y) + t * t * (y1 - c2y));
      if (dy < 0) sobe = true;
      inclinacao = Math.max(inclinacao, (Math.atan2(Math.abs(dx), dy) * 180) / Math.PI);
      for (const z of desvios) if (y > z.topo && y < z.base && x > z.esquerda && x < z.direita) invasoes.push([Math.round(x), Math.round(y)]);
      pontos.push([x, y]);
    }
    [x0, y0] = [x1, y1];
  }
  const direcoes = [];
  const percorrido = [0];
  for (let i = 1; i < pontos.length; i += 1) {
    const [dx, dy] = [pontos[i][0] - pontos[i - 1][0], pontos[i][1] - pontos[i - 1][1]];
    direcoes.push(Math.atan2(dx, dy));
    percorrido.push(percorrido[i - 1] + Math.hypot(dx, dy));
  }
  let virada = 0;
  let j = 0;
  for (let i = 0; i < direcoes.length; i += 1) {
    while (percorrido[i + 1] - percorrido[j + 1] > 80) j += 1;
    for (let k = j; k < i; k += 1) virada = Math.max(virada, (Math.abs(direcoes[i] - direcoes[k]) * 180) / Math.PI);
  }
  return { inicio: pontos[0], fim: pontos.at(-1), pontos, invasoes, inclinacao, virada, sobe };
}

test("a linha passa por cima das cenas do ensaio, mas o traçado desvia de cada área de texto", async () => {
  const { caminhoDaJornada } = await import("../../outputs/js/atendimentos-conceito.js");
  const largura = 1280;
  const altura = 12000;
  /* Texto à esquerda, depois à direita, depois dos dois lados (sem vão: a linha sai da tela). */
  const desvios = [
    { topo: 1500, base: 2300, esquerda: 60, direita: 700 },
    { topo: 3400, base: 4100, esquerda: 640, direita: 1220 },
    { topo: 5600, base: 6200, esquerda: 40, direita: 600 },
    { topo: 5700, base: 6100, esquerda: 590, direita: 1240 },
  ];
  const traco = percorrer(caminhoDaJornada({ largura, altura, passo: 800, desvios }), desvios);
  assert.deepEqual(traco.invasoes.slice(0, 5), [], "a linha cruza texto");
  assert.ok(traco.fim[1] >= altura - 1, "a linha parou antes do fim");

  /* Sem desvios, o desenho é o mesmo de antes (as visitas sem ensaio não mudam). */
  assert.equal(caminhoDaJornada({ largura, altura, passo: 800 }), caminhoDaJornada({ largura, altura, passo: 800, desvios: [] }));

  const css = ler("css/atendimentos-conceito.css");
  assert.match(css, /\.journey-thread\{z-index:2\}/, "acima das cenas do ensaio (z-index 1)");
  const js = ler("js/atendimentos-conceito.js");
  assert.match(js, /function zonasDeTexto\(/);
  for (const seletor of [".home-scene__copy", ".hero-copy, .hero-card"]) assert.ok(js.includes(seletor), `sem desvio de ${seletor}`);
  assert.match(js, /getComputedStyle\(palco\)\.position === "sticky"/, "o tempo de palco preso entra na área de texto");
  /* A linha nasce logo abaixo das boas-vindas, em vez de cruzá-las. */
  assert.match(js, /function inicioDaLinha\(\)[\s\S]*?\.entrada__conteudo/);
  assert.match(js, /inicio: inicioDaLinha\(\)/);
});

test("a linha permanece visível nos vãos estreitos entre textos alternados", async () => {
  const { caminhoDaJornada } = await import("../../outputs/js/atendimentos-conceito.js");
  /* Medidas da Home em 1280 px: o vão comum entre as colunas é estreito,
     mas suficiente para um fio que permaneça fora de todos os textos. */
  const largura = 1265;
  const desvios = [
    { topo: 845, base: 1667, esquerda: 23, direita: 765 },
    { topo: 837, base: 1667, esquerda: 866, direita: 1242 },
    { topo: 1902, base: 2596, esquerda: 715, direita: 1203 },
    { topo: 2823, base: 3563, esquerda: 62, direita: 668 },
    { topo: 3742, base: 4530, esquerda: 62, direita: 668 },
    { topo: 4714, base: 5529, esquerda: 74, direita: 620 },
    { topo: 5675, base: 6369, esquerda: 715, direita: 1203 },
  ];
  const desenho = caminhoDaJornada({ largura, altura: 7800, passo: 684, inicio: 536, desvios });
  const ancoras = [...desenho.matchAll(/C [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ ([-\d.]+) ([-\d.]+)/g)]
    .map((match) => [Number(match[1]), Number(match[2])]);
  for (const { topo, base } of desvios) {
    const pontos = ancoras.filter(([, y]) => y >= topo && y <= base);
    assert.ok(pontos.length > 0, `sem ponto no trecho ${topo}–${base}`);
    assert.ok(pontos.every(([x]) => x >= 0 && x <= largura), `linha fora da tela no trecho ${topo}–${base}`);
  }
  assert.deepEqual(percorrer(desenho, desvios).invasoes, [], "a linha passou sobre um texto");
});

test("no computador a linha curva por trás das fotos sem cruzar os textos", async () => {
  const { caminhoDaJornada } = await import("../../outputs/js/atendimentos-conceito.js");
  /* O texto alterna de lado. A fotografia ocupa o lado oposto e sua máscara
     oculta apenas o trecho da curva que passa por ela. */
  const largura = 1425;
  const folga = 28;
  const vao = 104;
  const direita = [796, 1324];
  const esquerda = [101, 696];
  const lados = [direita, esquerda, direita, esquerda, direita, [115, 605], direita, esquerda, direita, esquerda, direita, esquerda, direita];
  const textos = lados.map(([a, b], i) => {
    const topo = 2452 + i * 1179 - folga;
    const base = 2452 + i * 1179 + 721 + folga;
    return { topo, base, esquerda: a - folga, direita: b + folga };
  });
  const fotos = lados.map(([a, b], i) => ({
    topo: textos[i].topo,
    base: textos[i].base,
    esquerda: a > largura / 2 ? 0 : b + vao,
    direita: a > largura / 2 ? a - vao : largura,
  }));
  const desenho = caminhoDaJornada({ largura, altura: 18000, passo: 855, inicio: 665, desvios: textos });
  const traco = percorrer(desenho, textos);
  assert.deepEqual(traco.invasoes, [], "a linha passou sobre texto");
  const fotosAtravessadas = fotos.filter((foto) => traco.pontos.some(([x, y]) =>
    y > foto.topo && y < foto.base && x > foto.esquerda && x < foto.direita));
  assert.ok(fotosAtravessadas.length >= 4, "a linha não passa por trás das fotografias");
  const ancoras = [...desenho.matchAll(/C [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ ([-\d.]+) ([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  for (const { topo, base } of textos) {
    const pontos = ancoras.filter(([, y]) => y >= topo && y <= base);
    assert.ok(pontos.length > 0 && pontos.every(([x]) => x > 0 && x < largura), `a linha saiu da tela na cena ${topo}–${base}`);
  }

  /* O vão ainda separa foto e texto. A linha pode entrar sob a foto, enquanto
     a máscara acompanha a janela fotográfica em movimento. */
  const ensaio = ler("js/home/editorial-essay.js");
  assert.match(ensaio, /const VAO = 104;/);
  assert.match(ensaio, /left = Math\.max\(left, \(textos\.right \+ VAO\) \/ coluna\)/);
  assert.match(ensaio, /right = Math\.min\(right, \(textos\.left - VAO\) \/ coluna\)/);
  const js = ler("js/atendimentos-conceito.js");
  assert.doesNotMatch(js, /function zonaDaFoto\(/, "a foto não pode ser um obstáculo para o traçado");

  /* A linha é medida de novo quando o ensaio troca de composição: ao carregar,
     o ensaio liga o movimento DEPOIS de a linha ser medida, e as áreas de
     texto mudam sem mudar o tamanho da página. */
  assert.match(ensaio, /document\.dispatchEvent\(new CustomEvent\('ensaio:composicao'\)\)/);
  assert.match(js, /addEventListener\("ensaio:composicao", remedir\)/);
  assert.match(js, /fonts\?\.ready\?\.then\(remedir\)/);
});

test("quando os blocos da abertura se encostam, a linha passa por trás deles em vez de sair da tela", async () => {
  const { caminhoDaJornada } = await import("../../outputs/js/atendimentos-conceito.js");
  /* A 1000 px o texto e o cartão da abertura quase se tocam: não há vão. Os
     dois ficam acima da linha, com fundo, então ela pode passar por trás — e
     as cenas seguintes continuam com ela à vista, no vão entre foto e texto. */
  const largura = 985;
  const desvios = [
    { topo: 706, base: 1525, esquerda: 12, direita: 602, opcional: true },
    { topo: 774, base: 1525, esquerda: 597, direita: 973, opcional: true },
    { topo: 1775, base: 2524, esquerda: 524, direita: 965 },
    { topo: 1775, base: 2524, esquerda: 0, direita: 448 },
    { topo: 2852, base: 3529, esquerda: 20, direita: 510 },
    { topo: 2852, base: 3529, esquerda: 586, direita: 985 },
    { topo: 3856, base: 4606, esquerda: 524, direita: 965 },
    { topo: 3856, base: 4606, esquerda: 0, direita: 448 },
  ];
  const desenho = caminhoDaJornada({ largura, altura: 5200, passo: 608, inicio: 483, desvios });
  const ancoras = [...desenho.matchAll(/C [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ ([-\d.]+) ([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const cenas = ancoras.filter(([, y]) => y >= 1775 && y <= 4606);
  assert.ok(cenas.length >= 4 && cenas.every(([x]) => x > 0 && x < largura), "a linha saiu da tela nas cenas");
  assert.deepEqual(percorrer(desenho, desvios.filter((z) => !z.opcional)).invasoes.slice(0, 3), [], "a linha passou sobre texto ou foto de uma cena");
  const js = ler("js/atendimentos-conceito.js");
  assert.match(js, /cena\.querySelectorAll\("\.hero-copy, \.hero-card"\)\.forEach\(\(bloco\) => adicionar\(bloco, palco, cena, true\)\)/);
  /* "Por trás" de verdade: o palco da abertura (preso, com contexto de
     empilhamento próprio) fica acima da linha (z-index 2). */
  assert.match(ler("css/home-editorial-essay.css"), /\.hero\[data-essay-scene\] \.hero-stage \{ z-index: 3; \}/);
});

test("um trecho sem vão não expulsa da tela a linha de todas as outras cenas", async () => {
  const { caminhoDaJornada } = await import("../../outputs/js/atendimentos-conceito.js");
  /* Sem movimento, duas cenas vizinhas se encostam e o vão comum a elas mede
     68 px: ainda cabe a linha, e as demais cenas continuam com ela à vista. */
  const largura = 1425;
  const desvios = [
    { topo: 7121, base: 7936, esquerda: 768, direita: 1352 },
    { topo: 7121, base: 7936, esquerda: 0, direita: 692 },
    { topo: 8765, base: 9559, esquerda: 58, direita: 684 },
    { topo: 8765, base: 9559, esquerda: 760, direita: 1425 },
    { topo: 9494, base: 10279, esquerda: 768, direita: 1352 },
    { topo: 9494, base: 10279, esquerda: 0, direita: 692 },
    { topo: 10673, base: 11458, esquerda: 73, direita: 724 },
    { topo: 10673, base: 11458, esquerda: 800, direita: 1425 },
  ];
  const desenho = caminhoDaJornada({ largura, altura: 12000, passo: 855, inicio: 6500, desvios });
  const ancoras = [...desenho.matchAll(/C [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ ([-\d.]+) ([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const naTela = ancoras.filter(([x, y]) => y >= 7121 && y <= 11458 && x > 0 && x < largura);
  assert.ok(naTela.length >= 6, "a linha saiu da tela nas cenas");
  assert.deepEqual(percorrer(desenho, desvios).invasoes.slice(0, 3), [], "a linha passou sobre texto ou foto");
});

test("no celular e no tablet a linha faz curvas leves numa faixa própria à direita", async () => {
  const { caminhoDaJornada } = await import("../../outputs/js/atendimentos-conceito.js");
  /* Em uma coluna o conteúdo recua 34 px da direita. O fio pode ondular nessa
     faixa sem cruzar o texto nem encostar na barra de rolagem. */
  for (const largura of [305, 375, 475, 768]) {
    const texto = largura - 41;
    const desvios = [
      { topo: 939, base: 1461, esquerda: 10, direita: texto },
      { topo: 1431, base: 2033, esquerda: 10, direita: texto },
      { topo: 2487, base: 2976, esquerda: 13, direita: texto },
      { topo: 3450, base: 3973, esquerda: 13, direita: texto },
      { topo: 4447, base: 4970, esquerda: 13, direita: texto },
    ];
    const desenho = caminhoDaJornada({ largura, altura: 6000, passo: 665, inicio: 500, estreito: true, desvios });
    const ancoras = [...desenho.matchAll(/C [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ ([-\d.]+) ([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const ensaio = ancoras.filter(([, y]) => y >= 939 && y <= 4970);
    assert.ok(ensaio.length >= 4, `${largura}px: poucos pontos no ensaio`);
    assert.ok(ensaio.every(([x]) => x >= largura - 24 && x <= largura - 7), `${largura}px: a linha saiu da faixa lateral`);
    assert.ok(new Set(ensaio.map(([x]) => x)).size >= 2, `${largura}px: a linha ficou reta`);
    assert.deepEqual(percorrer(desenho, desvios).invasoes, [], `${largura}px: a linha cruzou um texto`);
  }
  const js = ler("js/atendimentos-conceito.js");
  assert.match(js, /const estreito = largura <= 980;/, "o tablet também está em uma coluna");
  const css = ler("css/home-editorial-essay.css");
  assert.match(css, /padding: var\(--faixa-foto\) 34px 82px 17px;/, "o texto recua para abrir a faixa");
});

test("a linha nunca faz curva fechada: desce sempre mais do que anda de lado", async () => {
  const { caminhoDaJornada } = await import("../../outputs/js/atendimentos-conceito.js");
  const folga = 28;
  const zona = (topo, base, esquerda, direita) => ({ topo: topo - folga, base: base + folga, esquerda: esquerda - folga, direita: direita + folga });
  /* As áreas de texto do ensaio medidas na página a 1440 × 900: texto ora à
     esquerda, ora à direita, com vãos curtos entre as cenas. */
  const pagina = {
    largura: 1440,
    altura: 30000,
    passo: 855,
    inicio: 665,
    desvios: [
      zona(1127, 1995, 58, 828), zona(1145, 1995, 1047, 1367), zona(2452, 3173, 836, 1324), zona(3608, 4375, 101, 671),
      zona(4763, 5578, 101, 671), zona(6018, 6876, 115, 605), zona(7168, 7889, 836, 1324),
    ],
  };
  const cenarios = [pagina, { largura: 1280, altura: 12000, passo: 800 }, { largura: 390, altura: 12000, passo: 700, estreito: true }];
  /* E páginas inventadas, com blocos de texto de toda largura e altura. */
  for (let semente = 1; semente <= 40; semente += 1) {
    let estado = semente * 9301;
    const r = () => (estado = (estado * 16807) % 2147483647) / 2147483647;
    const largura = [375, 768, 1280, 1440, 1920][semente % 5];
    const desvios = [];
    let y = 300 + r() * 600;
    for (let i = 0; i < 8; i += 1) {
      const alto = 200 + r() * 900;
      const bloco = largura * (0.2 + r() * 0.7);
      const esquerda = r() * (largura - bloco);
      desvios.push({ topo: y, base: y + alto, esquerda, direita: esquerda + bloco });
      y += alto + r() * 700;
    }
    cenarios.push({ largura, altura: y + 2000, passo: 520 + r() * 380, desvios, inicio: semente % 2 ? 0 : 400, semente });
  }

  for (const cenario of cenarios) {
    const traco = percorrer(caminhoDaJornada(cenario), cenario.desvios);
    const nome = `${cenario.largura}px, semente ${cenario.semente ?? "padrão"}`;
    assert.deepEqual(traco.invasoes.slice(0, 3), [], `${nome}: a linha cruza texto`);
    assert.equal(traco.sobe, false, `${nome}: a linha volta para cima`);
    assert.ok(traco.inclinacao <= 58, `${nome}: trecho quase horizontal (${Math.round(traco.inclinacao)}°)`);
    assert.ok(traco.virada <= 60, `${nome}: virada brusca de ${Math.round(traco.virada)}° em 80 px`);
    assert.equal(traco.inicio[1], cenario.inicio ?? 0, `${nome}: a linha não nasce abaixo das boas-vindas`);
    assert.ok(traco.fim[1] >= cenario.altura - 1, `${nome}: a linha parou antes do fim`);
  }

  /* Na página real, a linha fica à vista sobre o ensaio: nasce no centro, sob a
     frase de boas-vindas, e passa pelo vão entre os dois textos da abertura. */
  const desenho = caminhoDaJornada(pagina);
  assert.match(desenho, /^M 720 665 /);
  const ancoras = [...desenho.matchAll(/C [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ ([-\d.]+) ([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const noEnsaio = ancoras.filter(([, y]) => y > 1000 && y < 8000);
  assert.ok(noEnsaio.every(([x]) => x > 0 && x < pagina.largura), "a linha some da tela no meio do ensaio");
});
