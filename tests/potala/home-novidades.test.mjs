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

const ROLETA = [
  { id: "n1", slug: "n1", title: "Novos profissionais", href: "blog.html#a", tags: ["recente"] },
  { id: "n2", slug: "n2", title: "Oráculo de hoje", href: "blog.html#b", tags: ["recente"] },
  { id: "s1", slug: "s1", title: "Quem somos", href: "quem-somos.html", tags: [] },
  { id: "s2", slug: "s2", title: "Cursos", href: "cursos.html", tags: [] },
];

test("a roleta traz UMA linha Recentes, sem as manchetes", () => {
  /*
   * Listadas uma a uma, as noticias tomavam as primeiras posicoes e a roleta
   * lia como se o Instituto tivesse quinze secoes — quatro delas com nome de
   * manchete. A roleta e o mapa do portal: o que ela precisa dizer sobre as
   * novidades e que existem e que voce esta nelas.
   */
  const menu = renderJourneyMenu(ROLETA);
  assert.match(menu, /journey-menu-marco[^>]*>Recentes</);
  assert.equal((menu.match(/data-menu-recentes/g) || []).length, 1);
  assert.ok(!menu.includes("Novos profissionais"), "a manchete entrou na roleta");
  assert.ok(!menu.includes("Oráculo de hoje"), "a manchete entrou na roleta");
});

test("a roleta tem os DOIS marcos, e Destacado separa as secoes", () => {
  /*
   * Com um unico rotulo no topo, tudo que vinha abaixo dele parecia pertencer a
   * ele: "Quem somos" e "Recepcao" liam como noticias recentes. Um marco so
   * marca um comeco — sao precisos dois para marcar uma fronteira.
   */
  const menu = renderJourneyMenu(ROLETA);
  assert.match(menu, /data-menu-destacado>Destacado</);
  assert.ok(menu.indexOf("Recentes<") < menu.indexOf("Destacado<"));
  assert.ok(menu.indexOf("Destacado<") < menu.indexOf("Quem somos"));
});

test("o visitante nao rola a roleta com a mao", () => {
  /*
   * Ela e um INDICADOR, e quem a move e a rolagem da pagina. Rolavel pela mao,
   * ela discordava da pagina: arrastar e soltar deixava destacada uma secao que
   * nao tinha nada a ver com o que estava na tela.
   */
  assert.match(css, /\.journey-menu-viewport \{[\s\S]*?overflow-y: hidden/);
});

test("as secoes continuam numeradas de 01", () => {
  const menu = renderJourneyMenu(ROLETA);
  const numeros = [...menu.matchAll(/<span aria-hidden="true">(\d{2})<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(numeros, ["01", "02"]);
  assert.match(menu, /Quem somos/);
  assert.match(menu, /Cursos/);
});

test("a linha Recentes nao e um destino da roleta", () => {
  /*
   * O controlador acha o bloco ativo procurando `data-menu-target`. A linha das
   * novidades representa QUATRO blocos, e nenhum id serviria: ela e marcada por
   * um caminho proprio, e por isso nao pode entrar nessa lista.
   */
  const menu = renderJourneyMenu(ROLETA);
  assert.match(menu, /data-menu-recentes/);
  const marcos = [...menu.matchAll(/<li class="journey-menu-marco"[^>]*>[^<]*<\/li>/g)];
  assert.equal(marcos.length, 2, "os dois marcos precisam existir");
  for (const [linha] of marcos) assert.ok(!linha.includes("data-menu-target"));
  assert.equal((menu.match(/data-menu-target/g) || []).length, 2, "so as duas secoes sao destinos");
});

test("sem novidade nenhuma, a roleta nao inventa a linha", () => {
  const menu = renderJourneyMenu(ROLETA.filter((r) => !ehNovidade(r)));
  assert.ok(!menu.includes("data-menu-recentes"));
  assert.match(menu, /Quem somos/);
});

test("o circulo do marco Recentes fica branco no trecho das novidades", () => {
  /* As secoes acendem em dourado, que e a cor da jornada. O branco separa as
     duas coisas sem inventar um segundo marcador. */
  assert.match(css, /\[data-menu-recentes\]\[data-atual="true"\]::before \{[^}]*background: #fff/);
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
