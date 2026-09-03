import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CSS = new URL("../../outputs/css/home-journey.css", import.meta.url);

/**
 * Especificidade de um seletor, no nível de detalhe que este arquivo exige.
 *
 * `:has()` é o motivo do cálculo existir: ele NÃO pesa como uma pseudoclasse
 * comum, e sim como o argumento que carrega dentro. Foi exatamente aí que a
 * regra do telefone perdeu na primeira tentativa — escrita sem `[data-side]`,
 * ela pesava menos que a do desktop, que traz `[data-side="left"]` no `:has()`,
 * e o navegador seguia montando a grade em três colunas sem avisar ninguém.
 */
function especificidade(seletor) {
  const plano = seletor.replace(/:has\(([^)]*)\)/g, " $1 ");
  const ids = plano.match(/#[\w-]+/g)?.length ?? 0;
  const classes = plano.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g)?.length ?? 0;
  const elementos = plano.match(/(^|[\s>+~])[a-z][\w-]*/g)?.length ?? 0;
  return [ids, classes, elementos];
}

function compara(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

const css = await readFile(CSS, "utf8");

/* Sem os comentarios. Eles viajam no CSS e citam o que a regra NAO faz — uma
   assercao de ausencia bateria na prosa em vez do codigo. */
function semComentarios(fonte) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "");
}

/* O corpo de um `@keyframes`, contando chaves — regex nao serve aqui porque o
   bloco tem chaves aninhadas (`from { ... }`). */
function blocoDeKeyframes(fonte, nome) {
  const inicio = fonte.indexOf(`@keyframes ${nome}`);
  assert.notEqual(inicio, -1, `falta a animacao ${nome}`);
  let profundidade = 0;
  for (let i = fonte.indexOf("{", inicio); i < fonte.length; i += 1) {
    if (fonte[i] === "{") profundidade += 1;
    if (fonte[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return fonte.slice(inicio, i + 1);
    }
  }
  throw new Error(`@keyframes sem fechamento: ${nome}`);
}


/* O bloco do telefone: a partir da abertura da media query até a chave que a
   fecha, contando as chaves internas para não parar na primeira regra. */
function blocoDaMediaQuery(fonte, condicao) {
  const inicio = fonte.indexOf(condicao);
  assert.notEqual(inicio, -1, `media query ausente: ${condicao}`);
  let profundidade = 0;
  for (let i = fonte.indexOf("{", inicio); i < fonte.length; i += 1) {
    if (fonte[i] === "{") profundidade += 1;
    if (fonte[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return { inicio, fim: i + 1, texto: fonte.slice(inicio, i + 1) };
    }
  }
  throw new Error(`media query sem fechamento: ${condicao}`);
}

const telefone = blocoDaMediaQuery(css, "@media (max-width: 720px)");

const ABERTURA = /\.journey-pair:has\([^)]*is-expanded[^)]*\)\s+\.region-stage/g;

test("o telefone desfaz as três colunas da abertura lateral", () => {
  const todas = [...css.matchAll(ABERTURA)];
  assert.ok(todas.length >= 2, "faltam as regras de abertura do bloco");

  /* Só o que está DENTRO do bloco do telefone: a prévia do painel tem uma
     regra parecida, com `.is-admin-preview` na frente, e ela não responde por
     este defeito. */
  const noTelefone = todas.filter((m) => m.index > telefone.inicio && m.index < telefone.fim);
  assert.equal(noTelefone.length, 1, "o telefone precisa de uma — e só uma — regra que desfaça a abertura lateral");

  const doDesktop = todas.filter((m) => m.index < telefone.inicio);
  assert.ok(doDesktop.length >= 2, "as regras de abertura do desktop sumiram");

  /* Vencer por ordem só vale depois de empatar em peso: uma regra mais leve
     perde onde quer que esteja escrita. */
  for (const regra of doDesktop) {
    assert.ok(
      compara(especificidade(noTelefone[0][0]), especificidade(regra[0])) >= 0,
      `a regra do telefone pesa menos que "${regra[0]}" e seria descartada`,
    );
    assert.ok(noTelefone[0].index > regra.index, "a regra do telefone precisa vir depois da do desktop");
  }
});

