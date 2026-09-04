import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../../outputs/css/admin.css", import.meta.url), "utf8");
const html = await readFile(new URL("../../outputs/admin.html", import.meta.url), "utf8");

/* ------------------------------------------------------------------
 * A miniatura cabe na coluna dela
 * ------------------------------------------------------------------ */

test("a imagem da linha nao pode ser mais larga que a coluna reservada", () => {
  /*
   * Havia DUAS regras `.admin-list img`, com 52px e 64px. A segunda vencia por
   * chegar depois, e a coluna do grid reserva 52 — os 12px de sobra entravam na
   * coluna do texto e cobriam o comeco do titulo.
   *
   * O sintoma enganava: parecia que titulo e resumo sumiam ao adicionar uma
   * imagem. Nao sumiam, ficavam ATRAS dela. Blocos sem imagem nunca quebraram,
   * porque o espaco reservado tem exatamente os 52px da coluna.
   */
  const regras = css.match(/\.admin-list img\s*\{[^}]*\}/g) ?? [];
  assert.equal(regras.length, 1, "duas regras para a mesma imagem so podem divergir");

  const largura = /width:\s*(\d+)px/.exec(regras[0]);
  assert.ok(largura, "a imagem precisa de largura declarada");

  const grade = /\.admin-list li\s*\{[^}]*grid-template-columns:\s*([^;]+);/.exec(css);
  assert.ok(grade, "falta a grade da linha");
  const coluna = /(\d+)px/.exec(grade[1].split(" ").filter(Boolean)[1]);
  assert.ok(coluna, "a segunda coluna e a da miniatura");

  assert.ok(
    Number(largura[1]) <= Number(coluna[1]),
    `imagem de ${largura[1]}px numa coluna de ${coluna[1]}px transborda sobre o texto`,
  );
});

test("a miniatura e o espaco reservado dividem a MESMA regra", () => {
  /*
   * Nao basta terem o mesmo tamanho hoje: eles precisam ser impossiveis de
   * divergir amanha. Divergindo, a lista muda de ritmo conforme os blocos tenham
   * ou nao imagem, e o olho le como desalinhamento.
   *
   * Uma regra so tambem e o que impede o defeito original de voltar — ele nasceu
   * de duas declaracoes separadas para a mesma imagem, com medidas diferentes.
   */
  const juntas = /\.admin-row-thumb,\s*\.admin-list img\s*\{/.test(css)
    || /\.admin-list img,\s*\.admin-row-thumb\s*\{/.test(css);
  assert.ok(juntas, "separados, os dois voltam a divergir");
});

test("a imagem e recortada, e nao esticada", () => {
  /* As imagens da jornada sao paisagens largas; sem `cover` elas entram
     achatadas na miniatura, e a lista fica com nove blocos deformados. */
  const img = /\.admin-list img\s*\{([^}]*)\}/.exec(css)[1];
  assert.match(img, /object-fit:\s*cover/);
});

/* ------------------------------------------------------------------
 * Sair do painel
 * ------------------------------------------------------------------ */

test("da para voltar ao site sem abrir outra aba", () => {
  /*
   * Havia so "Visualizar site", com `target="_blank"`: serve para conferir o
   * resultado sem perder o painel, mas nao para SAIR dele. Quem quisesse voltar
   * ia acumulando abas, ou usava o botao do navegador.
   *
   * O logout continua sendo outra coisa, e continua onde estava: encerrar a
   * sessao obriga a entrar de novo, e nao e o que se quer ao terminar de editar.
   */
  const sair = /<a[^>]*data-admin-leave[^>]*>/.exec(html);
  assert.ok(sair, "falta o botao de voltar ao site");
  assert.match(sair[0], /href="transcendido\.html"/);
  assert.ok(!/target="_blank"/.test(sair[0]), "sair na mesma aba e o ponto");

  /* E continua existindo o caminho que NAO fecha o painel. */
  assert.match(html, /Visualizar site/);
});

/* ------------------------------------------------------------------
 * A confirmacao de publicacao
 * ------------------------------------------------------------------ */

test("publicar da uma confirmacao que se nota", () => {
  /*
   * Publicar e a acao irreversivel do painel: e ela que troca o que esta no ar.
   * A resposta era uma linha de status discreta, do mesmo tamanho e cor de
   * qualquer outro aviso — quem publicava ficava sem saber se tinha dado certo.
   */
  assert.match(html, /data-admin-confirm/, "falta o elemento da confirmacao");

  const regra = /\.admin-confirm\s*\{([^}]*)\}/.exec(css);
  assert.ok(regra, "falta o estilo da confirmacao");
  assert.match(regra[1], /position:\s*fixed/, "precisa aparecer onde o olho esta, e nao no rodape do painel");
});

/* ------------------------------------------------------------------
 * Encerrar sessao
 * ------------------------------------------------------------------ */

test("o logout fica no cabecalho, junto das outras saidas", () => {
  /*
   * O botao existia, escondido no fim da navegacao lateral, ao lado de
   * "Restaurar conteudo original". Quem quisesse encerrar a sessao tinha de
   * rolar a navegacao inteira para achar — e passava antes por uma acao
   * destrutiva que nao tem nada a ver com sair.
   *
   * O cabecalho e onde ja vivem as outras duas saidas. Juntas, as tres se
   * explicam por contraste: ver o site, voltar ao site, encerrar a sessao.
   */
  const cabecalho = /<header class="admin-head">[\s\S]*?<\/header>/.exec(html);
  assert.ok(cabecalho, "o cabecalho do painel sumiu");
  assert.match(cabecalho[0], /data-admin-sign-out/, "o logout nao esta no cabecalho");
});

test("existe um logout so, e nao dois", () => {
  /*
   * `admin-shell` e `admin-auth` procuram o botao com `querySelector`, que para
   * no primeiro. Um segundo botao com o mesmo atributo ficaria na tela sem
   * ouvinte nenhum: clicavel, mudo, e indistinguivel do que funciona.
   */
  const quantos = (html.match(/data-admin-sign-out/g) || []).length;
  assert.equal(quantos, 1, `ha ${quantos} controles de logout`);
});

test("os dois botoes de sair nao se chamam a mesma coisa", () => {
  /*
   * "Sair do painel" volta a Home com a sessao aberta; o outro encerra a
   * sessao. Chamar os dois de "Sair" faria a escolha depender de adivinhar
   * qual e qual, e errar custa digitar a senha de novo.
   */
  const voltar = /<a[^>]*data-admin-leave[^>]*>([^<]*)</.exec(html);
  const encerrar = /<button[^>]*data-admin-sign-out[^>]*>([^<]*)</.exec(html);
  assert.ok(voltar && encerrar, "falta um dos dois");
  assert.notEqual(voltar[1].trim(), encerrar[1].trim());
  assert.match(encerrar[1], /sess[aã]o/i, "o logout precisa dizer que encerra a sessao");
});
