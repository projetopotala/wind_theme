import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { criarPainelDeBusca } from "../../outputs/js/home/busca-painel.js";

/* Um DOM mínimo: só o que o painel toca. Montar o controlador da jornada
   inteiro exigiria palco, paisagem e estrada — e foi por não haver como
   exercitar isto que o fechar nunca chegou a existir. */
function palco({ comFoco = true } = {}) {
  const ouvintes = new Map();
  const alvo = () => ({
    ouvintes: new Map(),
    addEventListener(tipo, fn) { this.ouvintes.set(tipo, fn); },
    removeEventListener(tipo) { this.ouvintes.delete(tipo); },
    disparar(tipo, evento = {}) { this.ouvintes.get(tipo)?.(evento); },
  });

  /* A lupa: o controle que abre a busca e para onde o foco volta ao fechar. */
  const lupa = { focado: 0, focus() { this.focado += 1; } };

  const forma = {
    hidden: true,
    ...alvo(),
  };
  forma.ouvintes = ouvintes;
  forma.addEventListener = (tipo, fn) => ouvintes.set(tipo, fn);
  forma.removeEventListener = (tipo) => ouvintes.delete(tipo);
  forma.disparar = (tipo, evento = {}) => ouvintes.get(tipo)?.(evento);

  const campo = { value: "", focado: 0, focus() { this.focado += 1; } };
  const aviso = { textContent: "" };
  const fechar = alvo();

  const painel = criarPainelDeBusca({
    forma, campo, aviso, fechar, foco: comFoco ? lupa : null,
  });
  return { painel, forma, campo, aviso, fechar, lupa };
}

test("a busca abre e leva o foco para o campo", () => {
  const p = palco();
  p.painel.mostrar();
  assert.equal(p.forma.hidden, false);
  /* Sem isto, quem abriu a busca precisa de um segundo gesto — clicar no campo
     — antes de poder digitar o que veio procurar. */
  assert.equal(p.campo.focado, 1);
});

test("o X fecha a busca", () => {
  /*
   * ESTE É O DEFEITO QUE ORIGINOU O MÓDULO.
   *
   * A busca só se fechava sozinha ao encontrar alguma coisa. Quem abrisse por
   * curiosidade, ou procurasse o que a jornada não tem, ficava com o campo na
   * tela sem nenhum jeito de dispensá-lo.
   */
  const p = palco();
  p.painel.mostrar();
  p.fechar.disparar("click");
  assert.equal(p.forma.hidden, true);
});

test("Escape fecha a busca", () => {
  /* No teclado é o primeiro gesto que se tenta num painel sobreposto. */
  const p = palco();
  p.painel.mostrar();
  let propagou = true;
  p.forma.disparar("keydown", { key: "Escape", stopPropagation() { propagou = false; } });
  assert.equal(p.forma.hidden, true);
  /* A jornada escuta teclas no documento. Sem parar aqui, o mesmo Escape que
     fecha a busca seguiria adiante e fecharia também o bloco aberto atrás. */
  assert.equal(propagou, false);
});

test("outras teclas nao fecham a busca", () => {
  /* Digitar "Enter" ou uma letra no campo não pode dispensar o painel. */
  const p = palco();
  p.painel.mostrar();
  for (const key of ["Enter", "a", "Tab", "ArrowDown"]) {
    p.forma.disparar("keydown", { key });
    assert.equal(p.forma.hidden, false, `"${key}" fechou a busca`);
  }
});

test("a lupa alterna: aberta, o segundo clique fecha", () => {
  const p = palco();
  p.painel.alternar();
  assert.equal(p.forma.hidden, false);
  p.painel.alternar();
  assert.equal(p.forma.hidden, true);
  p.painel.alternar();
  assert.equal(p.forma.hidden, false);
});

test("fechar limpa o aviso e preserva o que foi digitado", () => {
  /*
   * "Nada na jornada responde a isso" é resposta de uma pergunta que já passou:
   * reaparecer na próxima abertura faria a busca começar dizendo não a quem
   * ainda não perguntou. O termo fica, porque quem reabre costuma estar
   * corrigindo um erro de digitação.
   */
  const p = palco();
  p.painel.mostrar();
  p.campo.value = "xilofone";
  p.aviso.textContent = "Nada na jornada responde a isso.";
  p.painel.esconder();
  assert.equal(p.aviso.textContent, "");
  assert.equal(p.campo.value, "xilofone");
});