test("no telefone o palco aberto continua com uma coluna de conteúdo", () => {
  const regra = telefone.texto.match(/\.journey-pair:has\([^)]*is-expanded[^)]*\)\s+\.region-stage\s*\{([^}]*)\}/);
  assert.ok(regra, "a regra do telefone não declara nada");
  const colunas = regra[1].match(/grid-template-columns:\s*([^;]+);/);
  assert.ok(colunas, "a regra do telefone não redefine as colunas");
  assert.equal(
    colunas[1].split(/\s+(?![^(]*\))/).filter(Boolean).length,
    2,
    "abrir para o lado precisa de dois lados; no telefone há uma coluna de conteúdo só",
  );
});

test("no telefone o bloco aberto usa o palco inteiro sem rolagem interna", () => {
  const palco = telefone.texto.match(/\.journey-pair:has\([^)]*is-expanded[^)]*\)\s+\.region-stage\s*\{([^}]*)\}/);
  assert.ok(palco, "falta a regra do palco aberto no telefone");
  assert.match(
    palco[1],
    /grid-template-rows:\s*minmax\(0,\s*1fr\)/,
    "o conteúdo aberto precisa receber a altura inteira do palco",
  );

  const regra = telefone.texto.match(/\.journey-region\.is-expanded\s+\.region-content\s*\{([^}]*)\}/);
  assert.ok(regra, "falta a regra do bloco aberto no telefone");
  /*
   * O painel ocupa o palco inteiro — e para exatamente ali.
   *
   * A primeira tentativa foi `overflow: visible`, na ideia de que sem janela
   * não haveria rolagem. Sem teto, porém, o painel que não cabia desenhava por
   * cima do bloco de baixo e o fim do texto sumia sem aviso. Quem faz caber é o
   * ajuste medido em block-expansion.js; o teto aqui é a rede.
   */
  assert.match(regra[1], /max-height:\s*100%/, "sem teto o painel invade a jornada");

  const irma = telefone.texto.match(/\.journey-pair:has\([^)]*is-expanded[^)]*\)[^{]*\.journey-region:not\(\.is-expanded\)[^{]*\.region-content\s*\{([^}]*)\}/);
  assert.ok(irma, "falta liberar o palco ocupado pelo bloco irmão");
  assert.match(irma[1], /display:\s*none/, "o bloco irmão deve voltar quando o painel aberto fechar");
});

test("telas baixas compactam o painel sem esconder informação editorial", () => {
  const curta = blocoDaMediaQuery(css, "@media (max-width: 720px) and (max-height: 680px)");

  assert.match(curta.texto, /\.journey-region\.is-expanded\s+\.region-content\s*\{[^}]*padding:/s);
  assert.match(curta.texto, /\.journey-region\.is-expanded\s+\.region-title\s*\{[^}]*font-size:/s);
  assert.doesNotMatch(
    curta.texto,
    /\.region-(?:description|details|related|tags|actions)[^{]*\{[^}]*display:\s*none/s,
    "ganhar espaço não pode remover o conteúdo que o visitante pediu para ler",
  );
});

test("em telas estreitas a calha do trajeto cede largura ao painel aberto", () => {
  const estreito = blocoDaMediaQuery(css, "@media (max-width: 400px)");
  const palco = estreito.texto.match(
    /\.journey-pair:has\([^)]*is-expanded[^)]*\)[^{]*\.region-stage\s*\{([^}]*)\}/,
  );

  assert.ok(palco, "falta estreitar a calha quando o painel abre numa tela pequena");
  /*
   * Medido a 320px: com a calha de 72px o painel ficava com 216px de largura, e
   * era a largura — não a altura — que estufava o bloco. Tres etiquetas curtas
   * empilhavam em tres linhas, e cada relacionado quebrava em quatro. Devolver
   * ~30px de largura vale mais que qualquer corte de tipografia.
   */
  assert.match(palco[1], /grid-template-columns:/, "a calha precisa ceder largura");
});

test("em telas baixas o palco aberto abre mao do proprio recuo antes do conteudo", () => {
  const curta = blocoDaMediaQuery(css, "@media (max-width: 720px) and (max-height: 680px)");
  const palco = curta.texto.match(
    /\.journey-pair:has\([^)]*is-expanded[^)]*\)[^{]*\.region-stage\s*\{([^}]*)\}/,
  );

  assert.ok(palco, "falta reduzir o recuo do palco em telas baixas");
  /* 32px em cima e 32 embaixo sao 64 de 568 gastos com ar em volta de um painel
     que ja nao cabe. O ar do palco cede antes do texto do bloco. */
  assert.match(palco[1], /padding/, "o recuo do palco precisa ceder");
});

