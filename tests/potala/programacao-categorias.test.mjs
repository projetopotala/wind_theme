import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CATEGORIAS,
  MODALIDADES,
  agruparPorCategoria,
  semCategoria,
} from "../../outputs/js/sections/programacao-categorias.js";

const outputs = new URL("../../outputs/", import.meta.url);
const html = await readFile(new URL("programacao.html", outputs), "utf8");

/* ------------------------------------------------------------------
 * O agrupamento
 * ------------------------------------------------------------------ */

test("as modalidades se agrupam na ordem das categorias", () => {
  const grupos = agruparPorCategoria();
  assert.deepEqual(grupos.map((g) => g.id), CATEGORIAS.map((c) => c.id));
  assert.equal(grupos.reduce((soma, g) => soma + g.itens.length, 0), MODALIDADES.length);
  assert.deepEqual(
    grupos.find((g) => g.id === "cursos").itens.map((m) => m.titulo),
    ["Cursos livres", "Formações profissionais", "Monte seu curso"],
  );
});

test("uma categoria sem item nao vira um titulo vazio", () => {
  /*
   * Um cabeçalho seguido de nada é uma promessa que a página não cumpre, e é o
   * que aconteceria no dia em que alguém previsse uma categoria antes de haver
   * o que pôr nela.
   */
  const grupos = agruparPorCategoria([{ titulo: "Só um", categoria: "cursos", href: "cursos.html" }]);
  assert.deepEqual(grupos.map((g) => g.id), ["cursos"]);
  assert.deepEqual(agruparPorCategoria([]), []);
  assert.deepEqual(agruparPorCategoria(null), []);
});

test("nenhuma modalidade fica fora do indice", () => {
  /*
   * Um item com categoria errada some da página sem quebrar nada: a lista
   * continua bonita, mais curta em um, e ninguém percebe.
   */
  assert.deepEqual(semCategoria(), []);
  assert.deepEqual(
    semCategoria([{ titulo: "Perdida", categoria: "xilofone" }]).map((m) => m.titulo),
    ["Perdida"],
  );
});

test("cada modalidade aparece uma vez so", () => {
  /*
   * UMA categoria por item. Num filtro, aparecer em duas era conveniente; num
   * índice agrupado, o mesmo nome em dois lugares lê como erro de quem montou a
   * página, e não como riqueza da casa.
   */
  const titulos = MODALIDADES.map((m) => m.titulo);
  assert.equal(new Set(titulos).size, titulos.length, "há modalidade repetida");
});

test("todo item leva a uma pagina que existe", async () => {
  /* Uma linha de índice sem destino é o pior tipo de resposta: parece que
     respondeu. */
  for (const item of MODALIDADES) {
    assert.ok(item.href, `"${item.titulo}" não tem destino`);
    await assert.doesNotReject(
      () => readFile(new URL(item.href, outputs), "utf8"),
      `"${item.titulo}" aponta para ${item.href}, que não existe`,
    );
  }
});

/* ------------------------------------------------------------------
 * A página
 * ------------------------------------------------------------------ */

test("a pagina mantém o índice completo e conecta o filtro por categorias", () => {
  /*
   * O filtro é apenas um atalho: sem JavaScript, as 16 linhas continuam no HTML;
   * com JavaScript, cada pastilha precisa ter um grupo real para revelar. Se o
   * script ou os atributos se desconectarem, os botões parecem funcionar mas a
   * página permanece inteira — exatamente a integração que ficou incompleta.
   */
  assert.match(html, /<section class="guided-categorias"[^>]+data-categorias/);
  assert.match(html, /programacao-categorias\.js/);
  assert.match(html, /data-categorias-aviso/);
  for (const categoria of ["todas", ...CATEGORIAS.map(({ id }) => id)]) {
    assert.match(html, new RegExp(`data-categoria="${categoria}"`), `não há controle para ${categoria}`);
  }
  for (const categoria of CATEGORIAS) {
    assert.match(html, new RegExp(`data-grupo="${categoria.id}"`), `o grupo ${categoria.id} não pode ser filtrado`);
  }
  assert.doesNotMatch(html, /guided-destaques|data-guided-choice/, "os cartões de destaque voltaram");

  assert.match(html, /id="orientacao"/);
  /* O herói manda "Explorar a agenda ↓" para cá. Sem este id, o único botão do
     alto da página deixa de levar a algum lugar. */
  assert.match(html, /href="#orientacao"/);
});

test("a pagina lista os mesmos grupos e itens do modulo", () => {
  /*
   * A lista mora no HTML e a fonte dela mora no módulo. Elas envelhecem
   * separadas: alguém acrescenta uma modalidade no módulo, esquece do HTML, e a
   * contagem do cabeçalho passa a prometer um item que a página não tem.
   */
  const grupos = agruparPorCategoria();

  const cabecalhos = [...html.matchAll(/<h3 id="categoria-([a-z-]+)">([^<]*?) <span aria-hidden="true">(\d+)<\/span>/g)]
    .map(([, id, rotulo, contagem]) => ({ id, rotulo: rotulo.trim(), contagem: Number(contagem) }));
  assert.deepEqual(cabecalhos.map((c) => c.id), grupos.map((g) => g.id));
  for (const [i, grupo] of grupos.entries()) {
    assert.equal(cabecalhos[i].rotulo, grupo.rotulo);
    assert.equal(cabecalhos[i].contagem, grupo.itens.length, `a contagem de "${grupo.rotulo}" está velha`);
  }

  const linhas = [...html.matchAll(/<li><a href="([^"]*)"><strong>([^<]*)<\/strong><span>([^<]*)<\/span>/g)]
    .map(([, href, titulo, texto]) => ({ href, titulo, texto }));
  const esperadas = grupos.flatMap((g) => g.itens);
  assert.equal(linhas.length, esperadas.length, "a página e o módulo têm listas de tamanhos diferentes");
  for (const [i, item] of esperadas.entries()) {
    assert.equal(linhas[i].titulo, item.titulo);
    assert.equal(linhas[i].href, item.href, `"${item.titulo}" aponta para outro lugar na página`);
    assert.equal(linhas[i].texto, item.texto, `a descrição de "${item.titulo}" divergiu`);
  }
});

test("cada grupo liga a lista ao proprio cabecalho", () => {
  /* Sete listas seguidas sem nome próprio, para quem ouve a página, são sete
     listas iguais: o `aria-labelledby` é o que diz de qual categoria é cada uma. */
  for (const grupo of agruparPorCategoria()) {
    assert.match(html, new RegExp(`<ul aria-labelledby="categoria-${grupo.id}">`), `o grupo ${grupo.id} não nomeia a lista`);
  }
});

test("a agenda oficial continua a um clique", () => {
  /*
   * O link desceu para o encerramento junto com o bloco de destaques que saiu —
   * e não foi apagado com ele. A introdução da página diz que "os detalhes
   * atuais permanecem no site oficial"; sem o link, isso vira uma instrução
   * para procurar sozinho.
   */
  assert.match(html, /institutopotala\.com\/programacao/);
  assert.match(html, /<a class="guided-link" href="recepcao\.html">/);
  const encerramento = /<section class="guided-closing"[\s\S]*?<\/section>/.exec(html)?.[0] || "";
  assert.match(encerramento, /institutopotala\.com\/programacao/, "o link ficou fora do encerramento");
});
