import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * O atributo hidden só apaga um elemento porque traz `display: none` embutido —
 * e é a regra mais fraca que existe. Qualquer `display` no CSS vence esse padrão
 * e o elemento "escondido" continua ocupando a tela.
 *
 * Custou um bug: o véu do poema, fechado e invisível, cobria a Chegada inteira
 * e engolia todo clique antes de chegar nos lugares do mundo. Nada na tela
 * denunciava — o poema simplesmente nunca abria.
 */

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// Sem tirar os comentários, o seletor capturado vem com o comentário anterior
// grudado nele e nenhuma regra casa — o teste passaria sempre, inclusive quebrado.
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Classes dos elementos que nascem com o atributo hidden no HTML. */
function hiddenClasses(html) {
  const classes = new Set();
  for (const tag of html.match(/<[a-z][^>]*>/gi) || []) {
    // `hidden` isolado, nunca o `aria-hidden` que só fala com leitores de tela.
    if (!/(?:^|\s)hidden(?:\s|=|\/|>|$)/.test(tag.replace(/aria-hidden/g, ""))) continue;
    const found = tag.match(/\bclass="([^"]*)"/);
    if (!found) continue;
    for (const name of found[1].split(/\s+/).filter(Boolean)) classes.add(name);
  }
  return classes;
}

/** Seletores de classe única cujo bloco declara um display que ocupa espaço. */
function classesGivenDisplay(css) {
  const classes = new Set();
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const display = body.match(/(?:^|;)\s*display\s*:\s*([a-z-]+)/);
    if (!display || display[1] === "none") continue;
    for (const part of selector.split(",")) {
      const solo = part.trim().match(/^\.([a-zA-Z0-9_-]+)$/);
      if (solo) classes.add(solo[1]);
    }
  }
  return classes;
}

/** Classes que têm o guard `.classe[hidden] { display: none }`. */
function classesGuarded(css) {
  const guarded = new Set();
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/display\s*:\s*none/.test(body)) continue;
    for (const part of selector.split(",")) {
      const found = part.trim().match(/^\.([a-zA-Z0-9_-]+)\[hidden\]$/);
      if (found) guarded.add(found[1]);
    }
  }
  return guarded;
}

test("todo elemento que nasce hidden e ganha display no CSS tem guard [hidden]", async () => {
  const [html, sceneCss, breathCss] = await Promise.all([
    read("../../outputs/transcender.html"),
    read("../../outputs/css/chegada-scene.css"),
    read("../../outputs/respiracao.css"),
  ]);
  const css = stripComments(`${sceneCss}\n${breathCss}`);

  const started = hiddenClasses(html);
  assert.ok(started.has("world-poem"), "o poema precisa nascer hidden");
  assert.ok(started.size >= 3, "esperava vários elementos hidden na Chegada");

  const displayed = classesGivenDisplay(css);
  const guarded = classesGuarded(css);

  const desprotegidas = [...started].filter((name) => displayed.has(name) && !guarded.has(name));
  assert.deepEqual(
    desprotegidas,
    [],
    `estas classes anulam o próprio hidden e vão cobrir a tela invisíveis: ${desprotegidas.join(", ")}`,
  );
});

test("o véu do poema não pode ficar clicável enquanto está fechado", async () => {
  const css = stripComments(await read("../../outputs/css/chegada-scene.css"));

  // Cinto e suspensório do caso que quebrou: o guard existe, nomeado.
  assert.match(css, /\.world-poem\[hidden\][^{]*\{[^}]*display\s*:\s*none/);
  // E o véu cobre a tela toda, que é justamente o que torna a falha invisível.
  assert.match(css, /\.world-poem\s*\{[^}]*position\s*:\s*fixed/);
});
