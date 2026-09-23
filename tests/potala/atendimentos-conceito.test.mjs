import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const output = (path) => new URL(`../../outputs/${path}`, import.meta.url);
const ler = (path) => {
  const url = output(path);
  assert.ok(existsSync(url), `arquivo isolado ausente: outputs/${path}`);
  return readFileSync(url, "utf8");
};

test("a experiência nasce em uma rota isolada", () => {
  const html = ler("transcendido.html");
  const atual = ler("atendimentos.html");
  assert.match(html, /css\/atendimentos-conceito\.css/);
  assert.match(html, /js\/atendimentos-conceito\.js/);
  assert.doesNotMatch(html, /portal-header\.css|portal-header__nav/);
  assert.doesNotMatch(atual, /atendimentos-conceito/);
});

test("a página preserva a jornada integral da visão Tironi", () => {
  const html = ler("transcendido.html");
  const capitulos = ["inicio", "saude", "vivemos", "investigar", "caminhos-do-cuidado", "papel", "praca", "oraculos", "profissionais", "especiais", "virtual", "agendar"];
  for (const id of capitulos) assert.match(html, new RegExp(`<section[^>]+id="${id}"`), `capítulo ausente: ${id}`);
  assert.match(html, /<footer[^>]+id="encerramento"/);
  for (const texto of [
    "Você chegou à página de atendimentos do Instituto Potala",
    "Tudo começa por compreender a saúde",
    "Saúde é uma história em movimento",
    "A vida não acontece do lado de fora",
    "Sintoma não é diagnóstico",
    "Nem todo cuidado começa no mesmo lugar",
    "Cuidar não cabe em uma só gaveta",
    "Muitos caminhos. Naturezas diferentes.",
    "Grande Praça dos Atendimentos",
    "Símbolos não substituem decisões",
    "Técnicas são oferecidas por pessoas",
    "Há formas de cuidado desenhadas para ampliar acesso",
    "Alguns encontros podem atravessar a distância",
    "Você não precisa sair daqui com todas as respostas",
  ]) assert.ok(html.includes(texto), `conteúdo obrigatório ausente: ${texto}`);
});

test("matérias, Revista e Biblioteca continuam integradas à narrativa", () => {
  const html = ler("transcendido.html");
  assert.match(html, /MATÉRIA PRINCIPAL/i);
  assert.match(html, /REVISTA POTALA/i);
  assert.match(html, /Biblioteca Potala/i);
  assert.match(html, /A dieta saudável está menos interessada em perfeição/i);
  assert.match(html, /Destino, acaso e livre-arbítrio/i);
  assert.match(html, /Responsabilidade não é a mesma coisa que culpa/i);
  assert.match(html, /class="source-reading"/);
});

test("o conteúdo editorial do Tironi permanece integral e ganha prévias expansíveis", () => {
  const html = ler("transcendido.html");
  assert.equal((html.match(/<details class="source-reading"/g) || []).length, 4);
  assert.equal((html.match(/<details class="source-reading" open>/g) || []).length, 0);
  assert.equal((html.match(/Continuar a leitura/g) || []).length, 4);
  assert.equal((html.match(/class="source-reading__text"/g) || []).length, 4);
  /* A mídia de cada matéria agora é o conjunto de slides da pauta. */
  assert.equal((html.match(/class="source-reading__media[ "]/g) || []).length, 4);

  for (const requiredText of [
    "A dieta saudável está menos interessada em perfeição — e mais em padrão",
    "Talvez a regularidade do sono conte uma história que as horas, sozinhas, não contam",
    "O corpo não precisa de performance para se beneficiar do movimento",
    "Prevenir também é preservar aquilo que permite continuar vivendo a própria vida",
    "Talvez aquilo que você esteja vivendo tenha mais de uma camada",
    "Responsabilidade sem culpa",
    "O que significa viver bem?",
    "Quando uma explicação ajuda — e quando aprisiona",
    "Quando houver preocupação, persistência ou impacto relevante",
    "Depois de compreender o contexto, diferentes recursos podem ser combinados",
    "psicologia e experiência humana",
    "Muitos caminhos. Naturezas diferentes. Uma apresentação responsável",
    "“Estou com dor lombar.”",
    "Massoterapia",
    "Atendimentos online",
    "Pouco conhecidos",
    "Uma pergunta pode mudar a forma de olhar para uma escolha",
    "Baralho Cigano",
    "Marina Oliveira",
    "João Silva",
    "Ana Costa",
    "Atendimentos solidários",
    "Regeneração Celular",
    "Prepare o ambiente",
    "Receba o acesso",
    "Sua escolha",
    ">Blog<",
    ">Cursos<",
    ">Atividades<",
    ">Loja<",
    ">Contato<",
  ]) {
    assert.ok(html.includes(requiredText), `conteúdo Tironi ausente: ${requiredText}`);
  }
});

test("a apresentação adota a linguagem visual do segundo modelo", () => {
  const html = ler("transcendido.html");
  /*
   * Os quadros que repetiam as pautas (research-board, inner-map, carepaths-layout)
   * saíram a pedido: "visual mais moderno sem poluição visual". O conteúdo deles
   * foi para as legendas dos slides de cada matéria.
   */
  for (const marker of ["hero-grid", "hero-card", "section-head", "picshi-map", "discovery-hero", "portal-window", "materia-slides", "conexao"]) {
    assert.ok(html.includes(marker), `estrutura do segundo modelo ausente: ${marker}`);
  }
  assert.doesNotMatch(html, /hero-cinemagraph|hero-v4/);
});