test("se nem o aperto fechar a conta, o painel rola por dentro em vez de invadir a jornada", () => {
  /*
   * O ajuste medido em block-expansion.js encolhe o painel até ele caber, mas
   * para num piso de legibilidade. Passado esse piso — um texto muito longo num
   * telefone deitado — alguma coisa tem de ceder. Rolar por dentro é ruim;
   * desenhar por cima do bloco de baixo é pior, porque some conteúdo sem aviso.
   */
  const regras = css.match(/\.journey-region\.is-expanded\s+\.region-content\s*\{[^}]*\}/g) ?? [];
  const comTeto = regras.filter((regra) => /max-height:\s*100%/.test(regra));

  assert.ok(comTeto.length > 0, "nenhuma regra do painel aberto limita a altura ao palco");
  assert.ok(
    comTeto.some((regra) => /overflow-y:\s*auto/.test(regra)),
    "o transbordo impossível precisa de uma saída",
  );
  assert.ok(
    !regras.some((regra) => /overflow:\s*visible/.test(regra)),
    "voltar a `overflow: visible` faz o painel desenhar por cima da jornada",
  );
});

test("no telefone o painel aberto nao caminha para fora da tela", () => {
  /*
   * "O bloco que abriu caminha um pouco para a esquerda e cede o palco" — no
   * monitor, onde ha palco de sobra ao lado. No telefone o painel JA ocupa
   * quase toda a largura, e o passo da camera so tem para onde ir: para fora.
   *
   * Medido a 320x568 no HEAD, antes de qualquer mudanca desta leva: o passo
   * vale 70px e cortava 48 do lado direito de todo bloco `left` — o comeco de
   * cada linha de texto ficava atras da borda da tela.
   *
   * A cena nao perde a travessia: a paisagem continua cruzando e o bloco irmao
   * continua saindo por translacao. O que para de andar e a unica peca que
   * alguem esta lendo.
   */
  const aplica = css.search(
    /\.journey-region\[data-travessia="transitioning"\]\s+\.region-content[^{]*\{[^}]*transform:\s*translate3d/,
  );
  assert.notEqual(aplica, -1, "sumiu a regra que faz o painel caminhar com a camera");

  const segura = css.search(
    /@media \(max-width: 720px\)\s*\{[^@]*?\.journey-region\[data-travessia="transitioning"\][^{]*\{[^}]*transform:\s*none/s,
  );
  assert.notEqual(segura, -1, "falta segurar o passo da camera no painel aberto do telefone");

  /*
   * A ordem e o teste de verdade. Media query nao acrescenta peso nenhum a
   * especificidade: escrita antes da regra que aplica o passo, esta simplesmente
   * perde, e o painel volta a sair da tela sem nada quebrar em lugar nenhum.
   */
  assert.ok(segura > aplica, "a regra que segura o painel precisa vir depois da que o move");
});

test("o piso de altura do palco nunca passa da tela", () => {
  /*
   * O palco e `sticky` e vale `100svh` — a tela inteira. O piso de 560px estava
   * la para ele nao ficar espremido numa janela de desktop encolhida, mas nao
   * tinha teto: num telefone DEITADO, com 360px de altura, o palco passava a
   * medir 560 e estourava a janela em 200px.
   *
   * O efeito no bloco aberto era o pior possivel. Medido a 740x360: o painel
   * fechava a conta contra a caixa do palco, dava por resolvido, e assentava
   * com o fim do texto abaixo da borda da tela — sem barra de rolagem para
   * denunciar que havia mais, e sem como trazer aquilo de volta.
   *
   * Com `min()` o piso continua valendo onde ele fazia sentido, e cede onde a
   * tela e menor que ele.
   */
  /* A regra base do palco e a primeira do arquivo; as outras sao variantes
     prefixadas, como a da previa do admin. */
  const regra = css.match(/\.region-stage\s*\{([^}]*)\}/);
  assert.ok(regra, "falta a regra do palco");
  assert.match(regra[1], /position:\s*sticky/, "esta nao e a regra base do palco");
  assert.match(
    regra[1],
    /min-height:\s*min\(\s*560px\s*,\s*100svh\s*\)/,
    "o piso de altura do palco precisa ceder quando a tela for menor que ele",
  );
});

test("tela baixa e larga tem regime proprio, porque largura nao diz altura", () => {
  /*
   * As media queries do arquivo perguntam pela LARGURA. Um telefone deitado
   * responde "740px" e recebe o layout de monitor — tipografia de titulo grande,
   * duas colunas de palco, recuos generosos — com os 360px de altura de um
   * telefone. Medido a 740x360, o painel aberto pedia 665px numa caixa util de
   * 286: nem o aperto no piso fechava a conta, e o texto ficava cortado.
   *
   * O regime abaixo pergunta pela ALTURA, e por isso tambem serve a um laptop
   * com a janela encolhida — o mesmo problema, sem telefone nenhum envolvido.
   */
  const baixa = blocoDaMediaQuery(css, "@media (max-height: 560px)");

  /* O palco cede a coluna da irma: e ela que espremia o painel em 254px de
     largura numa tela onde largura era justamente o que sobrava. */
  assert.match(
    baixa.texto,
    /\.journey-pair:has\([^)]*is-expanded[^)]*\)[^{]*\.region-stage\s*\{[^}]*grid-template-columns:/s,
    "o palco baixo precisa entregar a largura inteira ao painel aberto",
  );

  /* Ganhar altura nao pode ser esconder o que a pessoa clicou para ler. */
  assert.doesNotMatch(
    baixa.texto,
    /\.region-(?:description|details|related|tags|actions|media)[^{]*\{[^}]*display:\s*none/s,
    "compactar nao pode remover conteudo editorial",
  );

  /* E o texto dos relacionados nao volta a ser cortado por reticencias: numa
     tela baixa ele fica com MAIS largura, nao menos. */
  assert.doesNotMatch(
    baixa.texto,
    /region-related-text small\s*\{[^}]*text-overflow:\s*ellipsis/s,
    "o resumo do relacionado nao pode voltar a ser truncado",
  );
});

/* ------------------------------------------------------------------
 * O bloco ampliado toma a pagina
 * ------------------------------------------------------------------ */

test("o bloco ampliado perde o cartao e vira a pagina", () => {
  /*
   * Fechado, o bloco e um cartao: borda, canto arredondado, sombra e um fundo
   * opaco que o descola da paisagem. Aberto, ele deixa de ser um objeto POUSADO
   * sobre a jornada e passa a ser a propria pagina — a moldura sobrando ali so
   * lembrava que havia um recorte, e o fundo opaco apagava a paisagem inteira
   * sem que ela tivesse saido de cena.
   */
  const regra = css.match(/\.journey-region\.is-expanded\s+\.region-content\s*\{[^}]*border-radius:\s*0[^}]*\}/);
  assert.ok(regra, "falta desmontar o cartao no estado aberto");
  assert.match(regra[0], /border(?:-color)?:\s*(?:none|0|transparent)/, "a borda do cartao precisa sair");
  assert.match(regra[0], /box-shadow:\s*none/, "a sombra que descola o cartao precisa sair");
});

