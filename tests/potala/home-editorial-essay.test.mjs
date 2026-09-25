import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../outputs/', import.meta.url);
const html = readFileSync(new URL('atendimentos-conceito.html', root), 'utf8');
const css = readFileSync(new URL('css/home-editorial-essay.css', root), 'utf8');
const motion = readFileSync(new URL('js/home/editorial-essay.js', root), 'utf8');
const essay = html.slice(html.indexOf('<div class="home-essay"'), html.indexOf('</main>'));

test('a travessia editorial oferece uma cena para cada seção do portal, em ordem', () => {
  const scenes = [...html.matchAll(/<section class="(?:hero|home-scene[^"]*)" id="([^"]+)" data-essay-scene/g)].map((match) => match[1]);
  assert.deepEqual(scenes, [
    'inicio', 'ensaio-quem-somos', 'ensaio-atendimentos', 'ensaio-saude-integrativa',
    'ensaio-profissionais', 'ensaio-cursos', 'ensaio-atividades', 'ensaio-programacao',
    'ensaio-cultura', 'ensaio-inspiracao', 'ensaio-blog', 'ensaio-revista', 'ensaio-loja',
    'ensaio-convivencia',
  ]);
  /* Cada cena leva à página da sua seção, e a numeração segue a ordem. */
  const destinos = {
    'quem-somos': 'quem-somos.html', atendimentos: 'atendimentos.html', 'saude-integrativa': 'saude-integrativa.html',
    profissionais: 'profissionais.html', cursos: 'cursos.html', atividades: 'atividades.html', programacao: 'programacao.html',
    cultura: 'cultura.html', inspiracao: 'inspiracao.html', blog: 'blog.html', revista: 'revista.html', loja: 'marketplace.html',
  };
  Object.entries(destinos).forEach(([id, pagina], i) => {
    const cena = new RegExp(`<section class="home-scene[^"]*" id="ensaio-${id}"[\\s\\S]*?</section>`).exec(html)?.[0] || '';
    assert.ok(cena.includes(`href="${pagina}"`), `a cena ${id} não leva a ${pagina}`);
    assert.ok(cena.includes(`aria-hidden="true">${String(i + 2).padStart(2, '0')}</span>`), `numeração fora de ordem em ${id}`);
  });
  /* As cenas alternam o molde: duas vizinhas nunca repetem a composição. */
  const moldes = [...html.matchAll(/<section class="home-scene home-scene--(\w+)"/g)].map((match) => match[1]);
  moldes.slice(1).forEach((molde, i) => assert.notEqual(molde, moldes[i], `cenas vizinhas com o mesmo molde: ${molde}`));
  assert.ok(html.indexOf('id="ensaio-convivencia"') < html.indexOf('</main>'));
  assert.doesNotMatch(html, /content-taxonomy/);
  assert.doesNotMatch(html, /<section[^>]+id="(?:saude|praca|agendar)"/);
  assert.doesNotMatch(html, /<footer\b/);
  assert.match(html, /<\/section>\s*<\/div>\s*<\/main>/, 'Convivência encerra o conteúdo da página');
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(html.includes(`id="${target}"`), `âncora interna sem destino: ${target}`);
  }
});

