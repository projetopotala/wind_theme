import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  TAG_NOVIDADE,
  comMarcacao,
  comNovidadesDoCodigo,
  ehNovidade,
  novidadesPrimeiro,
  rotuloDoCartao,
  temasVisiveis,
} from "../../outputs/js/home/home-novidades.js";
import { mountJourney, renderJourneyMenu, renderRegion } from "../../outputs/js/home/home-scenes.js";

const css = readFileSync(new URL("../../outputs/css/home-journey.css", import.meta.url), "utf8");
const adminHtml = readFileSync(new URL("../../outputs/admin.html", import.meta.url), "utf8");

/* ------------------------------------------------------------------
 * O marcador
 * ------------------------------------------------------------------ */

test("a marcacao aceita as formas que se digita na pratica", () => {
  /*
   * A tag e escrita a mao no painel. O selo na tela diz "Recentes", no plural,
   * e e ele que fica na cabeca de quem vai marcar o proximo bloco. Recusar o
   * plural produziria um bloco marcado, salvo e publicado que mesmo assim nao
   * sobe para o topo — um silencio impossivel de depurar pela tela.
   */
  for (const forma of ["recente", "Recentes", "  RECENTE ", "novidade", "Novidades"]) {
    assert.equal(ehNovidade({ tags: [forma] }), true, `"${forma}" nao foi reconhecida`);
  }
  assert.equal(ehNovidade({ tags: ["oráculo", "cinema"] }), false);
  assert.equal(ehNovidade({}), false);
  assert.equal(ehNovidade(null), false);
});

test("todo cartao tem rotulo, e sao dois rotulos diferentes", () => {
  /*
   * So as novidades receberem selo deixaria o visitante sem saber se um cartao
   * sem etiqueta e permanente ou se alguem esqueceu de marca-lo. E o contraste
   * entre as duas palavras que informa.
   */
  assert.equal(rotuloDoCartao({ tags: ["recente"] }), "Recentes");
  assert.equal(rotuloDoCartao({ tags: ["cinema"] }), "Destacado");
  assert.notEqual(rotuloDoCartao({ tags: ["recente"] }), rotuloDoCartao({ tags: [] }));
});

test("o marcador nao aparece entre os temas do bloco", () => {
  /* "recente" numa lista chamada "Temas desta região" seria uma mentira pequena
     e visivel: nao e assunto do bloco, e instrucao para o layout. */
  assert.deepEqual(temasVisiveis(["oráculo", "recente", "tarô"]), ["oráculo", "tarô"]);
  assert.deepEqual(temasVisiveis(["Recentes"]), []);
  assert.deepEqual(temasVisiveis(null), []);
});

/* ------------------------------------------------------------------
 * A ordem
 * ------------------------------------------------------------------ */

const BLOCOS = [
  { id: "a", tags: [], position: 0 },
  { id: "b", tags: ["recente"], position: 1 },
  { id: "c", tags: [], position: 2 },
  { id: "d", tags: ["Novidades"], position: 3 },
];

test("as novidades sobem ao topo sem embaralhar o resto", () => {
  const ordenados = novidadesPrimeiro(BLOCOS);
  assert.deepEqual(ordenados.map((b) => b.id), ["b", "d", "a", "c"]);
});

test("a ordem dentro de cada grupo e a que o editor arrastou", () => {
  /*
   * Estavel de proposito. Reordenar por data exigiria uma data confiavel em
   * cada bloco, e uma jornada que se reordena sozinha tira do editor o controle
   * sobre a propria narrativa.
   */
  const ordenados = novidadesPrimeiro(BLOCOS);
  assert.deepEqual(ordenados.filter((b) => ehNovidade(b)).map((b) => b.id), ["b", "d"]);
  assert.deepEqual(ordenados.filter((b) => !ehNovidade(b)).map((b) => b.id), ["a", "c"]);
});

