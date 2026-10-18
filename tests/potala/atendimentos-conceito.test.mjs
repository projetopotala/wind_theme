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
  const html = ler("atendimentos-conceito.html");
  const atual = ler("atendimentos.html");
  assert.match(html, /css\/atendimentos-conceito\.css/);
  assert.match(html, /js\/atendimentos-conceito\.js/);
  assert.doesNotMatch(html, /portal-header\.css|portal-header__nav/);
  assert.doesNotMatch(atual, /atendimentos-conceito/);
});

test("o prólogo de três maneiras de chegar foi removido", () => {
  const html = ler("atendimentos-conceito.html");
  assert.doesNotMatch(html, /class="atmosphere-sequence"/);
  assert.doesNotMatch(html, /Três maneiras de chegar/i);
  assert.doesNotMatch(html, /Antes de escolher,\s*<br>permita-se observar/i);
});

test("o cabeçalho usa busca compacta e o painel de conta da Home", () => {
  const html = ler("atendimentos-conceito.html");
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
  assert.match(ler("transcendido.html"), /<body data-page="transcendido">/);
  assert.match(css, /\.journey-thread\{z-index:2\}/, "o ensaio editorial preserva a camada original");
  assert.match(css, /body\[data-page="transcendido"\] \.journey-thread\{z-index:1;opacity:\.16;clip-path:inset\(100vh 0 0\)\}/, "a Home mantém a linha discreta atrás da leitura");
  assert.match(css, /body\[data-page="transcendido"\] #papel\{z-index:2\}/, "o fundo do mapa deve mascarar a linha na seção editorial");
  assert.match(css, /@media\(max-width:980px\)\{body\[data-page="transcendido"\] \.journey-thread\{display:none\}\}/, "a linha não pode atravessar o texto em coluna única");
  assert.match(css, /\.reflection-choices/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /backdrop-filter|filter:\s*blur/);
});

test("mapa conceitual reserva espaço para a órbita e mantém os nós legíveis no celular", () => {
  const html = ler("transcendido.html");
  const section = html.match(/<section class="section picshi"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section, "seção do mapa conceitual ausente");
  assert.equal((section.match(/class="map-node /g) ?? []).length, 6);
  assert.match(html, /\.picshi-map\{[^}]*width:100%;[^}]*aspect-ratio:1/,
    "a órbita precisa ocupar a coluna, não encolher até o tamanho da bolha central");
  assert.match(html, /\.map-grid\{[^}]*grid-template-columns:minmax\(0,1\.05fr\) minmax\(0,\.95fr\)/,
    "o cartão não pode impor largura mínima maior que a coluna disponível");
  assert.match(html, /@media\(max-width:480px\)\{[\s\S]*?\.picshi-map \.map-node\{position:relative;inset:auto;/,
    "no celular, os nós devem participar do fluxo em vez de cobrir a bolha");
  assert.match(html, /\.map-node\.n1\.active\{transform:translateX\(-50%\) scale\(1\.05\)\}/,
    "o estado ativo não pode retirar a âncora central do primeiro nó");
});

test("o módulo complementar mantém interações locais e não chama rede", () => {
  const materias = ler("js/atendimentos-materia.js");
  assert.doesNotMatch(materias, /fetch\(|XMLHttpRequest|supabase|localStorage|sessionStorage/);
  const js = ler("js/atendimentos-conceito.js");
  assert.match(js, /setupMural/);
  assert.match(js, /setupAppointmentForm/);
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

test("solicitação da Home nasce bloqueada e não oferece disponibilidade fictícia", () => {
  const html = ler("transcendido.html");
  const form = html.match(/<form[^>]*id="bookForm"[\s\S]*?<\/form>/)[0];
  assert.match(form, /<fieldset[^>]*disabled/);
  assert.match(form, /id="bookContinue"[^>]*disabled>Envio indisponível/);
  assert.doesNotMatch(form, /demonstrativo|name="profissional"|name="horario"|Exemplo de agenda/);
  for (const name of ["service", "modality", "preferred_period", "contact_type"]) {
    assert.match(html, new RegExp(`<select name="${name}" required><option value="">`));
  }
  for (const name of ["preferred_date", "requester_name", "contact"]) {
    assert.match(form, new RegExp(`<label>[^<]+<input name="${name}"[^>]*required>`));
  }
});

test("as imagens reais são locais e apresentadas em molduras editoriais", () => {
  const html = ler("atendimentos-conceito.html");
  const hero = output("media/atendimentos-acolhimento.webp");
  const people = output("media/profissionais-encontro.webp");
  assert.ok(existsSync(hero) && existsSync(people), "imagens editoriais ausentes");
  assert.ok(statSync(hero).size < 900_000, "imagem de acolhimento fora do orçamento");
  assert.match(html, /media\/atendimentos-acolhimento\.webp/);
  assert.match(html, /media\/profissionais-encontro\.webp/);
  assert.match(html, /class="hero-card__image"/);
});

test("o convite para rolar fica no pé do Bem-vindo, centrado, e não sob a foto da Recepção", () => {
  const html = ler("atendimentos-conceito.html");
  const css = ler("css/atendimentos-conceito.css");
  const entrada = html.slice(html.indexOf('<section class="entrada"'), html.indexOf("</section>", html.indexOf('<section class="entrada"')));
  const hero = html.slice(html.indexOf('<section class="hero"'), html.indexOf("</section>", html.indexOf('<section class="hero"')));
  assert.match(entrada, /class="scrollhint entrada__scrollhint"[^>]*>[\s\S]*?role para explorar/);
  assert.doesNotMatch(hero, /scrollhint/, "a Recepção não repete o convite");
  assert.equal(html.match(/role para explorar/g).length, 1);
  assert.match(html, /\.scrollhint\{position:absolute;left:50%;bottom:[^;]+;transform:translateX\(-50%\)/);
  assert.match(css, /\.entrada__scrollhint\{[^}]*bottom:/);
});

test("entre o Bem-vindo e a Recepção há um respiro que muda de cor aos poucos", () => {
  const html = ler("atendimentos-conceito.html");
  const css = ler("css/atendimentos-conceito.css");
  assert.match(html, /<\/section>\s*<div class="entrada__respiro" aria-hidden="true"><\/div>\s*<section class="hero"/);
  assert.match(css, /\.entrada__respiro\{[^}]*min-height:clamp\([^}]*background:linear-gradient\(180deg,[^}]*#f6f3ea[^}]*#e8eee8/);
});
