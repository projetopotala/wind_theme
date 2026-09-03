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