test("a posicao e reescrita, senao a geometria vem do lugar antigo", () => {
  /*
   * `position` e o que a Home usa para o ritmo, a direcao da estrada e o lado
   * do bloco. Sem reescrever, os primeiros cartoes herdariam a geometria de
   * onde vieram — e dois blocos ficariam com a mesma posicao.
   */
  const ordenados = novidadesPrimeiro(BLOCOS);
  assert.deepEqual(ordenados.map((b) => b.position), [0, 1, 2, 3]);
});

test("ordenar nao mexe na lista original", () => {
  /* A Home so LE; a ordem de verdade continua sendo a do painel. */
  const antes = JSON.parse(JSON.stringify(BLOCOS));
  novidadesPrimeiro(BLOCOS);
  assert.deepEqual(BLOCOS, antes);
});

test("sem novidade nenhuma, a jornada fica como estava", () => {
  const fixos = [{ id: "a", tags: [] }, { id: "b", tags: [] }];
  assert.deepEqual(novidadesPrimeiro(fixos).map((b) => b.id), ["a", "b"]);
  assert.deepEqual(novidadesPrimeiro([]), []);
});

/* ------------------------------------------------------------------
 * Ligar e desligar pelo painel
 * ------------------------------------------------------------------ */

test("marcar acrescenta o marcador e preserva os temas", () => {
  /* Substituir a lista inteira apagaria o trabalho de quem digitou os temas
     para gravar uma palavra. */
  assert.deepEqual(comMarcacao(["cinema", "cultura"], true), ["cinema", "cultura", TAG_NOVIDADE]);
  assert.deepEqual(comMarcacao(["cinema"], false), ["cinema"]);
});

test("marcar duas vezes nao duplica o marcador", () => {
  assert.deepEqual(comMarcacao(["cinema", "recente"], true), ["cinema", TAG_NOVIDADE]);
});

test("desmarcar remove qualquer forma do marcador", () => {
  assert.deepEqual(comMarcacao(["Recentes", "cinema", "novidade"], false), ["cinema"]);
});

/* ------------------------------------------------------------------
 * O cartao
 * ------------------------------------------------------------------ */

const NOVIDADE = {
  id: "novidade-teste",
  title: "Novos profissionais chegaram ao Instituto",
  category: "Notícia",
  description: "Sete terapeutas passam a atender neste mês.",
  href: "blog.html#novos-profissionais",
  tags: ["profissionais", "recente"],
  motivo: "lotus",
};

test("a novidade mostra a capa com o cartao FECHADO", () => {
  /*
   * E o oposto das secoes permanentes, onde a imagem vive dentro do bloco
   * aberto. A secao precisa ser lida para se decidir se vale abrir; a novidade
   * precisa ser reconhecida antes de qualquer clique, e a figura e o que faz
   * esse reconhecimento.
   */
  const marcacao = renderRegion(NOVIDADE, 0, null, new Map());
  assert.match(marcacao, /class="region-capa"/);
  assert.match(marcacao, /<svg/, "a capa saiu sem desenho");
  /* Dentro do botao do resumo, que e a parte fechada do cartao. */
  const resumo = marcacao.indexOf("region-summary");
  const detalhes = marcacao.indexOf("region-details");
  const capa = marcacao.indexOf("region-capa");
  assert.ok(capa > resumo && capa < detalhes, "a capa caiu na parte expandida");
});

test("a secao permanente NAO ganha capa fechada", () => {
  const fixo = { ...NOVIDADE, tags: ["profissionais"], motivo: "lotus" };
  assert.ok(!renderRegion(fixo, 0, null, new Map()).includes("region-capa"));
});

test("o cartao NAO carrega etiqueta no canto", () => {
  /*
   * Ela ficou ali por uma versao. Repetida em quinze cartoes, dizia quinze
   * vezes a mesma coisa e competia com o conteudo do proprio cartao — e dentro
   * do bloco aberto virava ruido no canto onde a leitura comeca.
   *
   * O que a substituiu e um titulo so, fixo no alto da Home, dizendo em que
   * trecho da jornada o visitante esta.
   */
  const nova = renderRegion(NOVIDADE, 0, null, new Map());
  const fixa = renderRegion({ ...NOVIDADE, tags: ["profissionais"] }, 1, null, new Map());
  assert.ok(!nova.includes("region-selo"), "a etiqueta voltou ao cartao");
  assert.ok(!fixa.includes("region-selo"));
});

