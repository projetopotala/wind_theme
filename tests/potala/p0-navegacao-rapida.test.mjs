import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const raiz = new URL("../../outputs/", import.meta.url);
const ler = (nome) => readFileSync(new URL(nome, raiz), "utf8");
const { MENU_GRUPOS, MENU_ITEMS, menuHtml } = await import("../../outputs/js/shared/portal-menu.js");
const { ROTAS } = await import("../../outputs/js/conta/spa/roteador.js");
const { renderizarVisitante } = await import("../../outputs/js/conta/spa/vistas/comum.js");

/*
 * P0 | navegação rápida: da Home, as quatro ações principais (agendar, cursos,
 * profissionais, Blog) ficam a um clique; pelo menu, a dois.
 */
const home = ler("atendimentos-conceito.html");
const secao = home.match(/<section class="acesso-rapido"[\s\S]*?<\/section>/)?.[0] || "";

test("a Home tem o acesso rápido logo depois do Bem-vindo e antes das cenas", () => {
  assert.ok(secao, "a seção de acesso rápido existe");
  const pos = home.indexOf('<section class="acesso-rapido"');
  assert.ok(pos > home.indexOf('id="boas-vindas"'), "depois do Bem-vindo");
  assert.ok(pos < home.indexOf('id="inicio"'), "antes da primeira cena");
  assert.match(secao, /aria-labelledby="acesso-rapido-titulo"/);
  assert.match(secao, /<h2 class="acesso-rapido__titulo" id="acesso-rapido-titulo">O que você procura hoje\?<\/h2>/);
  assert.match(home, /<link rel="stylesheet" href="css\/home-acesso-rapido\.css">/);
});

test("as quatro ações usam rotas reais, cada uma com nome compreensível", () => {
  const acoes = [...secao.matchAll(/<a class="acesso-rapido__acao" href="([^"]+)" data-acesso-rapido="([^"]+)">([\s\S]*?)<\/a>/g)];
  assert.deepEqual(acoes.map((a) => [a[2], a[1]]), [
    ["agendar", "/meu-potala/atendimentos"],
    ["cursos", "cursos.html"],
    ["profissionais", "profissionais.html"],
    ["blog", "blog.html"],
  ]);
  for (const [, href] of acoes) {
    if (href === "/meu-potala/atendimentos") continue;
    assert.ok(existsSync(new URL(href, raiz)), `destino inexistente: ${href}`);
  }
  assert.ok(ROTAS.some((r) => r.caminho === "atendimentos"), "a rota de atendimentos do Meu Potala existe");
  const vercel = JSON.parse(ler("vercel.json"));
  assert.ok(vercel.rewrites.some((r) => r.source === "/meu-potala/:path*"), "a Vercel entrega o Meu Potala nas subrotas");
  for (const a of acoes) {
    const texto = a[3].replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    assert.ok(texto.length > 20, `texto acessível curto demais: ${texto}`);
    assert.match(a[3], /<svg[^>]*aria-hidden="true"/, "ícones ficam fora do leitor de tela");
  }
});

test("o acesso rápido não promete matrícula, vagas nem disponibilidade", () => {
  const texto = secao.replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(texto, /matr[ií]cula|inscreva-se agora|vagas?\b|dispon[ií]vel|garantid/i);
  assert.match(texto, /entrar na sua conta/i, "o agendamento avisa que pede conta");
  assert.match(texto, /confirmado pelo Instituto/i, "pedido não é consulta confirmada");
});

test("a Home preserva as 13 cenas, a Travessia e a Recepção", () => {
  assert.equal((home.match(/<section class="home-scene\b/g) || []).length, 13);
  assert.match(home, /<section class="entrada" id="boas-vindas"/);
  assert.match(home, /href="recepcao\.html"/);
  assert.match(home, /href="travessia\.html"/);
});

test("o menu agrupa os caminhos e começa por Agendar atendimento", () => {
  assert.deepEqual(MENU_GRUPOS.map((g) => g.titulo), ["Serviços", "Aprendizado", "Conteúdos", "Instituto", "Conta"]);
  for (const item of MENU_ITEMS) assert.ok(MENU_GRUPOS.some((g) => g.key === item.grupo), `${item.key} sem grupo`);
  assert.equal(MENU_ITEMS[0].key, "agendar");
  const html = menuHtml("");
  assert.equal((html.match(/<section class="potala-menu__grupo" aria-labelledby="potala-menu-grupo-/g) || []).length, 5);
  assert.equal((html.match(/<h2 class="potala-menu__grupo-titulo"/g) || []).length, 5);
  assert.ok(html.indexOf('href="/meu-potala/atendimentos"') < html.indexOf('href="atendimentos.html"'));
  // Home e Travessia continuam experiências distintas no menu
  assert.ok(html.includes('href="atendimentos-conceito.html"') && html.includes('href="travessia.html"'));
  // destinos preservados da versão anterior
  for (const h of ["/transcender.html", "travessia.html", "atendimentos-conceito.html", "atendimentos.html", "transcendido.html", "profissionais.html", "cursos.html", "eventos.html", "blog.html", "revista.html", "marketplace.html", "recepcao.html", "/meu-potala"]) {
    assert.ok(html.includes(`href="${h}"`), `destino removido: ${h}`);
  }
});

test("quem abre o agendamento sem conta entende o que fazer", () => {
  const html = renderizarVisitante({ status: "visitante" }, "atendimentos");
  assert.match(html, /Agendar um atendimento/);
  assert.match(html, /entre na sua conta ou crie uma/);
  assert.match(html, /data-conta-abrir="entrar"/);
  const geral = renderizarVisitante({ status: "visitante" });
  assert.match(geral, /Seu espaço no Potala/);
});
