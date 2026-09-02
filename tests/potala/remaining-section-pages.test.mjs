import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { selectGuidedChoice } from "../../outputs/js/sections/front-demo.js";

const outputs = new URL("../../outputs/", import.meta.url);
const pages = {
  editorial: ["cursos.html", "cultura.html"],
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
  const forbidden = ["blog.html", "revista.html", "para-empresas.html", "trabalhe-conosco.html"];
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
  assert.match(html, /programacao\.html/);
});

test("Programação orienta sem congelar agenda temporária", async () => {
  const html = await readFile(new URL("programacao.html", outputs), "utf8");
  assert.match(html, /Acontece hoje|Atividades permanentes/);
  assert.match(html, /institutopotala\.com\/programacao/);
  assert.doesNotMatch(html, /R\$\s*\d|\b\d{1,2}\/\d{1,2}\/2026\b/);
});

test("Inspiração oferece escolhas contemplativas locais", async () => {
  const html = await readFile(new URL("inspiracao.html", outputs), "utf8");
  assert.match(html, /data-guided-choice/);
  assert.match(html, /Respirar|Meditar|Escutar/);
  assert.match(html, /aria-pressed/);
});

test("Atividades convida à prática e à aula experimental", async () => {
  const html = await readFile(new URL("atividades.html", outputs), "utf8");
  assert.match(html, /Corpo|Expressão|Convivência/);
  assert.match(html, /aula experimental/i);
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
    assert.match(html, /<script\s+type="module"\s+src="secoes\.js"><\/script>/, file);
  }
});
