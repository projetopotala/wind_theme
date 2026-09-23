import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const ler = (nome) => readFileSync(new URL(`../../outputs/${nome}`, import.meta.url), "utf8");

/*
 * A HOME MUDOU DE PÁGINA, NÃO DE ENDEREÇO.
 *
 * A Chegada, o cabeçalho das seções e todo "Voltar à travessia" apontam para
 * transcendido.html. Em vez de trocar dezenas de links, o endereço ficou e o
 * conteúdo passou a ser a página de Atendimentos com as matérias. A Travessia
 * antiga continua inteira em travessia.html.
 */

test("transcendido.html é a Home de Atendimentos, e a Travessia antiga segue em travessia.html", () => {
  const home = ler("transcendido.html");
  assert.match(home, /<title>Instituto Potala<\/title>/);
  assert.match(home, /data-materia/);
  assert.doesNotMatch(home, /name="robots" content="noindex"/, "a Home não pode sair dos buscadores");
  assert.doesNotMatch(home, /id="journey-root"/);

  const travessia = ler("travessia.html");
  assert.match(travessia, /id="journey-root"/);
  assert.match(travessia, /<title>Instituto Potala — A Travessia<\/title>/);
  assert.equal(existsSync(new URL("../../outputs/atendimentos-conceito.html", import.meta.url)), false, "o conceito virou a Home; uma cópia solta divergiria");
});

test("vinda da Chegada, a Home abre sob o véu e consome só a entrada", () => {
  const home = ler("transcendido.html");
  const cabeca = home.slice(0, home.indexOf("</head>"));
  assert.match(cabeca, /potala\.travessia\.v1/);
  assert.match(cabeca, /\["scroll", "drag", "keyboard"\]\.includes\(estado\.entry\)/);
  assert.match(cabeca, /classList\.add\("entry-pending"\)/);
  assert.match(cabeca, /soundEnabled/, "a preferência de som sobrevive à passagem");

  const css = ler("css/atendimentos-conceito.css");
  assert.match(css, /html\.entry-pending body::before\{[^}]*animation:entrada-veu/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{html\.entry-pending body::before/);
});

test("a Home leva a todas as seções do Portal e de volta à Travessia", () => {
  const home = ler("transcendido.html");
  const gaveta = /<nav class="drawer-grid drawer-portal"[\s\S]*?<\/nav>/.exec(home)?.[0] || "";
  const destinos = [...gaveta.matchAll(/href="([\w-]+\.html)"/g)].map((item) => item[1]);
  for (const pagina of ["quem-somos.html", "recepcao.html", "atendimentos.html", "cursos.html", "atividades.html", "cultura.html", "blog.html", "travessia.html"]) {
    assert.ok(destinos.includes(pagina), `a gaveta não leva a ${pagina}`);
  }
  for (const pagina of destinos) assert.ok(existsSync(new URL(`../../outputs/${pagina}`, import.meta.url)), `link quebrado: ${pagina}`);
});