test("no lugar do fundo do cartao entra um veu, e a paisagem continua atras", () => {
  /*
   * O fundo do cartao e opaco (`--journey-panel`, alfa 1). Esticado para a
   * pagina inteira ele apagaria a paisagem, e o bloco aberto viraria uma tela
   * chapada — o oposto de "a jornada continua ali, so recuada".
   *
   * O veu e o mesmo tom com alfa: escurece o quanto o texto precisa e deixa a
   * montanha aparecer por tras.
   */
  const veu = css.match(/--journey-veu:\s*rgba\(([^)]*)\)/);
  assert.ok(veu, "falta a cor do veu");

  const alfa = Number(veu[1].split(",").pop().trim());
  assert.ok(alfa > 0 && alfa < 1, `o veu precisa ser translucido, veio alfa ${alfa}`);
  /* Fundo demais e cartao esticado; de menos e texto ilegivel sobre a foto. */
  assert.ok(alfa >= 0.7, `alfa ${alfa} deixa o texto competindo com a paisagem`);

  const regra = css.match(/\.journey-region\.is-expanded\s+\.region-content\s*\{[^}]*background:[^;]*--journey-veu[^}]*\}/);
  assert.ok(regra, "o painel aberto precisa usar o veu como fundo");
});

test("com um bloco aberto o palco entrega a pagina inteira, sem recuo e sem a irma", () => {
  /*
   * Para o painel chegar as BORDAS, o recuo tem de sair do palco — se ficar,
   * sobra uma faixa de paisagem em volta e o veu vira um retangulo flutuante, o
   * mesmo cartao de antes com outro nome. O recuo passa a ser interno ao painel,
   * que ja tem o seu.
   *
   * E a irma sai de cena em qualquer largura. Ate aqui isso so valia no telefone
   * e em tela baixa; no monitor ela ficava ao lado, apagada. Debaixo de um veu
   * que cobre a pagina ela seria exatamente "o card atras".
   */
  /* Ha mais de uma regra do palco aberto no arquivo; interessa a que zera o
     recuo, e nao a primeira que casar. */
  /* `[data-side]` entra no seletor por PESO: sem ele a regra perde para as do
     desktop, que trazem `[data-side="left"|"right"]` dentro do `:has()`. */
  const palcos = css.match(/\.journey-pair:has\(\.journey-region\.is-expanded\[data-side\]\)\s+\.region-stage\s*\{[^}]*\}/g) ?? [];
  assert.ok(
    palcos.some((regra) => /padding:\s*0/.test(regra)),
    "o recuo do palco precisa sair para o veu alcancar as bordas",
  );

  /* A irma tem mais de uma regra: a antiga, que so a apagava ao lado, e a que a
     tira de cena. Interessa existir a segunda. */
  const irmas = css.match(/\.journey-pair:has\(\.journey-region\.is-expanded\)\s+\.journey-region:not\(\.is-expanded\)\s+\.region-content\s*\{[^}]*\}/g) ?? [];
  assert.ok(
    irmas.some((regra) => /display:\s*none/.test(regra)),
    "a irma nao pode ficar debaixo do veu",
  );
});