test("ao fechar, o foco volta para a lupa", () => {
  /*
   * ISTO JÁ APONTOU PARA O NADA.
   *
   * O alvo era o `summary` de um menu recolhível, porque a lupa morava dentro
   * dele e elemento em `details` fechado não recebe foco. O menu saiu junto com
   * a barra lateral e o alvo deixou de existir: fechar a busca largava o foco
   * no corpo da página, e quem navega por teclado recomeçava do topo. Nada na
   * tela denunciava isso.
   */
  const p = palco();
  p.painel.mostrar();
  p.painel.esconder();
  assert.equal(p.lupa.focado, 1);
});

test("a busca que ACERTA fecha sem puxar o foco de volta", () => {
  /* Ali a viagem levou a pessoa até o bloco encontrado; devolver o foco ao
     canto da tela desfaria exatamente o que a busca acabou de fazer. */
  const p = palco();
  p.painel.mostrar();
  p.painel.esconder({ devolverFoco: false });
  assert.equal(p.forma.hidden, true);
  assert.equal(p.lupa.focado, 0);
});

test("destroy solta os ouvintes", () => {
  const p = palco();
  p.painel.mostrar();
  p.painel.destroy();
  p.fechar.disparar("click");
  p.forma.disparar("keydown", { key: "Escape" });
  assert.equal(p.forma.hidden, false, "o painel continuou escutando depois de destruído");
});

test("sem alvo de foco, fechar nao vira excecao", () => {
  /* O alvo vem de uma consulta ao DOM que pode não achar nada, e isso não pode
     interromper o fechamento no meio. */
  const p = palco({ comFoco: false });
  p.painel.mostrar();
  assert.doesNotThrow(() => p.painel.esconder());
  assert.equal(p.forma.hidden, true);
  assert.equal(p.lupa.focado, 0);
});

test("sem formulario, o painel nao explode", () => {
  /* O módulo é montado a partir de uma consulta ao DOM que pode não achar nada
     — numa página sem a barra lateral, por exemplo. */
  const vazio = criarPainelDeBusca({});
  assert.doesNotThrow(() => { vazio.mostrar(); vazio.esconder(); vazio.alternar(); vazio.destroy(); });
  assert.equal(vazio.aberta(), false);
});

/* ------------------------------------------------------------------
 * A ligação com a página
 * ------------------------------------------------------------------ */

test("a barra lateral desenha o botao de fechar", async () => {
  /*
   * No telefone não há Escape, e fechar clicando fora foi descartado de
   * propósito: clicar fora é exatamente o que se faz para alcançar o teclado.
   * Sem o X, o celular fica sem saída nenhuma — que foi o defeito relatado.
   */
  const cenas = await readFile(new URL("../../outputs/js/home/home-scenes.js", import.meta.url), "utf8");
  assert.match(cenas, /data-journey-fechar-busca/);
  assert.match(cenas, /aria-label="Fechar busca"/);

  const css = await readFile(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");
  /* Três colunas: campo, buscar e fechar. Com duas, o X caía na linha de baixo
     e empurrava o aviso para fora do lugar. */
  assert.match(css, /\.journey-busca \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto auto;/);
});

test("o controlador liga o painel em vez de so abrir", async () => {
  const controlador = await readFile(new URL("../../outputs/js/home/home-controller.js", import.meta.url), "utf8");
  assert.match(controlador, /criarPainelDeBusca\(/);
  assert.match(controlador, /data-journey-fechar-busca/);
  /* E o alvo do foco existe: aponta para a lupa, e nao para um menu que saiu. */
  assert.match(controlador, /foco: abrirBusca,/);
  assert.match(controlador, /painelDeBusca\.alternar\(\)/);
  assert.match(controlador, /painelDeBusca\.destroy\(\)/);
  /* Ninguém mais mexe no `hidden` por fora: era assim que o fechar ficava só
     no caminho do acerto. */
  assert.doesNotMatch(controlador, /formaDeBusca\.hidden\s*=/);
});
