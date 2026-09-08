import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { selectGuidedChoice } from "../../outputs/js/sections/front-demo.js";

const outputs = new URL("../../outputs/", import.meta.url);
const pages = {
  editorial: ["cursos.html", "cultura.html", "revista.html"],
  guided: ["programacao.html", "inspiracao.html"],
  photographic: [
    "atividades.html",
    "profissionais.html",
    "saude-integrativa.html",
    "marketplace.html",
  ],
};

for (const [family, files] of Object.entries(pages)) {
  for (const file of files) {
    test(`${file} usa a família ${family}`, async () => {
      const html = await readFile(new URL(file, outputs), "utf8");
      assert.match(html, new RegExp(`data-section-family="${family}"`));
      assert.match(html, /href="transcendido\.html"/);
      assert.match(html, /<main[^>]+id="conteudo"/);
      assert.match(html, /<img[^>]+alt="[^"]+"/);
    });
  }
}

test("não cria páginas que ficaram fora do escopo", async () => {
  /*
   * `blog.html` SAIU desta lista porque saiu do "depois" — foi pedido e foi
   * construído, com acervo fictício, oráculo do dia e comentários só de front.
   *
   * A lista continua valendo para as outras três. Ela não existe para proibir
   * trabalho: existe para que uma página nasça quando alguém decidir que ela
   * nasce, e não de raspão, meio pronta, porque era fácil aproveitar o
   * gabarito da vizinha.
   */
  const forbidden = ["para-empresas.html", "trabalhe-conosco.html"];
  await Promise.all(forbidden.map(async (file) => {
    await assert.rejects(readFile(new URL(file, outputs), "utf8"));
  }));
});

test("Cursos apresenta formatos, prática e construção de turmas", async () => {
  const html = await readFile(new URL("cursos.html", outputs), "utf8");
  assert.match(html, /Cursos livres|Formações profissionais/);
  assert.match(html, /Monte seu curso/i);
  assert.match(html, /prática supervisionada/i);
});

test("Arte e Cultura apresenta encontro, biblioteca e programação", async () => {
  const html = await readFile(new URL("cultura.html", outputs), "utf8");
  assert.match(html, /Cine Potala/);
  assert.match(html, /Biblioteca Potala/);
  assert.match(html, /Clube de leitura|Comunidades que continuam/);
  assert.match(html, /data-library-search/);
  for (const slug of ["cine-potala", "exposicoes", "cafe-filosofico", "saraus", "festivais", "rodas-de-conversa"]) {
    assert.match(html, new RegExp(`experiencias-culturais\\.html\\?experiencia=${slug}`), slug);
  }
  assert.match(html, /programacao\.html/);
});

test("Programação orienta sem congelar agenda temporária", async () => {
  const html = await readFile(new URL("programacao.html", outputs), "utf8");

  /*
   * A CHECAGEM MUDOU DE ÂNCORA, e não de propósito.
   *
   * Ela procurava "Acontece hoje", um dos cinco cartões de destaque que a
   * página tinha. Os cartões saíram e no lugar entrou o índice por categoria,
   * que nomeia as coisas de forma mais completa do que eles nomeavam.
   *
   * O que o teste protege é o mesmo: a página tem de dizer o que existe na
   * casa, com nome, em vez de mandar todo mundo para o site oficial.
   */
  for (const categoria of ["Atendimentos", "Cursos", "Atividades", "Eventos culturais"]) {
    assert.match(html, new RegExp(`<h3 id="categoria-[a-z-]+">${categoria} `), `o índice perdeu ${categoria}`);
  }

  assert.match(html, /institutopotala\.com\/programacao/);
  assert.doesNotMatch(html, /R\$\s*\d|\b\d{1,2}\/\d{1,2}\/2026\b/);
});

test("Inspiração oferece escolhas contemplativas locais", async () => {
  const html = await readFile(new URL("inspiracao.html", outputs), "utf8");
  assert.match(html, /data-practice-choice/);
  assert.match(html, /data-practice-stage/);
  assert.match(html, /data-practice-start/);
  assert.match(html, /Respirar|Meditar|Escutar/);
  assert.match(html, /Pathwork|Tarô|Runas|I Ching/);
  assert.match(html, /não (?:é|serve como) previsão/i);
  assert.match(html, /revista\.html/);
  assert.match(html, /aria-pressed/);
  assert.doesNotMatch(html, /O silêncio também pode orientar/);
});