test("o painel que ocupa a pagina nao caminha com a camera em largura nenhuma", () => {
  /*
   * O passo da camera existia para o bloco "ceder o palco" ao abrir. Ocupando a
   * pagina inteira nao ha palco para ceder, e o passo so teria como levar o veu
   * para fora da tela, descobrindo uma faixa da paisagem numa das bordas.
   *
   * Ate aqui a trava era por media query — telefone e tela baixa. Agora vale
   * sempre, e por isso sai de dentro delas.
   */
  const aplica = css.search(/\.journey-region\[data-travessia="transitioning"\]\s+\.region-content[^{]*\{[^}]*transform:\s*translate3d/);
  assert.notEqual(aplica, -1, "sumiu a regra que faz o bloco caminhar com a camera");

  const segura = css.search(/\.journey-region\.is-expanded\[data-travessia[^\]]*\][^{]*\{[^}]*transform:\s*none/);
  assert.notEqual(segura, -1, "falta segurar o painel que ocupa a pagina");
  assert.ok(segura > aplica, "a regra que segura precisa vir depois da que move");
});

test("o veu e da pagina, mas a coluna de leitura nao", () => {
  /*
   * Cobrir a pagina e do FUNDO; esticar o texto junto e outra coisa. Medido a
   * 1440x900, com o painel finalmente ocupando os 1425px, as linhas passaram a
   * atravessar a tela inteira — comprimento em que o olho perde a volta da
   * linha — e todo o conteudo ficou empilhado no canto superior esquerdo, com
   * dois tercos de veu vazio embaixo.
   *
   * O veu continua indo de borda a borda. O que se prende a uma medida legivel
   * e o texto dentro dele, centrado no quadro.
   */
  const medida = css.match(/\.journey-region\.is-expanded\s+\.region-summary,\s*\.journey-region\.is-expanded\s+\.region-details\s*\{([^}]*)\}/);
  assert.ok(medida, "falta prender o texto do painel a uma medida de leitura");
  assert.match(medida[1], /max-width|width:\s*min\(/, "a coluna de leitura precisa de um teto de largura");
  assert.match(medida[1], /margin-inline:\s*auto/, "a coluna precisa ficar centrada no veu");

  /* `[;{]` antes de `height` para nao casar com o `max-height: 100%` de outra
     regra — "height: 100%" e substring dele. */
  const painel = css.match(/\.journey-region\.is-expanded\s+\.region-content\s*\{[^}]*[;{]\s*height:\s*100%[^}]*\}/);
  assert.ok(painel, "falta a regra do painel que ocupa a pagina");
  /*
   * `safe` e obrigatorio, nao enfeite. Centrar conteudo MAIOR que a caixa joga
   * metade do transbordo para cima da borda de cima, e aquilo nao se alcanca
   * rolando: medido a 320x568 com um texto longo, as primeiras linhas ficavam
   * em -63px, fora de alcance para sempre.
   */
  assert.match(painel[0], /align-content:\s*safe\s+center/, "centrar sem `safe` corta o topo do texto");
});

