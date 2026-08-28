import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/*
 * Cada passagem tem duas metades: a página que sai fecha um véu e a que chega
 * abre o dela. O que se testa aqui é a costura entre elas — se as metades
 * discordarem, a travessia pisca no meio, e é justamente esse piscar que não
 * aparece em nenhum teste de unidade das peças isoladas.
 */

/** Devolve o bloco de declarações da primeira regra que cita o seletor. */
function blocoDaRegra(css, seletor) {
  const inicio = css.indexOf(seletor);
  assert.notEqual(inicio, -1, `regra ausente: ${seletor}`);
  const abre = css.indexOf("{", inicio);
  const fecha = css.indexOf("}", abre);
  return css.slice(abre, fecha);
}

const ESCURO = "#0d100e";
const CLARO = "#fbf6ea";

test("as páginas de destino nascem cobertas antes da primeira pintura", async () => {
  for (const pagina of ["outputs/palacio.html", "outputs/transcender.html"]) {
    const html = await readFile(pagina, "utf8");
    const cabeca = html.slice(0, html.indexOf("</head>"));
    assert.match(cabeca, /entry-pending/, `${pagina} precisa marcar o véu no <head>`);
    // Com `defer` ou como módulo o primeiro quadro já teria sido pintado sem o
    // véu — que é exatamente o piscar a evitar.
    const script = cabeca.slice(cabeca.indexOf("<script", cabeca.indexOf("entry-pending") - 900));
    assert.doesNotMatch(script.slice(0, script.indexOf(">")), /defer|type=/);
  }
});

test("quem sai grava o `entry` que faz o destino abrir o véu", async () => {
  const palace = await readFile("outputs/js/palacio/palace-controller.js", "utf8");
  const home = await readFile("outputs/js/home/home-controller.js", "utf8");

  // `sanitize` em travessia-state.js descarta o campo se ele não vier, e sem
  // ele a página de destino aparece inteira de uma vez.
  assert.match(palace, /crossTo\(\{[^}]*entry:\s*"(scroll|drag|keyboard)"/);
  assert.match(home, /crossTo\(\{[^}]*entry:\s*"(scroll|drag|keyboard)"/);
});

test("a chegada abre na mesma cor em que a saída fechou", async () => {
  const homeCss = await readFile("outputs/css/home-journey.css", "utf8");
  const palaceCss = await readFile("outputs/css/palacio.css", "utf8");
  const chegadaCss = await readFile("outputs/css/chegada-scene.css", "utf8");

  // Home → palácio: a Home escurece, então o palácio precisa nascer escuro.
  assert.match(blocoDaRegra(homeCss, "html.is-crossing .journey-entry-veil"), /opacity:\s*1/);
  assert.match(blocoDaRegra(homeCss, ".journey-entry-veil {"), new RegExp(ESCURO));
  assert.match(blocoDaRegra(palaceCss, "html.entry-pending .palace-transition"), new RegExp(ESCURO));

  // Palácio → Chegada: o palácio lava no claro (a luz do vão da porta), então
  // a Chegada precisa nascer clara.
  assert.match(blocoDaRegra(palaceCss, ".palace-transition {"), new RegExp(CLARO));
  assert.match(blocoDaRegra(chegadaCss, "html.entry-pending .arrival-transition"), new RegExp(CLARO));
});

test("o véu aberto some sozinho, inclusive sem animação", async () => {
  const chegada = await readFile("outputs/js/chegada/arrival-controller.js", "utf8");
  const palace = await readFile("outputs/js/palacio/palace-controller.js", "utf8");

  for (const [nome, fonte] of [["chegada", chegada], ["palácio", palace]]) {
    // Sem a rede do temporizador, movimento reduzido nunca emite `animationend`
    // e a página ficaria coberta para sempre.
    assert.match(fonte, /animationend/, `${nome}: falta o fim da animação`);
    assert.match(fonte, /1800/, `${nome}: falta a rede de segurança`);
    assert.match(fonte, /remove\("entry-pending"/, `${nome}: o véu precisa ser retirado`);
  }
});
