import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { secaoDoHash, hashDaSecao, botaoAbrivel, secaoAtiva, ligarRotasDoAdmin, SECAO_INICIAL } from "../../outputs/js/admin/admin-rotas.js";

const entry = readFileSync(new URL("../../outputs/js/admin/admin-entry.js", import.meta.url), "utf8");

/* Nós falsos: o suficiente para exercer o módulo sem um DOM inteiro (mesmo espírito de admin-shell.test.mjs). */
function botao(secao, extras = {}) {
  const attrs = new Map([["data-section", secao]]);
  const b = {
    hidden: false,
    cliques: 0,
    getAttribute: (n) => attrs.get(n) ?? null,
    setAttribute: (n, v) => attrs.set(n, String(v)),
    removeAttribute: (n) => attrs.delete(n),
    closest(seletor) { return seletor === "[data-admin-nav] [data-section]" ? b : null; },
    click() { b.cliques += 1; b.aoClicar?.(b); },
    ...extras,
  };
  return b;
}

function montar({ hash = "", secoes = ["inicio", "atendimentos", "acessos", "blog", "editar-site"], escondidas = [], inertes = [] } = {}) {
  const botoes = Object.fromEntries(secoes.map((s) => [s, botao(s)]));
  for (const s of escondidas) botoes[s].hidden = true;
  for (const s of inertes) botoes[s].setAttribute("aria-disabled", "true");
  botoes.inicio?.setAttribute("aria-current", "page");

  const ouvintesPainel = new Map();
  const painel = {
    dataset: { adminSection: "inicio" },
    addEventListener: (t, f) => ouvintesPainel.set(t, f),
    removeEventListener: (t) => ouvintesPainel.delete(t),
  };
  const nav = {
    querySelectorAll: (sel) => (sel === "[data-section]" ? Object.values(botoes) : sel.includes("aria-current") ? Object.values(botoes).filter((b) => b.getAttribute("aria-current") === "page") : []),
    addEventListener() {}, removeEventListener() {},
    closest: () => painel,
  };
  /* Clicar numa seção faz o que a casca faz: troca a marca e a seção do painel. */
  for (const b of Object.values(botoes)) {
    b.aoClicar = (alvo) => {
      for (const o of Object.values(botoes)) o.removeAttribute("aria-current");
      alvo.setAttribute("aria-current", "page");
      painel.dataset.adminSection = alvo.getAttribute("data-section");
    };
  }

  const historico = [];
  const ouvintesJanela = new Map();
  const janela = {
    location: { hash },
    history: {
      pushState: (_s, _t, url) => { historico.push(["push", url]); janela.location.hash = url; },
      replaceState: (_s, _t, url) => { historico.push(["replace", url]); janela.location.hash = url; },
    },
    addEventListener: (t, f) => ouvintesJanela.set(t, f),
    removeEventListener: (t) => ouvintesJanela.delete(t),
  };
  const rotas = ligarRotasDoAdmin({ janela, nav, painel });
  /* O clique do usuário chega ao painel já com o alvo; o ouvinte do painel decide gravar o endereço. */
  const clicarComoUsuario = (secao) => {
    botoes[secao].click();
    ouvintesPainel.get("click")?.({ target: botoes[secao] });
  };
  return { botoes, painel, janela, historico, rotas, ouvintesJanela, clicarComoUsuario };
}

test("endereço: só '#/nome' vira seção; fragmentos de login e lixo são ignorados", () => {
  assert.equal(secaoDoHash("#/acessos"), "acessos");
  assert.equal(secaoDoHash("#/editar-site/"), "editar-site");
  assert.equal(secaoDoHash("#access_token=abc&type=recovery"), null);
  assert.equal(secaoDoHash("#/../x"), null);
  assert.equal(secaoDoHash("#/<script>"), null);
  assert.equal(secaoDoHash(""), null);
  assert.equal(secaoDoHash(undefined), null);
  assert.equal(hashDaSecao("acessos"), "#/acessos");
  assert.equal(SECAO_INICIAL, "inicio");
});

test("botaoAbrivel: recusa seção escondida, inerte ou inexistente", () => {
  const { botoes, rotas } = montar({ escondidas: ["editar-site"], inertes: ["blog"] });
  const nav = { querySelectorAll: () => Object.values(botoes) };
  assert.equal(botaoAbrivel(nav, "acessos"), botoes.acessos);
  assert.equal(botaoAbrivel(nav, "editar-site"), null);
  assert.equal(botaoAbrivel(nav, "blog"), null);
  assert.equal(botaoAbrivel(nav, "nao-existe"), null);
  assert.equal(secaoAtiva(montar().painel.dataset ? { querySelectorAll: () => [] } : null), null);
  rotas.destroy();
});

test("clicar numa seção grava #/seção no histórico, uma vez, e o Voltar anda seção a seção", () => {
  const { historico, clicarComoUsuario, janela, rotas } = montar();
  clicarComoUsuario("acessos");
  clicarComoUsuario("blog");
  assert.deepEqual(historico, [["push", "#/acessos"], ["push", "#/blog"]]);
  /* Clicar de novo na seção atual não empilha uma entrada repetida. */
  clicarComoUsuario("blog");
  assert.equal(historico.length, 2);
  assert.equal(janela.location.hash, "#/blog");
  rotas.destroy();
});

