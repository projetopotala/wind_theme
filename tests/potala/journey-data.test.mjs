import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_BLOG_POSTS } from "../../outputs/js/blog/blog-data.js";
import { ehNovidade } from "../../outputs/js/home/home-novidades.js";
import {
  JOURNEY_DISCOVERIES,
  JOURNEY_REGIONS,
  findRelatedContent,
} from "../../outputs/js/home/journey-data.js";

/*
 * A ordem importa além da narrativa: o lado de cada bloco nasce da posição
 * (par à esquerda, ímpar à direita) e os pares se formam de dois em dois. A
 * Recepção vem logo depois de "Quem somos" para dividir a passagem com ela.
 */
const expected = [
  "quem-somos",
  "recepcao",
  "atendimentos",
  "cursos",
  "atividades",
  "profissionais",
  "programacao",
  "arte-cultura",
  "marketplace",
  "inspiracao",
  "revista",
  /*
   * O Blog fecha a jornada, e chegou aqui vindo das DESCOBERTAS.
   *
   * Enquanto nao existia `blog.html` ele era um cartaozinho editorial apontando
   * para o site antigo. Com a pagina no ar, ele passa a ficar onde as outras
   * secoes ficam: bloco da jornada, linha no menu lateral, entrada no painel.
   */
  "blog",
];

test("as secoes permanentes mantem a ordem narrativa", () => {
  /*
   * A jornada deixou de ser uma lista fechada: as NOVIDADES abrem a Home, e
   * quantas sao depende do que estiver marcado no painel. O que continua fixo e
   * a ordem das secoes permanentes entre si — e e essa a narrativa que o teste
   * protege. Comparar a lista inteira voltaria a quebrar a cada noticia.
   */
  const permanentes = JOURNEY_REGIONS
    .filter((region) => !ehNovidade(region))
    .map((region) => region.id);
  assert.deepEqual(permanentes, expected);
  assert.ok(JOURNEY_REGIONS.every((region) => region.href && region.href !== "#"));
});

test("as novidades vem antes de qualquer secao permanente", () => {
  /*
   * Quem chega precisa ver primeiro o que MUDOU. Uma novidade depois de "Quem
   * somos" ficaria a nove rolares da abertura, que e o mesmo que nao existir.
   */
  const ids = JOURNEY_REGIONS.map((region) => region.id);
  const ultimaNovidade = ids.reduce(
    (ultimo, id, i) => (ehNovidade(JOURNEY_REGIONS[i]) ? i : ultimo), -1,
  );
  const primeiraPermanente = JOURNEY_REGIONS.findIndex((region) => !ehNovidade(region));
  assert.ok(ultimaNovidade >= 0, "nenhuma novidade na jornada");
  assert.ok(ultimaNovidade < primeiraPermanente, "novidade solta no meio das secoes");
});

test("toda novidade leva a um texto do Blog que existe", () => {
  /*
   * O cartao da Home promete uma noticia. Um id trocado no `href` levaria ao
   * blog e nao acharia o texto: a pagina abre, nada acontece, e ninguem sabe
   * dizer se o problema foi o link ou o texto.
   */
  for (const novidade of JOURNEY_REGIONS.filter(ehNovidade)) {
    const destino = new URL(novidade.href, "https://potala.local/");
    const slug = destino.searchParams.get("post");
    assert.equal(destino.pathname, "/artigo.html", `${novidade.id}: novidade que nao aponta para o artigo`);
    assert.ok(DEFAULT_BLOG_POSTS.some((post) => post.slug === slug), `${novidade.id}: post "${slug}" nao existe`);
  }
});

test("a capa da novidade e a mesma que o post usa no Blog", () => {
  /* O visitante reconhece o texto ao chegar la pela figura. Desenhos diferentes
     nos dois lugares fariam o clique parecer ter levado a outro artigo. */
  for (const novidade of JOURNEY_REGIONS.filter(ehNovidade)) {
    const slug = new URL(novidade.href, "https://potala.local/").searchParams.get("post");
    const post = DEFAULT_BLOG_POSTS.find((item) => item.slug === slug);
    assert.equal(novidade.image, post?.cover, `${novidade.id}: capa diferente da do post`);
  }
});

test("drag lateral existe somente em duas regiões", () => {
  assert.deepEqual(
    JOURNEY_REGIONS.filter((region) => region.lateral).map((region) => region.id),
    ["atendimentos", "profissionais"],
  );
});

test("profissionais usa uma composição central explícita", () => {
  const professionals = JOURNEY_REGIONS.find((region) => region.id === "profissionais");
  assert.equal(professionals?.contentPlacement, "center");
});

test("relações apontam para conteúdo existente", () => {
  const ids = new Set([
    ...JOURNEY_REGIONS.map((item) => item.id),
    ...JOURNEY_DISCOVERIES.map((item) => item.id),
  ]);
  for (const item of [...JOURNEY_REGIONS, ...JOURNEY_DISCOVERIES]) {
    assert.ok((item.relatedContent || []).every((id) => ids.has(id)));
  }
  assert.ok(findRelatedContent("sono-reflexao").length > 0);
});

test("cada região leva a uma página local própria", async () => {
  const expectedDestinations = [
    "quem-somos.html",
    // A Recepção ganhou página própria; antes emprestava a dos Atendimentos.
    "recepcao.html",
    "atendimentos.html",
    "cursos.html",
    "atividades.html",
    "profissionais.html",
    "programacao.html",
    "cultura.html",
    "marketplace.html",
    "inspiracao.html",
    "revista.html",
    "blog.html",
  ];
  /* So as permanentes: as novidades apontam para uma ancora dentro do Blog, e
     sao conferidas pelo teste que casa cada uma com o seu post. */
  const permanentes = JOURNEY_REGIONS.filter((region) => !ehNovidade(region));
  assert.deepEqual(permanentes.map((region) => region.href), expectedDestinations);
  for (const destination of expectedDestinations) {
    const html = await readFile(new URL(`../../outputs/${destination}`, import.meta.url), "utf8").catch(() => null);
    assert.ok(html, destination);
  }
});


/*
 * Os blocos editáveis nascem com as relações da jornada.
 *
 * Elas vivem em JOURNEY_REGIONS, e DEFAULT_HOME_BLOCKS nascia sem elas: a lista
 * de caminhos do painel do bloco ficava vazia sem erro, sem espaço em branco e
 * sem nada que indicasse a falta.
 */
test("os blocos padrão carregam os caminhos relacionados", async () => {
  const { DEFAULT_HOME_BLOCKS, JOURNEY_DISCOVERIES } = await import("../../outputs/js/home/journey-data.js");
  const comRelacoes = DEFAULT_HOME_BLOCKS.filter((bloco) => bloco.relatedContent.length);
  assert.ok(comRelacoes.length >= 5, `só ${comRelacoes.length} blocos têm caminhos`);

  /*
   * E cada id apontado precisa existir — entre as descobertas OU entre os
   * próprios blocos. As relações usam os dois: "recepcao" leva a uma
   * descoberta, "atendimentos" a outro bloco. Um id órfão vira uma linha que
   * nunca aparece, e ninguém descobre por quê.
   */
  const conhecidos = new Set([
    ...JOURNEY_DISCOVERIES.map((item) => item.id),
    ...DEFAULT_HOME_BLOCKS.map((item) => item.id),
  ]);
  for (const bloco of DEFAULT_HOME_BLOCKS) {
    for (const id of bloco.relatedContent) {
      assert.ok(conhecidos.has(id), `${bloco.id} aponta para "${id}", que não existe`);
    }
  }
});