/* ------------------------------------------------------------------
 * A animacao de abrir e fechar
 * ------------------------------------------------------------------ */

test("o fundo entra na lista de transicao, senao ele salta", () => {
  /*
   * A regra de `[data-travessia]` nao ACRESCENTA transicoes: ela substitui a
   * lista inteira da `.region-content`, e o `background` que estava la se
   * perdia. Medido na previa: aos 186ms de uma travessia de 2s o fundo ja era o
   * veu, chapado — o cartao opaco nunca chegava a ficar mais transparente, ele
   * trocava de cor num quadro.
   */
  const regra = css.match(/\.journey-region\[data-travessia\]\s+\.region-content\s*\{([^}]*)\}/);
  assert.ok(regra, "falta a lista de transicoes da travessia");
  assert.match(regra[1], /background-color\s+var\(--travessia-total\)/, "sem isto o fundo troca de cor num quadro");
  assert.match(regra[1], /transform\s+var\(--travessia-total\)/);
  assert.match(regra[1], /opacity\s+var\(--travessia-total\)/);
});

test("a entrada e a saida sao ANIMACAO, nao transicao", () => {
  /*
   * A tentativa obvia — dar ao estado `transitioning` a posicao deslocada e
   * deixar a transicao levar ate `revealed` — nao funciona aqui, e a medicao
   * mostrou por que.
   *
   * O MESMO atributo que marca a partida (`data-travessia`) e o que liga a
   * lista de transicoes. Quando ele aparece, o navegador nao PARTE do
   * deslocamento: ele comeca a transicionar em direcao a ele, a partir de onde o
   * cartao estava. Um quadro depois o estado vira `revealed` e o alvo passa a
   * ser zero — entao a interpolacao inverte de onde estava, que e praticamente o
   * ponto de partida. Capturado a 60fps por 2,4s: 346 quadros, deslocamento 0 em
   * todos eles.
   *
   * `@keyframes` nao tem esse problema: uma animacao sempre comeca no proprio
   * `from`, qualquer que fosse o valor anterior.
   */
  assert.match(css, /@keyframes\s+painel-entra\s*\{/, "falta a animacao de entrada");
  assert.match(css, /@keyframes\s+painel-sai\s*\{/, "falta a animacao de saida");

  /*
   * Qual das duas toca sai do estado, e a assimetria e de proposito.
   *
   * Ao ABRIR, o controlador escreve `transitioning`, forca um calculo de layout
   * e escreve `revealed` na mesma tarefa — nenhum quadro e pintado no meio,
   * entao `transitioning` so e VISTO quando o bloco esta fechando. Por isso a
   * entrada pendura em `revealed` e a saida em `transitioning`.
   */
  const entrada = css.match(/\.journey-region\.is-expanded\[data-travessia="revealed"\]\s+\.region-content\s*\{([^}]*)\}/);
  const saida = css.match(/\.journey-region\.is-expanded\[data-travessia="transitioning"\]\s+\.region-content\s*\{([^}]*)\}/);

  assert.ok(entrada, "falta pendurar a entrada no estado assentado");
  assert.ok(saida, "falta pendurar a saida no estado de transicao");
  assert.match(entrada[1], /animation:\s*painel-entra/);
  assert.match(saida[1], /animation:\s*painel-sai/);
});

test("a direcao vem do recorte medido, e nao de uma variavel por lado", () => {
  /*
   * Havia um `--painel-desloc` por lado, aplicado como `translate3d`. Ele era
   * redundante — o recorte ja abre pelo lado onde o cartao estava, porque o
   * recuo daquele lado e o menor — e era NOCIVO: o recorte e medido nas
   * coordenadas do painel SEM transformacao, entao o translate se somava a ele e
   * levava o retangulo inicial junto.
   *
   * A direcao correta e uma consequencia da medida, e nao uma declaracao a
   * parte que pode discordar dela.
   */
  assert.ok(
    !semComentarios(css).includes("--painel-desloc"),
    "a variavel de deslocamento desalinha o recorte e nao tem mais funcao",
  );
});