test("recarregar em #/acessos abre Usuários e acessos pelo mesmo clique da navegação", () => {
  const { botoes, painel, historico, rotas } = montar({ hash: "#/acessos" });
  assert.equal(rotas.aplicar(), true);
  assert.equal(botoes.acessos.cliques, 1);
  assert.equal(painel.dataset.adminSection, "acessos");
  assert.equal(botoes.acessos.getAttribute("aria-current"), "page");
  /* Abrir pelo endereço não escreve o endereço de novo. */
  assert.deepEqual(historico, []);
  /* Repetir não clica outra vez. */
  rotas.aplicar();
  assert.equal(botoes.acessos.cliques, 1);
  rotas.destroy();
});

test("sem endereço de seção, nada muda: a Visão geral segue como ponto de partida", () => {
  const { botoes, painel, historico, rotas } = montar({ hash: "" });
  assert.equal(rotas.aplicar(), false);
  assert.equal(painel.dataset.adminSection, "inicio");
  assert.equal(Object.values(botoes).reduce((n, b) => n + b.cliques, 0), 0);
  assert.deepEqual(historico, []);
  rotas.destroy();
});

test("seção que esta conta não abre não é aberta pelo endereço, e o endereço volta ao que vale", () => {
  const { botoes, painel, historico, janela, rotas } = montar({ hash: "#/editar-site", escondidas: ["editar-site"] });
  assert.equal(rotas.aplicar(), false);
  assert.equal(botoes["editar-site"].cliques, 0);
  assert.equal(painel.dataset.adminSection, "inicio");
  assert.deepEqual(historico, [["replace", "#/inicio"]]);
  assert.equal(janela.location.hash, "#/inicio");
  rotas.destroy();
});

test("conta só-Blog: pedir outra seção pelo endereço não abre nada além do Blog", () => {
  /* Para esta conta a casca esconde tudo menos o Blog; o endereço não é um caminho para o resto. */
  const { botoes, painel, rotas } = montar({
    hash: "#/atendimentos",
    escondidas: ["inicio", "atendimentos", "acessos", "editar-site"],
  });
  botoes.blog.aoClicar(botoes.blog);
  assert.equal(rotas.aplicar(), false);
  assert.equal(botoes.atendimentos.cliques, 0);
  assert.equal(painel.dataset.adminSection, "blog");
  rotas.destroy();
});

test("Voltar/Avançar (popstate) abre a seção do endereço; voltar à entrada sem seção abre a Visão geral", () => {
  const { botoes, painel, janela, ouvintesJanela, clicarComoUsuario, rotas } = montar();
  clicarComoUsuario("atendimentos");
  clicarComoUsuario("acessos");
  janela.location.hash = "#/atendimentos";
  ouvintesJanela.get("popstate")();
  assert.equal(painel.dataset.adminSection, "atendimentos");
  janela.location.hash = "";
  ouvintesJanela.get("popstate")();
  assert.equal(painel.dataset.adminSection, "inicio");
  assert.equal(botoes.inicio.getAttribute("aria-current"), "page");
  rotas.destroy();
});

test("troca manual do endereço (hashchange) também abre a seção", () => {
  const { painel, janela, ouvintesJanela, rotas } = montar();
  janela.location.hash = "#/blog";
  ouvintesJanela.get("hashchange")();
  assert.equal(painel.dataset.adminSection, "blog");
  rotas.destroy();
});

test("destroy solta os ouvintes", () => {
  const { ouvintesJanela, rotas } = montar();
  assert.ok(ouvintesJanela.has("popstate") && ouvintesJanela.has("hashchange"));
  rotas.destroy();
  assert.equal(ouvintesJanela.size, 0);
});

test("sem janela ou sem navegação, não quebra", () => {
  assert.deepEqual(Object.keys(ligarRotasDoAdmin({ janela: undefined, nav: null })).sort(), ["aplicar", "destroy"]);
});

test("a entrada do painel liga as rotas e as aplica com o menu da conta já definido, e de novo ao fim", () => {
  assert.match(entry, /import \{ ligarRotasDoAdmin \} from "\.\/admin-rotas\.js"/);
  assert.match(entry, /const rotas = panel \? ligarRotasDoAdmin\(/);
  const iTarefas = entry.indexOf("tarefas?.atualizar();");
  const iAplicar = entry.indexOf("rotas?.aplicar();");
  const iUltimo = entry.lastIndexOf("rotas?.aplicar();");
  assert.ok(iTarefas > 0 && iAplicar > iTarefas, "a primeira aplicação vem depois de definir o menu da conta");
  assert.ok(iUltimo > iAplicar, "e há uma aplicação final, com tudo montado");
  /* O foco vai para o título da seção aberta, não para o primeiro h2 do documento. */
  assert.match(entry, /\[data-admin-workspace\]:not\(\[hidden\]\) h2/);
});