test('cada fotografia e destino da abertura editorial existe no projeto', () => {
  const imageSources = [...essay.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(imageSources.length, 26, 'duas fotografias por cena');
  /* Nenhuma foto principal se repete entre as cenas das seções. */
  const principais = [...essay.matchAll(/class="home-scene__main-image"[^>]*? src="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(principais.length, 13);
  assert.equal(new Set(principais.slice(0, -1)).size, principais.length - 1);
  for (const source of imageSources) {
    assert.ok(source.startsWith('media/'));
    assert.ok(existsSync(new URL(source, root)), `imagem ausente: ${source}`);
  }
  const destinations = [...essay.matchAll(/<a href="([^"#][^"]*)"/g)].map((match) => match[1]);
  for (const destination of destinations) {
    assert.ok(existsSync(new URL(destination, root)), `destino ausente: ${destination}`);
  }
});

test('no celular a foto ocupa a faixa de cima, mostra o assunto e fica enquanto a cena é lida', () => {
  /* A faixa da foto e o recuo do texto são a mesma medida. */
  assert.match(css, /--faixa-foto: min\(64svh, 540px\);/);
  assert.match(css, /padding: var\(--faixa-foto\) 34px 82px 17px;/);
  assert.match(css, /inset: 0 0 auto;\s*width: 100%;\s*height: var\(--faixa-foto\);/);
  /* Cada foto diz onde está o assunto, e o celular recorta por ali. */
  assert.match(css, /\.home-scene \.home-scene__main-image \{ object-position: var\(--foco, center\); \}/);
  const focos = [...essay.matchAll(/class="home-scene__main-image" style="--foco: (\d+)% (\d+)%"/g)];
  assert.equal(focos.length, 13, 'toda foto principal tem um ponto de foco');
  /* A cena rola com a página: a janela entra e não sai para cima. */
  assert.match(motion, /const exit = mobile \? 0 :/);
  assert.match(motion, /\(mobile \? 1 : 1 - clamp\(\(progress - \.76\) \/ \.18\)\)/);
});

test('o texto nunca fica sobre a fotografia: a janela e a foto de detalhe guardam o vão da linha', () => {
  /* Nada de pintar um fundo da cor do papel sob o texto para esconder a foto. */
  assert.doesNotMatch(css, /box-shadow: 0 0 0 \d+px var\(--scene-surface\)/);
  assert.doesNotMatch(css, /\.home-scene--knowledge \.home-scene__copy \{[^}]*margin-right: -/);
  assert.doesNotMatch(css, /\.home-scene--movement \.home-scene__copy \{[^}]*background:/);
  /* A janela é recortada pela área real do sobretítulo, do título, do parágrafo e dos links. */
  assert.match(motion, /const TEXTOS_MENORES = '\.home-scene__eyebrow, \.home-scene__copy > p, \.cena-blocos, \.home-scene__links, \.home-scene__copy > a'/);
  assert.match(motion, /faixaDoTitulo\?\.selectNodeContents\(titulo\)/);
  assert.match(motion, /left = Math\.max\(left, \(textos\.right \+ VAO\) \/ coluna\)/);
  assert.match(motion, /right = Math\.min\(right, \(textos\.left - VAO\) \/ coluna\)/);
  assert.match(motion, /bottom = Math\.min\(bottom, \(textos\.top - FOLGA\)/, 'no celular a foto não desce sob o texto');
  assert.match(motion, /afastamentoDoDetalhe\(scene, stage, textos, mobile, detailX, detailY\)/);
  assert.match(css, /\.home-scene\.is-janela-fechada \.home-scene__frame \{ opacity: 0; \}/);
  /* Sem movimento, a panorâmica vem inteira e o texto segue abaixo dela. */
  assert.match(css, /html:not\(\.has-essay-motion\) \.home-scene--movement \.home-scene__copy \{\s*position: relative;/);
});

test('entre uma cena e outra há um intervalo, e o fundo passa de um tom ao outro num degradê fosco', () => {
  /* As cenas não se sobrepõem mais: cada uma começa depois de um intervalo. */
  assert.doesNotMatch(css, /\.home-scene \+ \.home-scene \{ margin-top: -/);
  assert.match(css, /--intervalo: clamp\(/);
  assert.match(css, /\.home-scene \{[^}]*margin-top: var\(--intervalo\)/);
  /* O intervalo leva do tom da cena anterior ao da cena seguinte. */
  assert.match(css, /\.home-scene::before \{[\s\S]*?bottom: 100%;[\s\S]*?height: calc\(var\(--intervalo\) \+ 1px\);[\s\S]*?linear-gradient\(to bottom, var\(--superficie-anterior\), var\(--scene-surface\)\)/);
  /* Cada molde passa o seu tom à cena seguinte — os mesmos tons que ele usa. */
  const tons = { who: '#efe9dc', care: '#e5e5d9', knowledge: '#e9e2d4', movement: '#d6d2bd', together: '#e7dccc' };
  for (const [molde, tom] of Object.entries(tons)) {
    if (molde !== 'who') assert.match(css, new RegExp(`\\.home-scene--${molde} \\{ --scene-surface: ${tom}; \\}`));
    assert.match(css, new RegExp(`\\.home-scene--${molde} \\+ \\.home-scene \\{ --superficie-anterior: ${tom}; \\}`), `sem passagem depois do molde ${molde}`);
  }
  /* O fosco é grão e véu claro, sem desfoque (nada de backdrop-filter). */
  assert.match(css, /\.home-scene::after \{[\s\S]*?feTurbulence[\s\S]*?mask-image: linear-gradient/);
  assert.doesNotMatch(css, /backdrop-filter:(?!\s*none)|filter:\s*blur/);
  /* No celular, sem palco preso, o intervalo é menor. */
  assert.match(css, /@media \(max-width: 980px\) \{[\s\S]*?--intervalo: clamp\(64px/);
});

test('a coreografia depende da rolagem real, reverte e conserva apresentação estática', () => {
  assert.match(motion, /getBoundingClientRect\(\)/);
  assert.match(motion, /requestAnimationFrame\(paint\)/);
  assert.match(motion, /addEventListener\('scroll', schedulePaint, \{ passive: true \}\)/);
  assert.doesNotMatch(motion, /preventDefault\(/);
  assert.match(css, /\.home-scene__stage::after\s*\{[\s\S]*?clip-path: polygon\(evenodd,/);
  assert.match(motion, /--essay-window-top/);
  assert.doesNotMatch(motion, /--essay-clip-|--essay-reveal-offset/);
  assert.match(css, /html:not\(\.has-essay-motion\) \.home-scene__stage::after \{ display: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(motion, /motionPreference\.matches/);
  assert.match(html, /<script type="module" src="js\/home\/editorial-essay\.js"><\/script>/);
});

test('o convite de cada cena é um selo com a seta, e não um link miúdo sublinhado', () => {
  const convites = [...essay.matchAll(/<a href="[^"]+">([^<]+)<span aria-hidden="true">↗<\/span><\/a>/g)];
  assert.equal(convites.length, 13, 'toda cena termina num convite com a seta à parte');
  assert.doesNotMatch(essay, /<a [^>]*>[^<]*↗<\/a>/, 'nenhuma seta solta no texto do link');
  /* O texto fala na voz dos títulos: serifa itálica, maior que o parágrafo. */
  assert.match(css, /\.home-scene__copy a:not\(\.cena-bloco\) \{[^}]*font: italic 500 clamp\([^}]*var\(--serif\)/);
  assert.doesNotMatch(css, /\.home-scene__copy a:not\(\.cena-bloco\) \{[^}]*border-bottom/, 'sem o sublinhado cinza de formulário');
  /* A seta mora num selo dourado; um anel tracejado gira devagar em volta. */
  assert.match(css, /\.home-scene__copy a:not\(\.cena-bloco\) span \{[^}]*border-radius: 50%;[^}]*border: 1px solid/);
  assert.match(css, /\.home-scene__copy a:not\(\.cena-bloco\) span::before \{[^}]*border: 1px dashed[^}]*animation: convite-anel/);
  /* No hover o selo se enche de verde e o traço dourado corre sob o texto. */
  assert.match(css, /\.home-scene__copy a:not\(\.cena-bloco\):is\(:hover, :focus-visible\) span \{[^}]*background: var\(--convite-selo\)/);
  assert.match(css, /\.home-scene__copy a:not\(\.cena-bloco\)::after \{[^}]*background: #a78855/);
  assert.match(css, /prefers-reduced-motion: reduce\)[\s\S]*?\.home-scene__copy a:not\(\.cena-bloco\) span::before \{ animation: none/);
});

test('a moldura acompanha a foto: mesmo tamanho, deslocada para cima e para fora, como a da abertura', () => {
  /* Medida na mesma régua da janela (o palco): na área da mídia ela saía
     menor e torta, deslocada pelo padding do palco. */
  assert.match(motion, /const DESENCONTRO = 24;/);
  assert.match(motion, /const DESENCONTRO_CELULAR = 12;/);
  assert.match(motion, /const l = \(stage\.width \* janela\.left\) \/ 100;/);
  assert.doesNotMatch(motion, /const area = mobile \?/, 'sem uma régua para cada tela');
  /* Para fora: o lado oposto ao do texto; no celular, para a esquerda. */
  assert.match(motion, /const dx = mobile \|\| textoADireita \? -passo : passo;/);
  assert.match(motion, /scene\.style\.setProperty\('--essay-frame-dx', `\$\{moldura\.dx\}px`\)/);
  /* Só o canto fora da foto aparece; o trecho sobre ela é recortado. */
  assert.match(css, /html\.has-essay-motion \.home-scene__frame \{[^}]*--furo-x: calc\(0px - var\(--essay-frame-dx[^}]*clip-path: polygon\(evenodd,[^}]*var\(--furo-x\) var\(--furo-y\)/);
});