test("a jornada conecta atmosfera, aprofundamento, reflexão e caminhos reais", () => {
  const html = ler("transcendido.html");
  assert.match(html, /data-journey-thread/);
  assert.match(html, /data-journey-path/);
  assert.match(html, /id="reflexao"/);
  assert.match(html, /Como você tem cuidado de si\?/);
  assert.match(html, /data-reflection-choice="pausa"/);
  assert.match(html, /data-reflection-feedback/);
  assert.match(html, /href="#praca"[^>]*>[^<]*Conheça os Atendimentos/i);
  assert.match(html, /href="blog\.html"[^>]*>[^<]*Explorar conhecimento/i);
  assert.match(html, /href="#profissionais"[^>]*>[^<]*Encontrar pessoas/i);
});

test("o prólogo de três maneiras de chegar foi removido", () => {
  const html = ler("transcendido.html");
  assert.doesNotMatch(html, /class="atmosphere-sequence"/);
  assert.doesNotMatch(html, /Três maneiras de chegar/i);
  assert.doesNotMatch(html, /Antes de escolher,\s*<br>permita-se observar/i);
});

test("as experiências funcionais permanecem identificáveis", () => {
  const html = ler("transcendido.html");
  for (const marker of ["id=\"therapySearch\"", "id=\"therapySort\"", "id=\"mapCaption\"", "id=\"muralName\"", "id=\"bookForm\"", "id=\"conciergeBtn\""]) {
    assert.ok(html.includes(marker), `contrato ausente: ${marker}`);
  }
  assert.match(html, /<img[^>]+alt="[^"]+"/);
  assert.match(html, /perfis abaixo são demonstrativos/i);
  assert.match(html, /Nenhum horário, valor ou profissional apresentado aqui corresponde a disponibilidade real/i);
});

test("o cabeçalho usa busca compacta e o painel de conta da Home", () => {
  const html = ler("transcendido.html");
  const css = ler("css/atendimentos-conceito.css");
  const js = ler("js/atendimentos-conceito.js");
  const brand = html.match(/<a class="brand"[\s\S]*?<\/a>/);
  const searchButton = html.match(/<button[^>]*id="searchOpen"[^>]*>([\s\S]*?)<\/button>/);
  const profileButton = html.match(/<button[^>]*data-conta-gatilho[^>]*>([\s\S]*?)<\/button>/);

  assert.ok(brand, "marca do cabeçalho ausente");
  assert.doesNotMatch(brand[0], /<small>|Atendimentos/i);
  assert.ok(searchButton, "botão de busca ausente");
  assert.ok(profileButton, "botão de perfil ausente");
  assert.match(searchButton[0], /aria-label="Buscar na página"/);
  assert.match(profileButton[0], /aria-label="Seu espaço no Potala"/);
  assert.match(profileButton[0], /aria-haspopup="dialog"/);
  assert.match(searchButton[1], /<svg[\s\S]*<\/svg>/);
  assert.match(profileButton[1], /class="conta-icone"/);
  assert.match(profileButton[1], /class="conta-iniciais"/);
  assert.doesNotMatch(html, /id="menuOpen"/);
  assert.match(js, /import\("\.\/conta\/conta\.js"\)/);
  assert.match(css, /\.top-action-icon/);
  assert.match(css, /\.top-actions\s+\.top-action-icon\s*\{[^}]*display:\s*grid/i);
});

test("a adaptação preserva acessibilidade e composições editoriais", () => {
  const css = ler("css/atendimentos-conceito.css");
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.source-reading/);
  assert.match(css, /\.hero-card__image/);
  assert.match(css, /\.materia-slides/);
  assert.match(css, /\.source-reading\[open\]\s+\.source-reading__body/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1\.2fr\)\s+minmax\(280px,\s*\.8fr\)/);
  /* A capitular fica na abertura da prévia; a leitura continua em versalete. */
  assert.match(css, /\.materia-abertura::first-letter/);
  assert.match(css, /\.source-reading__text\s*>\s*p:first-child::first-line/);
  assert.match(css, /\.journey-thread/);
  assert.match(css, /\.reflection-choices/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /backdrop-filter|filter:\s*blur/);
});

test("o módulo complementar mantém interações locais e não chama rede", () => {
  const materias = ler("js/atendimentos-materia.js");
  assert.doesNotMatch(materias, /fetch\(|XMLHttpRequest|supabase|localStorage|sessionStorage/);
  const js = ler("js/atendimentos-conceito.js");
  assert.match(js, /setupMural/);
  assert.match(js, /setupDemoSchedule/);
  assert.match(js, /setupJourneyThread/);
  assert.match(js, /setupReflection/);
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|supabase|localStorage|sessionStorage/);
});

test("o progresso da linha orgânica é limitado entre zero e um", async () => {
  const { journeyProgress } = await import("../../outputs/js/atendimentos-conceito.js");
  assert.equal(journeyProgress(-20, 1000), 0);
  assert.equal(journeyProgress(500, 1000), 0.5);
  assert.equal(journeyProgress(1200, 1000), 1);
  assert.equal(journeyProgress(100, 0), 0);
});

test("as imagens reais são locais e apresentadas em molduras editoriais", () => {
  const html = ler("transcendido.html");
  const hero = output("media/atendimentos-acolhimento.webp");
  const people = output("media/profissionais-encontro.webp");
  assert.ok(existsSync(hero) && existsSync(people), "imagens editoriais ausentes");
  assert.ok(statSync(hero).size < 900_000, "imagem de acolhimento fora do orçamento");
  assert.match(html, /media\/atendimentos-acolhimento\.webp/);
  assert.match(html, /media\/profissionais-encontro\.webp/);
  assert.match(html, /class="hero-card__image"/);
});