test("Revista transforma atualidade em reflexão e caminhos", async () => {
  const html = await readFile(new URL("revista.html", outputs), "utf8");
  assert.match(html, /magazine-masthead/);
  assert.match(html, /magazine-issue/);
  assert.match(html, /Sumário|Nesta edição/);
  assert.match(html, /data-magazine-filter/);
  assert.match(html, /Ciência e saúde|Comportamento e sociedade/);
  assert.match(html, /Artigos relacionados|Cursos relacionados|Atendimentos relacionados/);
  assert.doesNotMatch(html, /Não queremos repetir o ruído do mundo/);
  assert.doesNotMatch(html, /Quando tudo pede atenção ao mesmo tempo/);
});

test("Atividades convida à prática e à aula experimental", async () => {
  const html = await readFile(new URL("atividades.html", outputs), "utf8");
  assert.match(html, /Corpo|Expressão|Convivência/);
  assert.match(html, /aula experimental/i);

  /*
   * A família de MENTE E EXPRESSÃO precisa estar entre as outras.
   *
   * O Instituto ensina desenho, música, teatro e escrita, e a lista de práticas
   * cobria só corpo e convivência: quem procurasse violão ou fotografia saía da
   * página achando que o Potala não oferece.
   */
  assert.match(html, /Mente e expressão/);
  for (const pratica of ["Desenho", "pintura", "violão", "violino", "canto", "xadrez", "escrita", "teatro", "fotografia"]) {
    assert.match(html, new RegExp(pratica), `a lista perdeu "${pratica}"`);
  }

  /*
   * E o xadrez aparece UMA vez só.
   *
   * Ele estava na Convivência como exemplo de concentração e foi pedido aqui
   * como prática de mente. Nas duas, a lista deixa de ser um índice de famílias
   * e vira exemplos que se cruzam — quem procura xadrez encontra duas portas
   * para o mesmo lugar.
   */
  /*
   * Cada AULA carrega a própria rotina, e não a família.
   *
   * O documento do Ecossistema pede que dias, horários, duração, frequência,
   * nível e materiais sejam fáceis de achar, "permitindo que cada visitante
   * organize sua participação de acordo com sua disponibilidade". Por família,
   * a informação era a união de tudo — "segunda a sexta, 7h, 12h e 19h" não
   * dizia quando ir ao pilates.
   *
   * Uma aula sem esses campos é a que faz a pessoa sair da página para
   * perguntar, e o defeito não aparece na tela: as outras vinte e uma
   * respondem, e a lista parece completa.
   */
  const familias = [...html.matchAll(/<article data-reveal>[\s\S]*?<\/article>/g)].map(([b]) => b);
  assert.ok(familias.length >= 5, `só ${familias.length} famílias`);

  let aulas = 0;
  for (const familia of familias) {
    const nome = /<h3>([^<]*)<\/h3>/.exec(familia)?.[1] || "?";
    const blocos = [...familia.matchAll(/<details class="photo-aula"[\s\S]*?<\/details>/g)].map(([b]) => b);
    assert.ok(blocos.length >= 3, `"${nome}" tem só ${blocos.length} aulas`);
    aulas += blocos.length;

    for (const bloco of blocos) {
      const aula = /<summary>([^<]*)<\/summary>/.exec(bloco)?.[1] || "?";
      for (const campo of ["Dias", "Horários", "Duração", "Frequência sugerida", "Nível", "O que levar"]) {
        assert.match(bloco, new RegExp(`<dt>${campo}</dt>`), `"${aula}" sem ${campo}`);
      }
      /* E cada rótulo tem valor: um dd em branco passaria por qualquer busca de
         rótulo e deixaria a pessoa sem a informação do mesmo jeito.

         Só vazio conta como falta. Exigir mais de dois caracteres reprovava
         "8h", que é uma resposta inteira — a regra obrigaria a inchar o texto
         para agradar o teste. */
      for (const [, valor] of bloco.matchAll(/<dd>([^<]*)<\/dd>/g)) {
        assert.ok(valor.trim().length > 0, `"${aula}" tem um campo em branco`);
      }
    }
  }
  assert.ok(aulas >= 20, `só ${aulas} aulas na página inteira`);

  /*
   * E o xadrez está em UMA família só.
   *
   * Ele estava na Convivência como exemplo de concentração e foi pedido aqui
   * como prática de mente. Nas duas, a lista deixa de ser um índice de famílias
   * e vira exemplos que se cruzam — quem procura xadrez encontra duas portas
   * para o mesmo lugar. Conto por família, e não por ocorrência: agora o nome
   * aparece legitimamente duas vezes dentro da mesma, no texto e na pastilha.
   */
  const semComentarios = familias.map((f) => f.replace(/<!--[\s\S]*?-->/g, ""));
  assert.equal(
    semComentarios.filter((f) => /xadrez/i.test(f)).length,
    1,
    "o xadrez ficou em duas famílias",
  );
});

