import assert from "node:assert/strict";
import test from "node:test";

import { createAdminShell, isInerte } from "../../outputs/js/admin/admin-shell.js";

/* Nós falsos, no mesmo espírito de home-block-expansion.test.mjs: o suficiente
   para exercer o módulo sem carregar um DOM inteiro. */
function no(atributos = {}) {
  const mapa = new Map(Object.entries(atributos).map(([k, v]) => [k, String(v)]));
  const ouvintes = new Map();
  return {
    hidden: false,
    textContent: "",
    ouvintes,
    setAttribute(nome, valor) { mapa.set(nome, String(valor)); },
    getAttribute(nome) { return mapa.get(nome) ?? null; },
    removeAttribute(nome) { mapa.delete(nome); },
    addEventListener(tipo, fn) { ouvintes.set(tipo, fn); },
    removeEventListener(tipo) { ouvintes.delete(tipo); },
    disparar(tipo, evento) { ouvintes.get(tipo)?.(evento); },
  };
}

function montar() {
  const secoes = {
    visao: no({ "data-section": "visao", "aria-disabled": "true" }),
    jornada: no({ "data-section": "jornada", "aria-current": "page" }),
    paginas: no({ "data-section": "paginas", "aria-disabled": "true" }),
  };
  const nav = no();
  nav.querySelectorAll = () => Object.values(secoes);

  const menuBotao = no({ "aria-expanded": "false" });
  const menu = no();
  menu.hidden = true;
  const sair = no();
  const restaurar = no();

  const root = {
    querySelector(seletor) {
      if (seletor === "[data-admin-nav]") return nav;
      if (seletor === "[data-admin-user-toggle]") return menuBotao;
      if (seletor === "[data-admin-user-menu]") return menu;
      if (seletor === "[data-admin-sign-out]") return sair;
      if (seletor === "[data-admin-reset]") return restaurar;
      if (seletor === "[data-admin-user-name]") return root.nome;
      if (seletor === "[data-admin-user-role]") return root.papel;
      if (seletor === "[data-admin-avatar]") return root.avatar;
      return null;
    },
    nome: no(),
    papel: no(),
    avatar: no(),
  };

  return { root, nav, secoes, menuBotao, menu, sair, restaurar };
}

function clique(alvo) {
  const evento = {
    impedido: false,
    target: { closest: () => alvo },
    preventDefault() { evento.impedido = true; },
  };
  return evento;
}

test("isInerte reconhece só o que está marcado", () => {
  assert.equal(isInerte(no({ "aria-disabled": "true" })), true);
  assert.equal(isInerte(no({ "aria-disabled": "false" })), false);
  assert.equal(isInerte(no()), false);
  assert.equal(isInerte(null), false);
});

/*
 * A asserção central deste arquivo.
 *
 * `aria-disabled` conta a história para o leitor de tela, mas não impede nada
 * sozinho — o botão continua clicável e alcançável pelo Tab. Sem esta recusa,
 * quem insistisse cairia numa seção que não existe.
 */
test("clique numa seção inerte não muda a seção ativa", () => {
  const { root, nav, secoes } = montar();
  createAdminShell({ root });

  const evento = clique(secoes.visao);
  nav.disparar("click", evento);

  assert.equal(secoes.jornada.getAttribute("aria-current"), "page");
  assert.equal(secoes.visao.getAttribute("aria-current"), null);
  /* Sem preventDefault a página salta para o topo em navegadores que tratam o
     botão como submit, e a recusa vira um pulo sem explicação. */
  assert.equal(evento.impedido, true, "o clique recusado precisa ser impedido");
});

test("clique numa seção viva troca a tela, não só a marca", () => {
  const jornada = no({ "data-admin-workspace": "jornada" });
  const financeiro = no({ "data-admin-workspace": "financeiro" });
  financeiro.hidden = true;
  const { root, nav, secoes } = montar();
  root.dataset = {};
  root.querySelectorAll = () => [jornada, financeiro];
  const viva = no({ "data-section": "financeiro" });
  nav.querySelectorAll = () => [secoes.jornada, viva];
  createAdminShell({ root });

  nav.disparar("click", clique(viva));

  assert.equal(root.dataset.adminSection, "financeiro");
  assert.equal(jornada.hidden, true);
  assert.equal(financeiro.hidden, false);
});

test("clique numa seção viva move a marca de ativa", () => {
  const { root, nav, secoes } = montar();
  /* A jornada continua marcada de propósito: o que este teste precisa provar é
     que a marca ANTIGA sai, e não só que a nova entra. */
  const viva = no({ "data-section": "outra" });
  nav.querySelectorAll = () => [secoes.visao, secoes.jornada, viva];
  createAdminShell({ root });

  nav.disparar("click", clique(viva));

  assert.equal(viva.getAttribute("aria-current"), "page");
  assert.equal(secoes.jornada.getAttribute("aria-current"), null);
});

test("o menu do usuário abre e fecha", () => {
  const { root, menuBotao, menu } = montar();
  createAdminShell({ root });

  menuBotao.disparar("click");
  assert.equal(menuBotao.getAttribute("aria-expanded"), "true");
  assert.equal(menu.hidden, false);

  menuBotao.disparar("click");
  assert.equal(menuBotao.getAttribute("aria-expanded"), "false");
  assert.equal(menu.hidden, true);
});

test("sair e restaurar chamam quem os pediu, uma vez cada", () => {
  const { root, sair, restaurar } = montar();
  let saiu = 0;
  let restaurou = 0;
  createAdminShell({ root, onSignOut: () => { saiu += 1; }, onReset: () => { restaurou += 1; } });

  sair.disparar("click");
  restaurar.disparar("click");

  assert.equal(saiu, 1);
  assert.equal(restaurou, 1);
});

test("o avatar sai das iniciais do nome", () => {
  const { root } = montar();
  const casca = createAdminShell({ root });

  casca.setUser({ name: "Ana Duarte", role: "Administradora" });

  assert.equal(root.nome.textContent, "Ana Duarte");
  assert.equal(root.papel.textContent, "Administradora");
  assert.equal(root.avatar.textContent, "AD");
});

test("destroy solta os ouvintes", () => {
  const { root, nav, sair } = montar();
  createAdminShell({ root }).destroy();

  assert.equal(nav.ouvintes.size, 0);
  assert.equal(sair.ouvintes.size, 0);
});