test("a animacao parte do cartao opaco e chega no veu", () => {
  /* "Ficando mais transparente" e isto: o fundo sai do tom cheio do cartao e
     chega no veu translucido. Sem esta parte, o bloco so desliza. */
  const entra = blocoDeKeyframes(css, "painel-entra");
    assert.match(entra, /background-color:\s*var\(--journey-panel-open\)/, "a entrada comeca no fundo do cartao");
  assert.match(entra, /clip-path:\s*inset\(/, "a entrada comeca recortada no retangulo do cartao");
});

test("assentado, o painel para no lugar e nao sobra paisagem em borda nenhuma", () => {
  /*
   * O deslocamento vale so no PERCURSO. Um passo que sobrevivesse ao fim da
   * animacao deixaria uma faixa de paisagem descoberta numa das bordas — foi
   * exatamente por isso que o passo de camera permanente teve de sair.
   *
   * Como a entrada e uma animacao que so define `from`, o `to` e o proprio
   * estilo do elemento: zero deslocamento, sem precisar declarar.
   */
  const entra = blocoDeKeyframes(css, "painel-entra");
  assert.ok(!entra.includes("to {"), "declarar o `to` e o que reintroduziria um passo permanente");
});

test("movimento reduzido continua sem deslocamento nenhum", () => {
  /* Quem pediu menos movimento nao recebe o painel deslizando: as animacoes sao
     desligadas, e o bloco simplesmente aparece. */
  const blocos = [];
  for (let i = css.indexOf("@media (prefers-reduced-motion: reduce)"); i !== -1;
       i = css.indexOf("@media (prefers-reduced-motion: reduce)", i + 1)) {
    blocos.push(blocoDaMediaQuery(css.slice(i), "@media (prefers-reduced-motion: reduce)").texto);
  }
  assert.ok(
    blocos.some((bloco) => /\.journey-region\.is-expanded\[data-travessia\][^{]*\{[^}]*animation:\s*none/s.test(bloco)),
    "falta desligar a entrada e a saida no movimento reduzido",
  );
});

test("os cartoes voltam a vista em vez de piscar", () => {
  /*
   * Capturado a 60fps no fechamento: aos 1110ms a opacidade saltava de 0,000
   * para 1,000 num quadro. O painel fechava em zero — que e o que esconde a
   * troca de uma pagina inteira por um cartao pequeno — e os dois cartoes do
   * par apareciam do nada, a irma inclusive, que volta junto.
   *
   * O controlador passou a entregar em dois tempos: o painel devolve o lugar ao
   * cartao, o estado `transitioning` fica mais um instante, e e ele que segura
   * esta animacao de volta.
   */
  assert.match(css, /@keyframes\s+cartao-volta\s*\{/, "falta a volta dos cartoes");

  const volta = blocoDeKeyframes(css, "cartao-volta");
  assert.match(volta, /opacity:\s*0/, "a volta comeca invisivel, que e onde a saida terminou");

  /* Vale para o PAR inteiro: a irma tambem estava fora de cena e voltaria
     piscando junto. */
  const regra = css.match(/\.journey-pair:has\([^)]*:not\(\.is-expanded\)\[data-travessia="transitioning"\][^)]*\)[^{]*\{([^}]*)\}/);
  assert.ok(regra, "falta pendurar a volta no par que acabou de fechar");
  assert.match(regra[1], /animation:\s*cartao-volta/);
});

test("a abertura CRESCE do retangulo do cartao, sem escalar o texto", () => {
  /*
   * Deslocar 92px e escalar 1,5% perto de uma tela de 1000px nao le como
   * crescimento: le como sumir e aparecer no lugar. O tamanho mudava de uma vez,
   * porque o painel troca de coluna do grid e grid nao interpola.
   *
   * O crescimento e recortado, e nao escalado. `scale()` levaria um painel de
   * pagina inteira ao tamanho de um cartao e esmagaria o texto junto; com
   * `clip-path` o conteudo ja esta no lugar certo desde o primeiro quadro, e o
   * que se abre e a janela por onde ele aparece.
   */
  const entra = blocoDeKeyframes(css, "painel-entra");
  assert.match(entra, /clip-path:\s*inset\(/, "a entrada precisa crescer por recorte");
  assert.match(entra, /var\(--recorte-esquerda[,)]/, "o recorte vem medido do cartao");
  assert.ok(!/scale\(/.test(semComentarios(entra)), "escalar o painel esmagaria o texto");

  const sai = blocoDeKeyframes(css, "painel-sai");
  assert.match(sai, /clip-path:\s*inset\(/, "a saida encolhe de volta ao mesmo retangulo");
  assert.ok(!/scale\(/.test(semComentarios(sai)), "escalar o painel esmagaria o texto");
});

test("o arredondamento e um gesto, nao um estado", () => {
  /*
   * O veu termina de ponta a ponta, como antes. O raio existe so enquanto ele
   * cresce: parte do raio do proprio cartao e abre ate zero. Um raio no estado
   * final seria cortado pela borda da tela e nao apareceria de todo jeito.
   */
  const entra = blocoDeKeyframes(css, "painel-entra");
  assert.match(entra, /round\s+var\(--recorte-raio[,)]/, "o gesto comeca com o raio do cartao");

  const repouso = css.match(/\.journey-region\.is-expanded\s+\.region-content\s*\{[^}]*clip-path:[^;]*;/);
  assert.ok(repouso, "o repouso precisa de um clip-path explicito");
  /* Sem um `inset()` declarado no repouso nao ha de onde nem para onde
     interpolar: `none` nao se anima. */
  assert.match(repouso[0], /clip-path:\s*inset\(0/, "o repouso e a pagina inteira, sem raio");
});

test("com um bloco aberto o palco assenta de imediato, sem transicao", () => {
  /*
   * O palco anima o proprio recuo — `transition: padding .72s`. Enquanto essa
   * transicao corre, o painel ainda esta CRESCENDO por layout, e o retangulo da
   * pagina medido pelo controlador nao e o definitivo.
   *
   * Medido a 1024x700: o cartao estava em (581,177) e o recuo de topo calculado
   * saiu 126px onde deveria ser 177 — a animacao partia de um retangulo errado
   * por uns 50px.
   *
   * Com o palco assentando de uma vez, o layout final existe no instante da
   * medida e quem cresce e o recorte, que e o unico que deve crescer.
   */
  const palcos = css.match(/\.journey-pair:has\(\.journey-region\.is-expanded\[data-side\]\)\s+\.region-stage\s*\{[^}]*\}/g) ?? [];
  assert.ok(
    palcos.some((regra) => /transition:\s*none/.test(regra)),
    "o palco aberto nao pode animar o proprio recuo por baixo do recorte",
  );
});

test("o recorte nao pode dividir o quadro com um deslocamento", () => {
  /*
   * O recorte e medido nas coordenadas do PAINEL SEM TRANSFORMACAO: o retangulo
   * do cartao virado em recuos a partir das bordas do painel. Qualquer
   * `translate` no mesmo keyframe se soma a isso e leva o recorte junto.
   *
   * Medido a 1024x700: o cartao ocupava x de 581 a 939, e o recorte partia certo
   * — mas o `translate3d(92px)` que sobrou da versao anterior empurrava tudo
   * para x de 673 a 1031. A animacao crescia do lugar errado por exatamente os
   * 92px do deslocamento.
   *
   * O deslocamento tambem ficou redundante: e o proprio recorte que da a
   * direcao, abrindo pelo lado onde o cartao estava.
   */
  for (const nome of ["painel-entra", "painel-sai"]) {
    const bloco = semComentarios(blocoDeKeyframes(css, nome));
    assert.ok(
      !/translate3d\(var\(--painel-desloc/.test(bloco),
      `${nome} nao pode deslocar: o recorte ja carrega a posicao e a direcao`,
    );
  }
});

test("o palco fica parado durante toda a travessia, e nao so com o bloco aberto", () => {
  /*
   * Congelar o palco so em `:has(.is-expanded)` resolvia metade. Assim que a
   * classe sai — no fim da animacao de saida — a regra deixa de valer, a
   * transicao de `padding` volta e o palco relaxa por mais 0,72s DEPOIS de o
   * veu ja ter ido embora.
   *
   * O estrago e na medida: `medirRecorte` tira a classe por um calculo de
   * layout para saber onde o cartao vai reaparecer, e nesse instante o palco
   * ainda esta com o recuo do estado aberto. Medido a 320x568: a saida terminava
   * em (72,257) e o cartao assentava em (82,208) — o veu encolhia para um lugar
   * que o cartao ia deixar.
   *
   * `[data-travessia]` cobre o gesto inteiro, abertura e fechamento, e some so
   * quando tudo acabou.
   */
  const regra = css.match(/\.journey-pair:has\(\.journey-region\[data-travessia\]\)\s+\.region-stage\s*\{([^}]*)\}/);
  assert.ok(regra, "falta congelar o palco durante a travessia inteira");
  assert.match(regra[1], /transition:\s*none/);
});
