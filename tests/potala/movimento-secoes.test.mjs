import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { caminhoDoFio, montarRevelacoes } from "../../outputs/js/sections/movimento.js";

const ler = (caminho) => readFileSync(new URL(`../../outputs/${caminho}`, import.meta.url), "utf8");
const html = ler("atendimentos.html");
const movimento = ler("css/movimento.css");
const redesign = ler("css/atendimentos-redesign.css");
const secoes = ler("css/secoes.css");
const quemSomos = ler("quem-somos.html");
const quemSomosCss = ler("css/quem-somos-redesign.css");
const recepcao = ler("recepcao.html");
const recepcaoCss = ler("css/recepcao-redesign.css");

test("o fio desce pela margem e se aproxima de cada capítulo", () => {
  const desenho = caminhoDoFio([300, 900, 1500], { altura: 2000, margem: 34, avanco: 26 });
  assert.match(desenho, /^M 34 0/, "começa no alto da margem");
  assert.equal((desenho.match(/C /g) || []).length, 6, "duas curvas por capítulo: aproximar e voltar");
  assert.match(desenho, / L 34 2000$/, "termina no pé da página, de volta à margem");
  assert.ok(desenho.includes("60"), "a curva alcança a coluna do capítulo (margem + avanço)");

  const numeros = [...desenho.matchAll(/-?\d+(?:\.\d+)?/g)].map((item) => Number(item[0]));
  assert.ok(numeros.every((valor) => valor >= 0 && valor <= 2000), "nenhum ponto sai da página");
});

test("sem altura de página não há fio, e capítulos fora de ordem não invertem o traço", () => {
  assert.equal(caminhoDoFio([100], { altura: 0 }), "");
  const desenho = caminhoDoFio([1200, 200, 700], { altura: 1600 });
  const alturas = [...desenho.matchAll(/C [\d.]+ ([\d.]+)/g)].map((item) => Number(item[1]));
  const ordenadas = [...alturas].sort((a, b) => a - b);
  assert.deepEqual(alturas, ordenadas, "o traço desce sempre, mesmo com os capítulos embaralhados");
});

test("sem observador de interseção o conteúdo aparece inteiro", () => {
  const revelados = [];
  const bloco = (nome) => ({ dataset: { revelar: "2" }, classList: { add: (classe) => revelados.push(`${nome}:${classe}`) }, style: { setProperty() {} } });
  const raiz = { querySelectorAll: () => [bloco("titulo"), bloco("texto")] };
  montarRevelacoes(raiz);
  assert.deepEqual(revelados, ["titulo:is-revelado", "texto:is-revelado"]);
});

test("Atendimentos mantém todo o conteúdo dos capítulos anteriores", () => {
  const obrigatorios = [
    "Atendimentos",
    "&amp; caminhos para cuidar",
    "Cada pessoa chega com uma história diferente.",
    "Compreender vem antes de escolher.",
    "Mais de 150 possibilidades, sem uma resposta única.",
    "Oráculos e linguagens de autoconhecimento.",
    "O cuidado precisa caber na vida real.",
    "Você não precisa escolher sozinho.",
    "Presencial e online",
    "Ambulatórios",
    "Atendimento solidário",
    "Corpo",
    "Emoções e relações",
    "Energia e presença",
    "Orientação",
    "Cuidar também é aprender.",
  ];
  for (const trecho of obrigatorios) assert.ok(html.includes(trecho), `sumiu do conteúdo: ${trecho}`);

  for (const destino of ["recepcao.html", "institutopotala.com/oraculos", "institutopotala.com/terapias", "transcendido.html"]) {
    assert.ok(html.includes(destino), `sumiu o destino: ${destino}`);
  }
  assert.ok(html.includes('data-resource-hero="atendimentos"'), "a busca e os caminhos continuam na página");
});

test("a página é lida como capítulos, e o índice leva a todos eles", () => {
  const capitulos = [...html.matchAll(/data-capitulo="([\w-]+)"/g)].map((item) => item[1]);
  assert.deepEqual(capitulos, ["inicio", "caminhos", "orientacao", "possibilidades", "oraculos", "acesso", "primeiro-passo"]);

  const links = [...html.matchAll(/data-capitulo-link="([\w-]+)"/g)].map((item) => item[1]);
  assert.deepEqual(links, capitulos.slice(1), "o índice cobre os capítulos depois da abertura");
  for (const alvo of links) assert.ok(html.includes(`id="${alvo}"`), `o índice aponta para uma âncora que existe: ${alvo}`);

  assert.match(html, /data-leitura-progresso/);
  assert.match(html, /data-fio-da-jornada/);
  assert.match(html, /js\/sections\/movimento\.js/);
});