test("Profissionais apresenta trajetórias, não um diretório", async () => {
  const html = await readFile(new URL("profissionais.html", outputs), "utf8");
  assert.match(html, /trajetória/i);
  assert.match(html, /técnica|especialidade/i);
  assert.match(html, /atendimentos\.html|cursos\.html/);
});

test("Saúde Integrativa explica complementaridade", async () => {
  const html = await readFile(new URL("saude-integrativa.html", outputs), "utf8");
  assert.match(html, /corpo, mente/i);
  assert.match(html, /complementar/i);
});

test("Marketplace mantém conhecimento antes da compra", async () => {
  const html = await readFile(new URL("marketplace.html", outputs), "utf8");
  assert.match(html, /conhecimento antes da compra/i);
  assert.match(html, /livros|óleos essenciais|cristais/i);
});

for (const image of [
  "atividades-pratica.webp",
  "profissionais-encontro.webp",
  "saude-integrativa-escuta.webp",
  "marketplace-contexto.webp",
]) {
  test(`${image} existe dentro do orçamento`, async () => {
    const info = await stat(new URL(`media/${image}`, outputs));
    assert.ok(info.size > 40_000);
    assert.ok(info.size < 700_000);
  });
}

test("as três famílias limitam tipografia e respeitam movimento reduzido", async () => {
  for (const file of ["section-editorial.css", "section-guided.css", "section-photographic.css"]) {
    const css = await readFile(new URL(`css/${file}`, outputs), "utf8");
    assert.match(css, /clamp\(/);
    assert.match(css, /@media\s*\(max-width:\s*760px\)/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
  }
});

test("a escolha guiada atualiza seleção e resposta sem navegar", () => {
  const response = { textContent: "Resposta inicial" };
  const createButton = (copy) => ({
    dataset: { response: copy },
    selected: false,
    attributes: {},
    classList: {
      toggle(_name, selected) { this.owner.selected = selected; },
      owner: null,
    },
    setAttribute(name, value) { this.attributes[name] = value; },
  });
  const first = createButton("Primeiro caminho");
  const second = createButton("Segundo caminho");
  first.classList.owner = first;
  second.classList.owner = second;
  const group = {
    querySelectorAll: () => [first, second],
    querySelector: () => response,
  };

  selectGuidedChoice(group, second);

  assert.equal(first.selected, false);
  assert.equal(first.attributes["aria-pressed"], "false");
  assert.equal(second.selected, true);
  assert.equal(second.attributes["aria-pressed"], "true");
  assert.equal(response.textContent, "Segundo caminho");
});

test("todas as seções carregam o entrypoint compartilhado como módulo", async () => {
  const files = [
    "quem-somos.html",
    "recepcao.html",
    "atendimentos.html",
    ...Object.values(pages).flat(),
  ];

  for (const file of files) {
    const html = await readFile(new URL(file, outputs), "utf8");
    assert.match(html, /<script\s+type="module"\s+src="js\/secoes\.js"><\/script>/, file);
  }
});