test("o cartao se declara pelo tipo, para o CSS poder distinguir", () => {
  assert.match(renderRegion(NOVIDADE, 0, null, new Map()), /data-card-kind="novidade"/);
  assert.match(renderRegion({ ...NOVIDADE, tags: [] }, 0, null, new Map()), /data-card-kind="fixo"/);
});

test("a tag marcadora nao vira pastilha de tema", () => {
  const marcacao = renderRegion(NOVIDADE, 0, null, new Map());
  const temas = /<ul class="region-tags"[^>]*>([\s\S]*?)<\/ul>/.exec(marcacao)?.[1] || "";
  assert.match(temas, /profissionais/);
  assert.ok(!/recente/i.test(temas), "o marcador apareceu como tema");
});

/* ------------------------------------------------------------------
 * Estilo e painel
 * ------------------------------------------------------------------ */

test("a capa fotografica preenche o cartao com uma margem editorial", () => {
  const regra = /\[data-card-kind="novidade"\] \.region-capa \{([\s\S]*?)\}/.exec(css)?.[1] || "";
  assert.match(regra, /inset: clamp\(/, "a capa nao acompanha as quatro bordas");
  assert.match(regra, /border-radius/);
  assert.match(css, /\.region-capa::after[\s\S]*?linear-gradient/, "a capa perdeu o veu de leitura");
  assert.match(css, /\.region-capa img[\s\S]*?object-fit: cover/, "a fotografia nao cobre a moldura");
});

test("categoria e titulo ficam sempre sobre a base da fotografia", () => {
  const regra = /\[data-card-kind="novidade"\] \.region-news-meta \{([\s\S]*?)\}/.exec(css)?.[1] || "";
  assert.match(regra, /position: absolute/);
  assert.match(regra, /bottom: clamp\(/);
  assert.match(regra, /text-align: left/);
});

test("no toque o titulo nao depende de hover", () => {
  assert.ok(!/\.region-news-meta[^}]*opacity: 0/.test(css));
});

test("quem chega pelo teclado tambem le o titulo", () => {
  const markup = renderRegion(NOVIDADE, 0, null, new Map());
  assert.match(markup, /class="region-title"[^>]*>Novos profissionais/);
  assert.match(markup, /class="region-news-meta"/);
});

test("o painel tem a caixa que marca a novidade", () => {
  /*
   * Digitar e onde se erra: "Recentes", "Recente ", um acento a mais. A caixa
   * escreve a tag sempre igual.
   */
  assert.match(adminHtml, /data-admin-novidade/);
  assert.match(adminHtml, /Novidade recente/i);
});

/* ------------------------------------------------------------------
 * Novidades do codigo somadas as do banco
 * ------------------------------------------------------------------ */

test("as novidades do codigo entram na lista que veio do banco", () => {
  /*
   * ESTE E O TESTE QUE FALTAVA QUANDO A COISA NAO APARECEU.
   *
   * A Home e a previa do painel leem `home_blocks` no Supabase, e o snapshot
   * local so entra quando essa leitura FALHA. As novidades foram escritas no
   * codigo — e enquanto o banco respondesse normalmente, nao apareciam em lugar
   * nenhum. Tudo passava: os testes liam o snapshot, e o snapshot as tinha.
   */
  const doBanco = [{ id: "quem-somos", tags: [] }, { id: "cursos", tags: [] }];
  const doCodigo = [{ id: "novidade-x", tags: ["recente"] }];
  const juntos = comNovidadesDoCodigo(doBanco, doCodigo);
  assert.deepEqual(juntos.map((b) => b.id), ["novidade-x", "quem-somos", "cursos"]);
});

test("o que ja existe no banco nao e sobrescrito pelo codigo", () => {
  /* Um bloco que existe la ganhou uma versao editada, e a edicao de quem
     mantem o site vale mais que o padrao do codigo. */
  const doBanco = [{ id: "novidade-x", title: "Editado no painel", tags: ["recente"] }];
  const doCodigo = [{ id: "novidade-x", title: "Padrao do codigo", tags: ["recente"] }];
  const juntos = comNovidadesDoCodigo(doBanco, doCodigo);
  assert.equal(juntos.length, 1);
  assert.equal(juntos[0].title, "Editado no painel");
});

test("juntar nao mexe em nenhuma das duas listas", () => {
  const doBanco = [{ id: "a", tags: [] }];
  const doCodigo = [{ id: "b", tags: ["recente"] }];
  comNovidadesDoCodigo(doBanco, doCodigo);
  assert.equal(doBanco.length, 1);
  assert.equal(doCodigo.length, 1);
});

test("entradas vazias ou ausentes nao derrubam a Home", () => {
  assert.deepEqual(comNovidadesDoCodigo([], []), []);
  assert.deepEqual(comNovidadesDoCodigo(null, null), []);
  assert.deepEqual(comNovidadesDoCodigo([{ id: "a" }], undefined).map((b) => b.id), ["a"]);
});

test("as novidades padrao saem prontas para a Home", async () => {
  /* Cruas, elas teriam `description` onde o bloco tem `summary`, e nem slug nem
     published — e o cartao sairia sem resumo sem que nada acusasse. */
  const { NOVIDADES_PADRAO } = await import("../../outputs/js/home/journey-data.js");
  assert.ok(NOVIDADES_PADRAO.length >= 4);
  for (const bloco of NOVIDADES_PADRAO) {
    assert.ok(ehNovidade(bloco), `${bloco.id} nao esta marcado`);
    assert.ok(bloco.summary, `${bloco.id} sem resumo`);
    assert.ok(bloco.slug, `${bloco.id} sem slug`);
    assert.ok(bloco.image, `${bloco.id} sem capa fotografica`);
    assert.match(bloco.href, /^artigo\.html\?post=/, `${bloco.id} nao aponta para o artigo`);
  }
});

test("o selo some quando o bloco abre", () => {
  /*
   * Ele responde a uma pergunta que so existe percorrendo a jornada: este
   * cartao e novidade ou secao permanente? Dentro do bloco aberto a pergunta ja
   * foi respondida — a pessoa escolheu entrar — e a etiqueta vira ruido no
   * canto onde a leitura comeca.
   */
  assert.match(css, /\.journey-region\.is-expanded \.region-selo \{[^}]*display: none/);
});

test("a novidade convida a LER, e nao a explorar o proprio titulo", () => {
  /* "Explorar novos profissionais chegaram ao Instituto" e o que a formula
     "Explorar " + titulo produz com uma manchete no lugar de um nome de secao. */
  const marcacao = renderRegion(NOVIDADE, 0, null, new Map());
  assert.match(marcacao, /Ler a notícia completa/);
  assert.ok(!/Explorar novos profissionais/i.test(marcacao));
});

/* ------------------------------------------------------------------
 * A roleta da barra lateral
 * ------------------------------------------------------------------ */

/*
 * A ROLETA SAIU, e com ela sete testes que descreviam a barra lateral.
 *
 * A barra tinha marca, subtitulo, progresso "04 / 13", a roleta com as secoes e
 * um botao redondo com oito atalhos — uma coluna inteira da tela sobre a
 * paisagem. Foi removida a pedido; sobraram dois controles de canto.
 *
 * O que a roleta oferecia nao se perdeu: ela era um indice das secoes, e as
 * secoes continuam nos cartoes, que e por onde a jornada leva a elas. O que ela
 * ordenava — novidades primeiro, a fronteira entre os dois grupos, o rotulo de
 * cada trecho — continua coberto pelos testes deste arquivo, porque essas
 * regras sao da jornada e nao do menu que a espelhava.
 */
test("a Home tem dois controles de canto, e nenhuma barra lateral", () => {
  const menu = renderJourneyMenu();

  /* A lupa e para quem procura algo especifico em vez de percorrer; o lapis e
     de quem mantem o site. Nenhum dos dois e substituivel pela rolagem, que e
     o que justificou os dois terem ficado. */
  assert.match(menu, /class="journey-canto journey-lupa"[\s\S]*?data-journey-abrir-busca/);
  assert.match(menu, /class="journey-canto journey-lapis" href="admin\.html"/);

  /* E a barra nao voltou por descuido: ela era a maior peca da Home, e o custo
     de re-introduzi-la sem querer e uma coluna de tela a menos para a paisagem. */
  for (const sobra of ["journey-menu-viewport", "journey-sidebar-brand", "journey-sidebar-progress", "data-menu-target", "journey-menu-marco"]) {
    assert.ok(!menu.includes(sobra), `a barra lateral voltou: ${sobra}`);
  }
});

test("a busca continua na Home, agora presa a tela", () => {
  /* Ela era a ultima linha de uma coluna e vivia de `margin-top: auto`. Sem a
     coluna, solta no comeco do documento, sumiria na primeira rolagem —
     justamente quando alguem acabou de pedi-la. */
  const menu = renderJourneyMenu();
  assert.match(menu, /data-journey-busca role="search"/);
  assert.match(menu, /data-journey-fechar-busca/);
  assert.match(css, /\.journey-busca \{[\s\S]*?position: fixed/);
  assert.match(css, /\.journey-lupa \{[\s\S]*?top:/);
  assert.match(css, /\.journey-lapis \{[\s\S]*?bottom:/);
});

test("os cantos somem enquanto um bloco esta aberto, e voltam quando ele fecha", () => {
  /*
   * O bloco expandido e a pagina inteira: cobre a paisagem e passa a ser a
   * unica coisa que se le. Os controles, presos a tela, continuavam por cima
   * dele — dois discos escuros flutuando sobre um texto que ocupa tudo.
   *
   * `body:has(...)` porque eles vivem FORA da jornada: presos a tela, nao sao
   * descendentes do bloco que muda de estado, e nenhum seletor de dentro do
   * palco os alcanca.
   */
  const regra = /body:has\(\.journey-region\.is-expanded\) \.journey-canto,[\s\S]*?\}/.exec(css);
  assert.ok(regra, "os cantos nao somem com o bloco aberto");

  /*
   * `visibility: hidden`, e nao so `opacity: 0`.
   *
   * Invisivel mas focalizavel, a lupa continuaria recebendo o Tab de quem le o
   * bloco pelo teclado — e o foco sumiria num controle que ninguem ve.
   */
  assert.match(regra[0], /visibility: hidden/);
  assert.match(regra[0], /pointer-events: none/);

  /* A busca some junto: o gatilho dela desapareceu, e um painel aberto sem o
     controle que o abriu e uma sobra na tela. */
  assert.match(regra[0], /\.journey-busca/);

  /* E a visibilidade so troca no FIM da transicao de volta, para o controle nao
     voltar a ser clicavel antes de estar visivel. */
  assert.match(css, /transition: opacity \.28s ease, visibility 0s linear \.28s/);
});

test("o veu do bloco aberto cobre a faixa dos controles", () => {
  /*
   * A jornada vive recuada pela faixa da lupa e do lapis. O painel aberto
   * herdava esse recuo e deixava uma tira de paisagem a vista na borda —
   * medidos 76px descobertos a esquerda, zero nos outros tres lados.
   *
   * ESTA REGRA PRECISA SER A ULTIMA das que tem este seletor.
   *
   * Existem duas `.journey-region.is-expanded .region-content` no arquivo, com a
   * mesma especificidade. Escrita na de cima, a correcao nao valia nada: a de
   * baixo devolvia `width: 100%` e `justify-self: stretch`, entao o painel
   * andava para a esquerda pela margem negativa e mantinha a largura do palco —
   * o vazamento so trocava de lado, e a tela continuava parecendo quase certa.
   */
  const seletor = ".journey-region.is-expanded .region-content {";
  const ultima = css.lastIndexOf(seletor);
  assert.ok(ultima > 0, "sumiu a regra do painel aberto");

  const regra = css.slice(ultima, css.indexOf("}", ultima));
  assert.match(regra, /width: calc\(100% \+ var\(--journey-sidebar-width\)\)/);
  assert.match(regra, /margin-left: calc\(var\(--journey-sidebar-width\) \* -1\)/);
  /* `stretch` ignora a largura declarada: com ele, a conta acima nao chega a
     ser aplicada. */
  assert.match(regra, /justify-self: start/);
  assert.ok(!/justify-self: stretch/.test(regra), "o stretch voltou e anula a largura");
});

test("o prologo continua sendo uma tela inteira, centrada", () => {
  /*
   * ISTO QUEBROU UMA VEZ, e nao como falha: como tela torta.
   *
   * `.journey-prologue,` e `.journey-continuation` dividem uma regra de layout.
   * Uma edicao entrou entre os dois seletores achando que o segundo comecava
   * uma regra nova — e o prologo saiu do bloco: perdeu `min-height`,
   * `place-items` e o recuo, encolheu para 327px e jogou "Bem-vindo." no canto
   * superior esquerdo. Nenhum teste caiu, porque nenhum media a composicao.
   */
  const inicio = css.search(/\.journey-prologue,\s*\.journey-continuation \{/);
  assert.ok(inicio >= 0, "o prologo saiu da regra de layout que divide com o encerramento");

  const regra = css.slice(inicio, css.indexOf("}", inicio));
  assert.match(regra, /min-height: 112svh/, "a tela de boas-vindas deixou de ocupar a tela");
  assert.match(regra, /place-items: center/, "o texto deixou de ser centrado");
  assert.match(regra, /text-align: center/);
});

test("o encerramento e o rodape atravessam a faixa dos controles", () => {
  /*
   * A faixa existe por UM motivo: os cartoes nao passarem por baixo da lupa e
   * do lapis. O encerramento e o rodape nao tem cartao nenhum — herdavam o
   * recuo e deixavam uma tira de paisagem a vista na borda esquerda, do
   * escurecimento ate o fim da pagina.
   *
   * Aqui os dois controles podem ficar por cima: sao discos sobre uma faixa
   * escura sem texto embaixo deles, e a alternativa e a tira clara.
   */
  const inicio = css.search(/\.journey-prologue,\s*\.journey-continuation,\s*\.journey-footer \{/);
  assert.ok(inicio >= 0, "o fim da pagina voltou a herdar o recuo da jornada");

  const regra = css.slice(inicio, css.indexOf("}", inicio));
  assert.match(regra, /width: calc\(100% \+ var\(--journey-sidebar-width\)\)/);
  assert.match(regra, /margin-left: calc\(var\(--journey-sidebar-width\) \* -1\)/);
});

test("o rotulo do grupo gruda no comeco dos cartoes dele", () => {
  /*
   * Ele ja morou FIXO no alto da tela. Ali estava sempre visivel e sempre longe
   * do que descrevia: quem olhava os cartoes nao olhava o canto, e a palavra
   * trocava sem que ninguem visse.
   *
   * `sticky` e nao `fixed`: fixo, ele acompanharia a pagina inteira, inclusive
   * o prologo e a subida final, onde nao ha cartao nenhum para rotular. Grudado,
   * ele existe exatamente enquanto o grupo dele passa.
   */
  const regra = /\.journey-trecho \{([\s\S]*?)\}/.exec(css)[1];
  /*
   * Nem `fixed` nem `sticky`: PARADO no comeco do grupo.
   *
   * Foi sticky por uma versao, e ali acompanhava a rolagem — passava a jornada
   * inteira no topo, atravessando cartoes que ja nao pertenciam ao grupo que
   * ele nomeia. Um rotulo que segue quem le vira mais um elemento de interface
   * disputando atencao.
   */
  /*
   * Absoluto DENTRO do palco do par, e nao irmao dele.
   *
   * Como irmao, ficava a quase quatrocentos pixels acima dos cartoes: o palco e
   * sticky com a altura da tela e os cartoes ficam centrados nele, entao quando
   * eles param no meio da tela o rotulo ja saiu por cima havia muito tempo. Ele
   * nomeava o grupo de um lugar em que nao dava para ve-lo junto do que nomeia.
   */
  /*
   * Uma LINHA DA GRADE do palco, e nao um absoluto no topo dele.
   *
   * Absoluto, ficava preso ao alto do palco enquanto os cartoes ficam centrados
   * nele: numa tela alta sobravam duzentos pixels de paisagem entre o rotulo e
   * o que ele nomeia. Ocupando a primeira linha, ele desce junto.
   */
  assert.match(regra, /grid-column: 1 \/ -1/);
  assert.ok(!/position: (fixed|sticky|absolute)/.test(regra), "o rotulo saiu do fluxo da grade");
  assert.match(css, /\.region-stage:has\(\.journey-trecho\) \{[\s\S]*?align-content: center/);
  /*
   * A margem negativa e o que impede o rotulo de EMPURRAR os cartoes: ele entra
   * no fluxo entre um par e outro, e sem ela abriria um vao no meio do ritmo da
   * jornada, que e medido em svh e calibrado par a par.
   */
  /* Fora do fluxo: o palco e uma grade de duas colunas montada para os cartoes,
     e um paragrafo no meio dela ganharia uma celula e empurraria um dos dois. */
  assert.match(regra, /justify-self: start/);
  /* Sem fundo: uma pilula escura competiria com os cartoes, que sao exatamente
     isso — paineis escuros arredondados. */
  assert.ok(!/background:/.test(regra), "o rotulo ganhou fundo");
  assert.ok(!/backdrop-filter/.test(regra));
  /* O titulo editorial continua na serifa da casa. */
  assert.match(css, /\.journey-trecho strong \{[\s\S]*?Georgia/);
});

test("cada grupo recebe UM rotulo, no comeco dele", () => {
  const regioes = [
    { id: "n1", tags: ["recente"], title: "N1", href: "#" },
    { id: "n2", tags: ["recente"], title: "N2", href: "#" },
    { id: "s1", tags: [], title: "S1", href: "#" },
    { id: "s2", tags: [], title: "S2", href: "#" },
  ];
  const alvo = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null };
  mountJourney(alvo, { regions: regioes, discoveries: [] });

  const rotulos = [...alvo.innerHTML.matchAll(/<header class="journey-trecho" data-grupo="([^"]+)">[\s\S]*?<strong>([^<]*)<\/strong>/g)];
  assert.deepEqual(rotulos.map((m) => [m[1], m[2]]), [["novidade", "Acontece no Potala"], ["fixo", "Caminhos para conhecer"]]);
  /* E vem DENTRO do palco, antes dos cartoes que ele nomeia. */
  const palco = alvo.innerHTML.indexOf('class="region-stage"');
  assert.ok(alvo.innerHTML.indexOf('data-grupo="novidade"') > palco, "o rotulo caiu fora do palco");
  /* `journey-region` sozinho casa com o container `journey-regions`, que vem
     bem antes — o token precisa ser o do bloco. */
  assert.ok(alvo.innerHTML.indexOf('data-grupo="novidade"') < alvo.innerHTML.indexOf('class="journey-region '));
});

test("sem novidade nenhuma, so o rotulo das secoes aparece", () => {
  const alvo = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null };
  mountJourney(alvo, {
    regions: [{ id: "s1", tags: [], title: "S1", href: "#" }, { id: "s2", tags: [], title: "S2", href: "#" }],
    discoveries: [],
  });
  const rotulos = [...alvo.innerHTML.matchAll(/data-grupo="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(rotulos, ["fixo"]);
});

test("a fronteira entre novidades e secoes e marcada no caminho", () => {
  /*
   * O rotulo la no alto troca de palavra, mas ele esta no canto e a troca e
   * discreta de proposito — quem estiver olhando os cartoes nao ve. Sem nada no
   * caminho, a jornada passa de noticia para secao sem que nada aconteca.
   *
   * A marca vai no SILENCIO porque o silencio ja e a passagem: o trecho de
   * estrada sem conteudo entre dois encontros. Marcar um cartao poria a
   * fronteira dentro de um dos lados; marcar o vao a poe entre os dois.
   */
  const regioes = [
    { id: "n1", tags: ["recente"], title: "N1", href: "#" },
    { id: "n2", tags: ["recente"], title: "N2", href: "#" },
    { id: "s1", tags: [], title: "S1", href: "#" },
    { id: "s2", tags: [], title: "S2", href: "#" },
  ];
  const alvo = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null };
  mountJourney(alvo, { regions: regioes, discoveries: [] });

  const silencios = [...alvo.innerHTML.matchAll(/<div class="journey-silence"([^>]*)>/g)];
  const comFronteira = silencios.filter(([, atributos]) => atributos.includes('data-fronteira="true"'));
  assert.equal(comFronteira.length, 1, "a fronteira precisa ser uma so");

  /*
   * E o silencio dela e MAIS CURTO que o dos outros trechos.
   *
   * Um silencio comum e pausa: estrada sem informacao. O da fronteira nao esta
   * vazio — tem a linha, o losango e o rotulo do grupo novo logo abaixo. Com a
   * duracao cheia, as tres coisas ficavam espalhadas por quase meia tela cada
   * uma, e o que devia ser uma passagem virava um intervalo.
   */
  const altura = (linha) => Number(/--silence-height:(\d+)svh/.exec(linha)?.[1]);
  const marcado = altura(comFronteira[0][0]);
  const comum = altura(silencios.find(([, a]) => !a.includes("fronteira"))?.[0] || "");
  if (comum) assert.ok(marcado < comum, `a fronteira (${marcado}) devia ser mais curta que ${comum}`);

  /* E ela e sutil: uma linha que apaga nas pontas, nao um corte na tela. */
  assert.match(css, /\.journey-silence\[data-fronteira="true"\]::before \{[\s\S]*?linear-gradient\(to right, transparent/);
});




/* ------------------------------------------------------------------
 * Abrir so com o bloco centralizado
 * ------------------------------------------------------------------ */

test("o desvio do palco mede o quanto o bloco esta fora do lugar", async () => {
  /*
   * O palco e `sticky` com `top: 0`: enquanto o par atravessa a tela ele fica
   * ESTACIONADO no topo e os cartoes param no centro. Entrando ou saindo, ele
   * ainda se move — e e ai que o bloco aberto nao cobre a tela inteira,
   * deixando faixas de paisagem em cima e embaixo do painel.
   */
  const { desvioDoPalco, estaCentralizado, FOLGA_DE_CENTRO } =
    await import("../../outputs/js/home/block-expansion.js");

  const comTopo = (top) => ({ closest: () => ({ getBoundingClientRect: () => ({ top }) }) });

  assert.equal(desvioDoPalco(comTopo(0)), 0, "estacionado e desvio zero");
  assert.equal(desvioDoPalco(comTopo(180)), 180, "o par ainda esta subindo");
  assert.equal(desvioDoPalco(comTopo(-240)), -240, "o par ja esta saindo por cima");

  assert.equal(estaCentralizado(comTopo(0)), true);
  assert.equal(estaCentralizado(comTopo(FOLGA_DE_CENTRO)), true, "a folga de arredondamento conta como centro");
  assert.equal(estaCentralizado(comTopo(FOLGA_DE_CENTRO + 1)), false);
  assert.equal(estaCentralizado(comTopo(-200)), false);
});

test("sem palco, o bloco conta como centralizado", async () => {
  /*
   * A jornada e desenhada por um modulo e a expansao por outro. Um bloco que
   * chegue sem palco — num teste, ou num arranjo futuro — nao pode travar o
   * clique: nao abrir e pior do que abrir num lugar que talvez esteja certo.
   */
  const { estaCentralizado } = await import("../../outputs/js/home/block-expansion.js");
  assert.equal(estaCentralizado({ closest: () => null }), true);
  assert.equal(estaCentralizado(null), true);
});