test("o movimento é opcional: sem JS e com movimento reduzido a leitura continua inteira", () => {
  assert.match(movimento, /html:not\(\.js\) \[data-revelar\][^}]*opacity: 1/s);
  assert.match(movimento, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(redesign, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(secoes, /@import url\("movimento\.css"\);/);
});

test("nada caro é animado: só transform, opacity, clip-path, traço e cor", () => {
  const permitidas = new Set(["opacity", "transform", "clip-path", "color", "background", "border-color", "stroke", "stroke-dashoffset", "none"]);
  for (const arquivo of [movimento, redesign]) {
    for (const [, declaracao] of arquivo.matchAll(/transition:\s*([^;]+);/g)) {
      /* A vírgula dentro de var(--x, 0ms) não separa transições. */
      const semFuncoes = declaracao.replace(/\([^()]*\)/g, "");
      const propriedades = semFuncoes.split(",").map((parte) => parte.trim().split(/\s+/)[0]).filter(Boolean);
      for (const propriedade of propriedades) {
        assert.ok(permitidas.has(propriedade), `transição cara: ${propriedade}`);
      }
    }
  }
});

test("Quem somos mantém o conteúdo e ganha capítulos", () => {
  const obrigatorios = [
    "Um lugar onde muitos caminhos se encontram.",
    "Somos todos um único instituto.",
    "Estender as mãos para que novos caminhos possam surgir.",
    "Cuidar também é aprender, conviver, criar e transformar.",
    "26 de maio de 2012",
    "Avalokiteshvara",
    "Desde 2012",
    "Cuidado",
    "Conhecimento",
    "Movimento",
    "Convivência",
    "Conhecer um lugar é importante.",
  ];
  for (const trecho of obrigatorios) assert.ok(quemSomos.includes(trecho), `sumiu do conteúdo: ${trecho}`);
  for (const destino of ["transcendido.html", "institutopotala.com/quemsomos"]) {
    assert.ok(quemSomos.includes(destino), `sumiu o destino: ${destino}`);
  }

  const capitulos = [...quemSomos.matchAll(/data-capitulo="([\w-]+)"/g)].map((item) => item[1]);
  assert.deepEqual(capitulos, ["inicio", "visao", "historia", "ecossistema", "encerramento"]);
  const links = [...quemSomos.matchAll(/data-capitulo-link="([\w-]+)"/g)].map((item) => item[1]);
  assert.deepEqual(links, ["visao", "historia", "ecossistema"]);
  for (const alvo of links) assert.ok(quemSomos.includes(`id="${alvo}"`), `âncora ausente: ${alvo}`);
  assert.match(quemSomos, /js\/sections\/movimento\.js/);
});

test("as quatro dimensões são uma constelação, não quatro cartões iguais", () => {
  const dimensoes = [...quemSomos.matchAll(/<article data-foco tabindex="0" data-revelar="\d"/g)];
  assert.equal(dimensoes.length, 4, "cada dimensão é um item alcançável por teclado");

  const colunas = [...quemSomosCss.matchAll(/\.about-paths > article:nth-child\(\d\) \{ grid-column: ([^;]+);/g)].map((item) => item[1].trim());
  assert.equal(colunas.length, 4, "cada dimensão tem posição própria na grade");
  assert.equal(new Set(colunas).size, 4, "nenhuma posição se repete: a leitura desce em constelação");

  /* O gesto de foco não pode esconder as outras dimensões. */
  assert.doesNotMatch(quemSomosCss, /\.about-paths > article(?![^{]*:focus)[^{]*\{[^}]*display:\s*none/);
  assert.match(quemSomosCss, /\.about-paths > article\.is-ativa svg \{[^}]*transform: scale/);
});

test("Recepção mantém as oito portas, os contatos e as prévias", () => {
  const obrigatorios = [
    "Recepção",
    "O primeiro ponto de contato para reconhecer o caminho certo.",
    "Comece com uma conversa.",
    "O que você precisa hoje?",
    "Não sei por onde começar",
    "Posso ajudar você?",
    "Aconselhamento Holístico",
    "Perguntas Frequentes",
    "Recomendações Inteligentes",
    "Primeira visita",
    "Preciso de ajuda",
    "Antes de ir embora...",
    "Rua 24 de Maio, 748",
    "(19) 99776-6131",
    "(19) 3834-6147",
    "contato@institutopotala.com",
    "nenhuma mensagem é enviada ou armazenada",
    "Você encontrou o que procurava?",
  ];
  for (const trecho of obrigatorios) assert.ok(recepcao.includes(trecho), `sumiu do conteúdo: ${trecho}`);
  assert.match(recepcao, /data-assistant-preview/);
  assert.match(recepcao, /data-feedback-preview/);
  assert.equal((recepcao.match(/class="reception-path"/g) || []).length, 6, "seis portas comuns");
  assert.equal((recepcao.match(/data-foco data-revelar="\d" class="reception-path/g) || []).length, 8, "as oito portas seguem na página");
  assert.ok(recepcao.includes("reception-path--featured") && recepcao.includes("reception-path--urgent"), "as duas portas com rótulo continuam marcadas");
});

test("a Recepção tem capítulos e as portas ganham pesos diferentes", () => {
  const capitulos = [...recepcao.matchAll(/data-capitulo="([\w-]+)"/g)].map((item) => item[1]);
  assert.deepEqual(capitulos, ["inicio", "primeiro-passo", "caminhos", "assistente", "contato", "retorno", "encerramento"]);
  assert.match(recepcao, /js\/sections\/movimento\.js/);

  /* O índice desta página são as quatro rotas do hero: nada de um segundo menu. */
  assert.doesNotMatch(recepcao, /data-capitulo-link=/);
  assert.equal((recepcao.match(/<a data-revelar="\d" href="/g) || []).length, 4, "as quatro rotas entram em sequência");

  assert.match(recepcaoCss, /\.reception-path-list \{[^}]*grid-template-columns: repeat\(2/);
  assert.match(recepcaoCss, /\.reception-path--featured,\s*\.reception-path--urgent \{[^}]*grid-column: 1 \/ -1/);
  assert.match(recepcaoCss, /\.reception-path\.is-ativa \.reception-path-number \{[^}]*transform: scale/);
});

test("nenhum capítulo repete o título de outro", () => {
  for (const [pagina, nome] of [[recepcao, "recepcao.html"], [html, "atendimentos.html"], [quemSomos, "quem-somos.html"]]) {
    const titulos = [...pagina.matchAll(/<h2[^>]*>([^<]+)</g)].map((item) => item[1].trim());
    assert.equal(new Set(titulos).size, titulos.length, `${nome} tem dois capítulos com o mesmo título: ${titulos.join(" | ")}`);
  }
  /* A porta 02 tem o nome do seu destino: essa repetição é proposital. */
  assert.ok(recepcao.includes("<h3>Posso ajudar você?</h3>"));
  assert.ok(recepcao.includes('id="assistant-title" data-revelar="1">Posso ajudar você?'));
  assert.ok(recepcao.includes("Venha, escreva ou ligue."));
});

/* Toda seção redesenhada fala a mesma língua de movimento. */
const SECOES_COM_TRAVESSIA = [
  "atendimentos", "quem-somos", "recepcao", "cursos", "atividades",
  "cultura", "programacao", "profissionais", "saude-integrativa", "marketplace",
];

test("toda seção redesenhada tem a travessia montada", () => {
  for (const nome of SECOES_COM_TRAVESSIA) {
    const pagina = ler(`${nome}.html`);
    for (const marca of ["js/sections/movimento.js", "data-movimento", "data-leitura-progresso", "data-fio-da-jornada", "data-fio-nos"]) {
      assert.ok(pagina.includes(marca), `${nome}.html sem ${marca}`);
    }
    const capitulos = [...pagina.matchAll(/data-capitulo="([\w-]+)"/g)].map((item) => item[1]);
    assert.ok(capitulos.length >= 4, `${nome}.html tem poucos capítulos: ${capitulos.length}`);
    assert.equal(new Set(capitulos).size, capitulos.length, `${nome}.html repete nome de capítulo: ${capitulos.join(", ")}`);
    assert.equal(capitulos[0], "inicio", `${nome}.html não começa pela abertura`);

    const titulos = [...pagina.matchAll(/<h2[^>]*>([^<]+)</g)].map((item) => item[1].trim());
    assert.equal(new Set(titulos).size, titulos.length, `${nome}.html repete título de capítulo`);
  }
});

test("a passagem entre capítulos é um mecanismo só, lido da própria página", () => {
  const modulo = readFileSync(new URL("../../outputs/js/sections/movimento.js", import.meta.url), "utf8");
  assert.match(modulo, /function montarPassagens\(\)/);
  assert.match(movimento, /\.passagem \{[^}]*linear-gradient\(180deg, transparent, var\(--passagem/);
  /* Degradê de passagem escrito à mão em CSS de página volta a ser dois mecanismos. */
  for (const nome of ["atendimentos", "quem-somos", "recepcao", "cursos", "atividades"]) {
    const css = ler(`css/${nome}-redesign.css`);
    assert.doesNotMatch(css, /::after \{[^}]*linear-gradient\(180deg, rgba\([^)]*, 0\)/, `${nome}-redesign.css voltou a desenhar passagem à mão`);
  }
});
