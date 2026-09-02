# Portal Potala Section Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar localmente as oito páginas internas existentes do Portal Potala, distribuindo-as entre as três famílias visuais aprovadas e mantendo conteúdo, navegação e responsividade coerentes.

**Architecture:** Cada página conserva HTML sem framework e o shell compartilhado de `secoes.css`/`secoes.js`. Três folhas novas controlam as famílias editorial, guiada e fotográfica; um módulo pequeno controla apenas as interações demonstrativas de Programação e Inspiração. A cópia permanece no HTML e os estados locais não persistem.

**Tech Stack:** HTML5, CSS responsivo, JavaScript ES modules, Node test runner, Sharp para otimização local de imagens.

**Spec:** `docs/superpowers/specs/2026-09-02-potala-section-pages-design.md`

## Global Constraints

- Trabalhar apenas em `cursos.html`, `atividades.html`, `profissionais.html`, `programacao.html`, `cultura.html`, `inspiracao.html`, `marketplace.html` e `saude-integrativa.html`.
- Não criar Blog, Revista, Para Empresas, Trabalhe Conosco ou outras páginas.
- Não alterar Chegada, Home, estrada, respiração, som, Supabase, autenticação ou painel administrativo.
- Não fazer commit, push ou deploy; toda a implementação permanece local.
- Não fixar datas, preços, vagas ou profissionais sujeitos a mudança.
- Preservar `secoes.css` e `secoes.js` como shell compartilhado.
- Respeitar teclado, foco visível, `prefers-reduced-motion`, textos alternativos e mobile em uma coluna.

---

### Task 1: Contrato estrutural das oito páginas

**Files:**
- Create: `tests/potala/remaining-section-pages.test.mjs`
- Read: `outputs/quem-somos.html`
- Read: `outputs/recepcao.html`
- Read: `outputs/atendimentos.html`

**Interfaces:**
- Consumes: os três modelos existentes e a lista fechada de oito páginas.
- Produces: testes que definem família visual, navegação, acessibilidade e ausência das quatro páginas fora do escopo.

- [ ] **Step 1: Escrever o teste estrutural que ainda falha**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
```

- [ ] **Step 2: Rodar o teste e confirmar RED**

Run: `node --test tests/potala/remaining-section-pages.test.mjs`

Expected: FAIL porque as páginas ainda não possuem `data-section-family` nem imagens editoriais.

- [ ] **Step 3: Registrar a linha de base da suíte**

Run: `npm run test:portal`

Expected: a suíte existente continua verde; somente o teste novo falha quando executado junto.

---

### Task 2: Sistema compartilhado das três famílias

**Files:**
- Create: `outputs/css/section-editorial.css`
- Create: `outputs/css/section-guided.css`
- Create: `outputs/css/section-photographic.css`
- Create: `outputs/js/sections/front-demo.js`
- Modify: `tests/potala/remaining-section-pages.test.mjs`

**Interfaces:**
- Consumes: classes `section-page`, `section-hero`, `section-kicker`, `section-link` e atributos `data-section-family`, `data-guided-choice`, `data-daily-message`.
- Produces: três sistemas responsivos e `createSectionFrontDemo(root)` para estados locais sem persistência.

- [ ] **Step 1: Acrescentar testes que exigem CSS responsivo e reduced motion**

```js
test("as três famílias limitam tipografia e respeitam movimento reduzido", async () => {
  for (const file of ["section-editorial.css", "section-guided.css", "section-photographic.css"]) {
    const css = await readFile(new URL(`css/${file}`, outputs), "utf8");
    assert.match(css, /clamp\(/);
    assert.match(css, /@media\s*\(max-width:\s*760px\)/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
  }
});
```

- [ ] **Step 2: Rodar e confirmar RED por arquivos ausentes**

Run: `node --test tests/potala/remaining-section-pages.test.mjs`

- [ ] **Step 3: Criar as três folhas com tokens comuns e composições distintas**

Implementar em cada folha:

```css
:root {
  --section-cream: #f3eadc;
  --section-paper: #e8d8c4;
  --section-brown: #533929;
  --section-ink: #2a211b;
  --section-gold: #bd9357;
}

[data-section-family] { min-height: 100svh; overflow: clip; }
[data-reveal] { opacity: 0; transform: translateY(24px); transition: .8s ease; }
[data-reveal].is-visible { opacity: 1; transform: none; }

@media (max-width: 760px) { /* uma coluna e títulos com limite */ }
@media (prefers-reduced-motion: reduce) {
  [data-reveal] { opacity: 1; transform: none; transition: none; }
}
```

O editorial usa capítulos e grandes áreas claras; o guiado usa escolhas e painéis escuros; o fotográfico usa grade imagem/texto e listas lineares.

- [ ] **Step 4: Criar a interação local compartilhada**

```js
export function createSectionFrontDemo(root = document) {
  const reveal = [...root.querySelectorAll("[data-reveal]")];
  const observer = matchMedia("(prefers-reduced-motion: reduce)").matches
    ? null
    : new IntersectionObserver((entries) => {
        entries.forEach((entry) => entry.target.classList.toggle("is-visible", entry.isIntersecting));
      }, { threshold: 0.14 });
  reveal.forEach((element) => observer ? observer.observe(element) : element.classList.add("is-visible"));

  root.querySelectorAll("[data-guided-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.closest("[data-guided-group]");
      group?.querySelectorAll("[data-guided-choice]").forEach((item) => {
        item.classList.toggle("is-selected", item === button);
        item.setAttribute("aria-pressed", String(item === button));
      });
    });
  });

  return { destroy: () => observer?.disconnect() };
}

createSectionFrontDemo();
```

- [ ] **Step 5: Rodar os testes focados**

Run: `node --test tests/potala/remaining-section-pages.test.mjs`

Expected: os testes de CSS passam; os testes das páginas continuam vermelhos.

---

### Task 3: Família editorial — Cursos e Arte e Cultura

**Files:**
- Modify: `outputs/cursos.html`
- Modify: `outputs/cultura.html`
- Modify: `tests/potala/remaining-section-pages.test.mjs`
- Reuse: `outputs/media/journey-quem-somos.webp`
- Reuse: `outputs/media/journey-cultura.webp`

**Interfaces:**
- Consumes: `section-editorial.css`, `secoes.css`, `secoes.js` e imagens existentes.
- Produces: duas páginas editoriais completas ligadas à Home e a outras áreas.

- [ ] **Step 1: Acrescentar testes de conteúdo obrigatório**

```js
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
```

- [ ] **Step 2: Rodar e confirmar RED por conteúdo/composição ausentes**

Run: `node --test tests/potala/remaining-section-pages.test.mjs`

- [ ] **Step 3: Reconstruir Cursos com quatro capítulos**

Estrutura: abertura "Aprender transforma o caminho"; formatos de aprendizagem;
prática e ambulatórios; construção colaborativa de futuras turmas; conexões com
Programação e Atendimentos; link oficial para `/cursos`.

- [ ] **Step 4: Reconstruir Arte e Cultura com ritmo de revista cultural**

Estrutura: abertura visual; Cine Potala/saraus/cafés; comunidades de prática;
Biblioteca Potala; frase final "a arte também é uma forma de cuidado"; conexões
com Programação e Atividades.

- [ ] **Step 5: Rodar o teste focado**

Run: `node --test tests/potala/remaining-section-pages.test.mjs`

Expected: Cursos e Cultura verdes; demais páginas ainda vermelhas.

---

### Task 4: Família guiada — Programação e Inspiração

**Files:**
- Modify: `outputs/programacao.html`
- Modify: `outputs/inspiracao.html`
- Modify: `tests/potala/remaining-section-pages.test.mjs`
- Reuse: `outputs/media/journey-inspiracao.webp`
- Reuse: `outputs/media/home-travessia.webp`

**Interfaces:**
- Consumes: `section-guided.css`, `front-demo.js`, `data-guided-group`, `data-guided-choice`.
- Produces: escolhas locais acessíveis e links para informações atuais.

- [ ] **Step 1: Acrescentar testes de orientação e segurança temporal**

```js
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
```

- [ ] **Step 2: Rodar e confirmar RED**

Run: `node --test tests/potala/remaining-section-pages.test.mjs`

- [ ] **Step 3: Reconstruir Programação como agenda de descoberta**

Criar escolhas para "hoje", "começar a qualquer momento", "inscrições" e
"eventos especiais". As escolhas alteram somente destaque e explicação local;
o botão de agenda abre a programação oficial.

- [ ] **Step 4: Reconstruir Inspiração como pausa guiada opcional**

Criar três escolhas — respirar, meditar e escutar — com mensagens locais, uma
frase contemplativa, sugestões de práticas breves e conexões com Atividades e
Saúde Integrativa. Nenhum áudio começa automaticamente.

- [ ] **Step 5: Rodar o teste focado**

Run: `node --test tests/potala/remaining-section-pages.test.mjs`

Expected: as quatro páginas das famílias A e B ficam verdes.

---

### Task 5: Imagens humanas da família fotográfica

**Files:**
- Create: `outputs/media/atividades-pratica.webp`
- Create: `outputs/media/profissionais-encontro.webp`
- Create: `outputs/media/saude-integrativa-escuta.webp`
- Create: `outputs/media/marketplace-contexto.webp`
- Modify: `tests/potala/remaining-section-pages.test.mjs`

**Interfaces:**
- Consumes: direção visual terrosa e humana dos três modelos aprovados.
- Produces: quatro imagens WebP sem texto, logotipo ou símbolos genéricos.

- [ ] **Step 1: Acrescentar teste de presença e orçamento**

```js
import { stat } from "node:fs/promises";

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
```

- [ ] **Step 2: Rodar e confirmar RED por imagens ausentes**

Run: `node --test tests/potala/remaining-section-pages.test.mjs`

- [ ] **Step 3: Gerar as quatro cenas com ImageGen**

Prompts finais:

- Atividades: pequeno grupo brasileiro praticando movimento consciente em sala
  arejada, luz natural, corpos e idades variados, gesto espontâneo.
- Profissionais: três profissionais brasileiros conversando em ambiente do
  Instituto, roupas e formações visivelmente diversas, encontro colaborativo.
- Saúde Integrativa: conversa atenta entre profissional e visitante, elementos
  discretos de corpo, plantas e caderno, sem equipamento hospitalar.
- Marketplace: mãos escolhendo livro, óleo essencial e objeto artesanal sobre
  madeira, presença humana, compra contextual sem estética de e-commerce.

Todas: fotografia editorial natural, tons terrosos, sem texto, logo, uniforme,
estereótipo místico ou pose de banco de imagens; composição vertical 4:5.

- [ ] **Step 4: Converter as imagens para WebP**

Usar Sharp com largura 1440, qualidade 86 e manter proporção. Nenhuma imagem
pode exceder 700 KB.

- [ ] **Step 5: Rodar o teste focado**

Run: `node --test tests/potala/remaining-section-pages.test.mjs`

Expected: os quatro testes de assets passam.

---

### Task 6: Família fotográfica — quatro páginas

**Files:**
- Modify: `outputs/atividades.html`
- Modify: `outputs/profissionais.html`
- Modify: `outputs/saude-integrativa.html`
- Modify: `outputs/marketplace.html`
- Modify: `tests/potala/remaining-section-pages.test.mjs`

**Interfaces:**
- Consumes: `section-photographic.css` e as quatro imagens da Task 5.
- Produces: quatro páginas humanas e editoriais com conexões internas.

- [ ] **Step 1: Acrescentar testes de conteúdo essencial**

```js
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
```

- [ ] **Step 2: Rodar e confirmar RED**

Run: `node --test tests/potala/remaining-section-pages.test.mjs`

- [ ] **Step 3: Reconstruir Atividades**

Imagem humana à esquerda; texto à direita; três faixas para corpo, expressão e
convivência; bloco de experimentação; conexão com Programação e Cursos.

- [ ] **Step 4: Reconstruir Profissionais**

Imagem de comunidade à esquerda; introdução sobre trajetórias; modos de busca
por nome, técnica ou necessidade; exemplos de contribuições; conexão com
Atendimentos e Cursos.

- [ ] **Step 5: Reconstruir Saúde Integrativa**

Imagem de escuta; explicação da pessoa inteira; perspectivas de cuidado;
responsabilidade e complementaridade; conexão com Atendimentos e Atividades.

- [ ] **Step 6: Reconstruir Marketplace**

Imagem de objetos em contexto; categorias resumidas; recomendações ligadas a
cursos e práticas; linguagem não agressiva; link para o site oficial.

- [ ] **Step 7: Rodar o teste focado**

Run: `node --test tests/potala/remaining-section-pages.test.mjs`

Expected: todos os testes novos passam.

---

### Task 7: Conexões, assets e revisão visual

**Files:**
- Modify: somente as oito páginas se a revisão encontrar defeitos.
- Modify: somente as três folhas de família se a revisão encontrar defeitos.
- Test: `tests/potala/remaining-section-pages.test.mjs`

**Interfaces:**
- Consumes: as oito páginas concluídas.
- Produces: experiência navegável localmente sem links ou assets quebrados.

- [ ] **Step 1: Executar a suíte focada e a suíte completa**

Run: `node --test tests/potala/remaining-section-pages.test.mjs`

Run: `npm run test:portal`

Expected: zero falhas.

- [ ] **Step 2: Executar lint e validação de assets**

Run: `npm run lint`

Run: `npm run validate:portal`

Run: `git diff --check`

Expected: todos retornam código 0.

- [ ] **Step 3: Abrir cada página em desktop**

Usar o servidor local existente em `http://127.0.0.1:4173/`. Verificar em
1440×900: título completo, imagem nítida, ausência de sobreposição, links e
foco visível.

- [ ] **Step 4: Revisar cada página em mobile**

Verificar em aproximadamente 390×844: uma coluna, imagem antes do texto,
nenhum corte horizontal, alvos de toque confortáveis e títulos dentro da tela.

- [ ] **Step 5: Revisar movimento reduzido e teclado**

Ativar `prefers-reduced-motion`, percorrer links/botões com Tab e confirmar que
todo conteúdo permanece visível e compreensível.

- [ ] **Step 6: Corrigir apenas defeitos encontrados e repetir os gates**

Repetir `npm run test:portal`, `npm run lint`, `npm run validate:portal` e
`git diff --check` após qualquer correção.

- [ ] **Step 7: Parar localmente**

Não executar `git add`, `git commit`, `git push` nem comandos de deploy. Entregar
ao usuário a prévia local e um resumo dos arquivos alterados.
