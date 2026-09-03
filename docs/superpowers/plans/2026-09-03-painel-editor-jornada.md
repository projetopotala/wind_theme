# Editor da jornada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Potala admin panel as the "Editor da jornada" from the client's mockup, with a working draft/publish cycle and a live preview.

**Architecture:** The 405-line `admin-controller.js` splits into nine focused modules; the three that hold the logic that can fail silently — draft state, filtering, Markdown conversion — are pure functions tested without a browser. Drafts live in a mirror table that `anon` cannot read, and publishing runs in one transaction. The formatting toolbar stores restricted Markdown, never HTML, so the Home never has to switch to `innerHTML`.

**Tech Stack:** Static site in `outputs/` — HTML5, CSS, ES modules, no browser dependencies. Node 22 test runner (`node:test`, `node:assert/strict`). Supabase (Postgres + RLS) for storage. three.js only inside the preview iframe, where the real Home already runs it.

**Spec:** `docs/superpowers/specs/2026-09-03-painel-editor-jornada-design.md`

## Global Constraints

- Code comments, UI copy, and error messages in Portuguese. Commit messages in English, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Every test must be verified by mutation: reintroduce the defect, confirm the test fails, restore.
- Full suite and lint before every commit: `npm run test:portal` and `npx eslint outputs tests scripts`.
- `home_block_drafts` receives **no** `grant` to `anon`. Not even `select`.
- The Markdown converter accepts link URLs with `http:`, `https:`, or a relative path only. `javascript:` and `data:` are dropped.
- The database never stores HTML. The `body` column stays plain text.
- Publishing is one transaction: all drafts or none.
- The keyboard path for reordering ("Mover acima" / "Mover abaixo") must survive the redesign.
- Interactive targets are at least 44px. `prefers-reduced-motion: reduce` disables transitions.
- No new browser-side dependency. three.js stays where it already is.

---

### Task 1: Restricted Markdown converter

The single module both the panel and the Home import. Its allowlist is its own grammar: it only emits the tags it knows how to produce, so there is no filter anyone can forget to apply.

**Files:**
- Create: `outputs/js/shared/markdown.js`
- Test: `tests/potala/markdown.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `renderRestrictedMarkdown(texto: string): string` — returns HTML with every character not part of a recognised mark escaped. `safeLinkHref(valor: string): string` — returns the URL, or `"#"` when the scheme is not allowed.

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/potala/markdown.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import { renderRestrictedMarkdown, safeLinkHref } from "../../outputs/js/shared/markdown.js";

test("parágrafos saem de linhas em branco", () => {
  assert.equal(
    renderRestrictedMarkdown("Primeiro.\n\nSegundo."),
    "<p>Primeiro.</p><p>Segundo.</p>",
  );
});

test("negrito, itálico e link viram tags", () => {
  assert.equal(
    renderRestrictedMarkdown("**forte** e *leve* e [Potala](https://institutopotala.com/)"),
    '<p><strong>forte</strong> e <em>leve</em> e <a href="https://institutopotala.com/">Potala</a></p>',
  );
});

test("listas e citação", () => {
  assert.equal(
    renderRestrictedMarkdown("- um\n- dois"),
    "<ul><li>um</li><li>dois</li></ul>",
  );
  assert.equal(
    renderRestrictedMarkdown("1. um\n2. dois"),
    "<ol><li>um</li><li>dois</li></ol>",
  );
  assert.equal(renderRestrictedMarkdown("> silêncio"), "<blockquote>silêncio</blockquote>");
});

/*
 * O valor deste módulo é não deixar HTML passar. É isso que os testes hostis
 * precisam provar — não que ele formata bonito.
 */
test("HTML colado no texto é escapado, não executado", () => {
  assert.equal(
    renderRestrictedMarkdown("<script>alert(1)</script>"),
    "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
  );
  assert.equal(
    renderRestrictedMarkdown('<img src=x onerror="alert(1)">'),
    '<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>',
  );
});

test("esquema de link fora da lista vira #", () => {
  assert.equal(safeLinkHref("javascript:alert(1)"), "#");
  assert.equal(safeLinkHref("data:text/html,<script>"), "#");
  assert.equal(safeLinkHref("  JavaScript:alert(1)  "), "#");
  assert.equal(safeLinkHref("https://institutopotala.com/"), "https://institutopotala.com/");
  assert.equal(safeLinkHref("quem-somos.html"), "quem-somos.html");
  assert.equal(safeLinkHref("/media/foto.webp"), "/media/foto.webp");
});

test("link com esquema proibido continua sendo link, mas inerte", () => {
  assert.equal(
    renderRestrictedMarkdown("[clique](javascript:alert(1))"),
    '<p><a href="#">clique</a></p>',
  );
});

test("marca não fechada fica como texto", () => {
  assert.equal(renderRestrictedMarkdown("**quase"), "<p>**quase</p>");
  assert.equal(renderRestrictedMarkdown("[sem fim](http"), "<p>[sem fim](http</p>");
});

test("aspas e e-comercial dentro do texto do link são escapados", () => {
  assert.equal(
    renderRestrictedMarkdown('[a & "b"](https://x.test/?q=1&r=2)'),
    '<p><a href="https://x.test/?q=1&amp;r=2">a &amp; &quot;b&quot;</a></p>',
  );
});

test("texto vazio não produz parágrafo vazio", () => {
  assert.equal(renderRestrictedMarkdown(""), "");
  assert.equal(renderRestrictedMarkdown("   \n\n  "), "");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/potala/markdown.test.mjs`
Expected: FAIL — `Cannot find module .../outputs/js/shared/markdown.js`

- [ ] **Step 3: Write the converter**

```javascript
// outputs/js/shared/markdown.js
/*
 * Markdown restrito — o único caminho pelo qual o texto do painel vira HTML.
 *
 * O painel guarda texto no banco, nunca HTML. Este módulo é o que transforma
 * as marcas em tags na hora de exibir, e a lista de tags permitidas é a
 * própria gramática dele: ele só sabe emitir o que reconhece. Não existe um
 * saneador separado que alguém possa esquecer de chamar.
 *
 * Escapar vem SEMPRE antes de marcar. Na ordem contrária, um "<b>" colado pelo
 * editor sobreviveria à marcação e chegaria à tela como tag de verdade.
 */

const ESQUEMAS_PERMITIDOS = new Set(["http:", "https:"]);

function escapar(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * O endereço de um link, ou "#" quando o esquema não é aceito.
 *
 * Caminho relativo passa: é como a Home aponta para as próprias páginas. O que
 * não passa é esquema executável — `javascript:` roda código no navegador de
 * quem visita, e `data:` carrega um documento inteiro embutido na URL.
 */
export function safeLinkHref(valor) {
  const cru = String(valor ?? "").trim();
  if (!cru) return "#";
  // Sem "://" e sem ":" no começo, é caminho relativo.
  const esquema = cru.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!esquema) return cru;
  return ESQUEMAS_PERMITIDOS.has(esquema[1].toLowerCase() + ":") ? cru : "#";
}

/* As marcas de dentro da linha, aplicadas depois do escape. A ordem importa:
   o link primeiro, senão um "*" dentro do endereço viraria itálico. */
function marcarLinha(escapado) {
  return escapado
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, texto, url) =>
      `<a href="${escapar(safeLinkHref(url))}">${texto}</a>`)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

function tipoDaLinha(linha) {
  if (/^\s*[-*]\s+/.test(linha)) return "ul";
  if (/^\s*\d+\.\s+/.test(linha)) return "ol";
  if (/^\s*>\s?/.test(linha)) return "blockquote";
  return "p";
}

function conteudoDaLinha(linha, tipo) {
  if (tipo === "ul") return linha.replace(/^\s*[-*]\s+/, "");
  if (tipo === "ol") return linha.replace(/^\s*\d+\.\s+/, "");
  if (tipo === "blockquote") return linha.replace(/^\s*>\s?/, "");
  return linha;
}

export function renderRestrictedMarkdown(texto) {
  const linhas = String(texto ?? "").replace(/\r\n/g, "\n").split("\n");
  const saida = [];
  let bloco = null;
  let acumulado = [];

  const fechar = () => {
    if (!bloco || acumulado.length === 0) {
      bloco = null;
      acumulado = [];
      return;
    }
    const partes = acumulado.map((linha) => marcarLinha(escapar(linha)));
    if (bloco === "ul" || bloco === "ol") {
      saida.push(`<${bloco}>${partes.map((p) => `<li>${p}</li>`).join("")}</${bloco}>`);
    } else {
      saida.push(`<${bloco}>${partes.join(" ")}</${bloco}>`);
    }
    bloco = null;
    acumulado = [];
  };

  for (const linha of linhas) {
    if (!linha.trim()) {
      fechar();
      continue;
    }
    const tipo = tipoDaLinha(linha);
    if (tipo !== bloco) fechar();
    bloco = tipo;
    acumulado.push(conteudoDaLinha(linha, tipo));
  }
  fechar();

  return saida.join("");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/potala/markdown.test.mjs`
Expected: PASS, 9 tests.

- [ ] **Step 5: Verify by mutation**

Reintroduce each defect, confirm the matching test fails, then restore:

1. Swap the order in `renderRestrictedMarkdown` so `marcarLinha` runs before `escapar` → the HTML-escaping tests must fail.
2. Make `safeLinkHref` return `cru` unconditionally → the scheme tests must fail.
3. Drop `.replace(/"/g, "&quot;")` from `escapar` → the quotes test must fail.
4. Move the `**` replacement before the link replacement → no test may fail; if none does, add one with `*` inside a URL and re-verify.

- [ ] **Step 6: Run the full suite and lint**

Run: `npm run test:portal` then `npx eslint outputs tests scripts`
Expected: all pass, lint exit 0.

- [ ] **Step 7: Commit**

```bash
git add outputs/js/shared/markdown.js tests/potala/markdown.test.mjs
git commit -m "feat(shared): convert restricted Markdown without ever storing HTML

The panel's formatting toolbar has to produce something the Home can render.
Storing HTML would mean switching the Home's body field to innerHTML, which
turns every stored block into code the visitor's browser executes.

This converter takes the other path: the database keeps plain text, and the
allowlist is the converter's own grammar — it emits only the tags it knows how
to produce, so there is no separate sanitiser anyone can forget to call.

Escaping runs before marking, not after. In the other order a pasted <b>
survives the marking pass and reaches the screen as a real tag.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Draft state rules

Pure functions for the three block states, the counters they feed, and what publishing does. No DOM, no network — this is the logic that decides what the editor believes is live.

**Files:**
- Create: `outputs/js/admin/admin-draft.js`
- Test: `tests/potala/admin-draft.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `blockState({published, draft}): "rascunho" | "publicado" | "pendente"`
  - `mergeBlocks({published: Block[], drafts: Block[]}): Entry[]` where `Entry = {id, block, state, hasDraft}` — `block` is the draft when one exists, otherwise the published row.
  - `pendingCount(entries: Entry[]): number`
  - `publishPayload(entries: Entry[]): Block[]` — every block that has a draft, ready for the RPC.

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/potala/admin-draft.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import { blockState, mergeBlocks, pendingCount, publishPayload } from "../../outputs/js/admin/admin-draft.js";

const bloco = (id, extra = {}) => ({ id, title: id, published: true, position: 0, ...extra });

test("um bloco só em rascunho é rascunho", () => {
  assert.equal(blockState({ published: null, draft: bloco("a") }), "rascunho");
});

test("um bloco só publicado é publicado", () => {
  assert.equal(blockState({ published: bloco("a"), draft: null }), "publicado");
});

test("um bloco nos dois lugares está pendente", () => {
  assert.equal(blockState({ published: bloco("a"), draft: bloco("a") }), "pendente");
});

/*
 * Publicado com "Exibir na jornada" desligado conta como rascunho, porque é
 * isso que ele é para quem visita: invisível. Sem esta regra o painel chamaria
 * de publicado um bloco que ninguém consegue ver.
 */
test("publicado e escondido conta como rascunho", () => {
  assert.equal(blockState({ published: bloco("a", { published: false }), draft: null }), "rascunho");
});

test("mergeBlocks entrega o rascunho quando ele existe", () => {
  const entradas = mergeBlocks({
    published: [bloco("a", { title: "Velho" })],
    drafts: [bloco("a", { title: "Novo" })],
  });
  assert.equal(entradas.length, 1);
  assert.equal(entradas[0].block.title, "Novo");
  assert.equal(entradas[0].state, "pendente");
  assert.equal(entradas[0].hasDraft, true);
});

test("mergeBlocks inclui bloco que só existe como rascunho", () => {
  const entradas = mergeBlocks({ published: [], drafts: [bloco("novo")] });
  assert.deepEqual(entradas.map((e) => e.id), ["novo"]);
  assert.equal(entradas[0].state, "rascunho");
});

test("mergeBlocks ordena por posição", () => {
  const entradas = mergeBlocks({
    published: [bloco("b", { position: 1 }), bloco("a", { position: 0 })],
    drafts: [],
  });
  assert.deepEqual(entradas.map((e) => e.id), ["a", "b"]);
});

test("pendingCount conta só quem tem rascunho", () => {
  const entradas = mergeBlocks({
    published: [bloco("a"), bloco("b")],
    drafts: [bloco("a"), bloco("c")],
  });
  assert.equal(pendingCount(entradas), 2);
});

test("publishPayload leva todo rascunho, inclusive o que nunca foi ao ar", () => {
  const entradas = mergeBlocks({
    published: [bloco("a", { title: "Velho" })],
    drafts: [bloco("a", { title: "Novo" }), bloco("c")],
  });
  assert.deepEqual(publishPayload(entradas).map((b) => b.id).sort(), ["a", "c"]);
  assert.equal(publishPayload(entradas).find((b) => b.id === "a").title, "Novo");
});

test("publishPayload não leva bloco sem rascunho", () => {
  const entradas = mergeBlocks({ published: [bloco("a")], drafts: [] });
  assert.deepEqual(publishPayload(entradas), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/potala/admin-draft.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```javascript
// outputs/js/admin/admin-draft.js
/*
 * Os três estados de um bloco, e o que "Publicar alterações" leva.
 *
 * Sem DOM e sem rede de propósito: é a lógica que decide o que o editor
 * acredita estar no ar, e errar aqui não aparece na tela — aparece depois, com
 * alguém publicando o que não queria.
 */

/** @returns {"rascunho"|"publicado"|"pendente"} */
export function blockState({ published = null, draft = null } = {}) {
  if (draft && published) return "pendente";
  if (draft) return "rascunho";
  // Publicado com "Exibir na jornada" desligado é invisível para quem visita,
  // e chamar isso de publicado seria mentir para quem edita.
  if (published) return published.published === false ? "rascunho" : "publicado";
  return "rascunho";
}

export function mergeBlocks({ published = [], drafts = [] } = {}) {
  const porId = new Map();
  for (const bloco of published) {
    if (bloco?.id) porId.set(bloco.id, { id: bloco.id, published: bloco, draft: null });
  }
  for (const bloco of drafts) {
    if (!bloco?.id) continue;
    const atual = porId.get(bloco.id) || { id: bloco.id, published: null, draft: null };
    porId.set(bloco.id, { ...atual, draft: bloco });
  }

  return [...porId.values()]
    .map(({ id, published: pub, draft }) => ({
      id,
      block: draft || pub,
      state: blockState({ published: pub, draft }),
      hasDraft: Boolean(draft),
    }))
    .sort((esquerda, direita) => {
      const a = Number(esquerda.block?.position ?? 0);
      const b = Number(direita.block?.position ?? 0);
      return a === b ? esquerda.id.localeCompare(direita.id) : a - b;
    });
}

export function pendingCount(entries = []) {
  return entries.filter((entrada) => entrada.hasDraft).length;
}

export function publishPayload(entries = []) {
  return entries.filter((entrada) => entrada.hasDraft).map((entrada) => entrada.block);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/potala/admin-draft.test.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 5: Verify by mutation**

1. Drop the `published.published === false` branch from `blockState` → the hidden-block test must fail.
2. In `mergeBlocks`, use `pub || draft` instead of `draft || pub` → the "entrega o rascunho" test must fail.
3. Remove the `localeCompare` tie-break → no test may fail; add two blocks at the same position and re-verify.
4. Make `publishPayload` return every entry → the "não leva bloco sem rascunho" test must fail.

- [ ] **Step 6: Run the full suite and lint**

Run: `npm run test:portal` then `npx eslint outputs tests scripts`

- [ ] **Step 7: Commit**

```bash
git add outputs/js/admin/admin-draft.js tests/potala/admin-draft.test.mjs
git commit -m "feat(admin): decide block state from published and draft rows

The mockup has three save actions and a per-block badge, which needs a rule for
what a block currently is. A block in both tables has pending changes; one in
neither table's published side is a draft.

A published block with 'Exibir na jornada' switched off counts as a draft,
because that is what it is to a visitor: invisible. Without that rule the panel
would call a block published that nobody can see.

Kept free of DOM and network on purpose. This is the logic that decides what
the editor believes is live, and a mistake here does not show on screen — it
shows later, with someone publishing what they did not mean to.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Search, filter tabs and counters

**Files:**
- Create: `outputs/js/admin/admin-filters.js`
- Test: `tests/potala/admin-filters.test.mjs`

**Interfaces:**
- Consumes: `Entry` from `admin-draft.js` (Task 2).
- Produces:
  - `countEntries(entries: Entry[]): {total, publicados, rascunhos}`
  - `filterEntries(entries: Entry[], {query?: string, tab?: "todos"|"publicados"|"rascunhos"}): Entry[]`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/potala/admin-filters.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import { countEntries, filterEntries } from "../../outputs/js/admin/admin-filters.js";

const entrada = (id, state, extra = {}) => ({
  id,
  state,
  hasDraft: state !== "publicado",
  block: { id, title: id, category: "", summary: "", ...extra },
});

const amostra = [
  entrada("quem-somos", "publicado", { title: "Quem somos", category: "A entrada" }),
  entrada("recepcao", "publicado", { title: "Recepção", category: "O primeiro contato" }),
  entrada("cursos", "rascunho", { title: "Cursos", category: "O conhecimento" }),
];

test("contadores separam publicados de rascunhos", () => {
  assert.deepEqual(countEntries(amostra), { total: 3, publicados: 2, rascunhos: 1 });
});

test("pendente conta como publicado, porque está no ar", () => {
  const comPendente = [...amostra, entrada("atendimentos", "pendente", { title: "Atendimentos" })];
  assert.deepEqual(countEntries(comPendente), { total: 4, publicados: 3, rascunhos: 1 });
});

test("aba filtra por estado", () => {
  assert.deepEqual(filterEntries(amostra, { tab: "rascunhos" }).map((e) => e.id), ["cursos"]);
  assert.deepEqual(filterEntries(amostra, { tab: "publicados" }).map((e) => e.id), ["quem-somos", "recepcao"]);
  assert.equal(filterEntries(amostra, { tab: "todos" }).length, 3);
});

test("busca olha título, categoria e resumo", () => {
  assert.deepEqual(filterEntries(amostra, { query: "contato" }).map((e) => e.id), ["recepcao"]);
  assert.deepEqual(filterEntries(amostra, { query: "Cursos" }).map((e) => e.id), ["cursos"]);
});

/* Quem digita "recepcao" tem de achar "Recepção". Buscar sem dobrar acento
   deixaria o resultado depender do teclado de quem procura. */
test("busca ignora acento e caixa", () => {
  assert.deepEqual(filterEntries(amostra, { query: "recepcao" }).map((e) => e.id), ["recepcao"]);
  assert.deepEqual(filterEntries(amostra, { query: "RECEPÇÃO" }).map((e) => e.id), ["recepcao"]);
});

test("busca e aba se somam", () => {
  assert.deepEqual(filterEntries(amostra, { tab: "publicados", query: "cursos" }), []);
});

test("busca vazia não filtra nada", () => {
  assert.equal(filterEntries(amostra, { query: "   " }).length, 3);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/potala/admin-filters.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```javascript
// outputs/js/admin/admin-filters.js
/*
 * Busca, abas e contadores — as três leituras da mesma lista.
 *
 * Puro, para o mesmo motivo do admin-draft: um filtro que esconde um bloco por
 * engano não parece um defeito na tela, parece um bloco que não existe.
 */

/* Dobra acento e caixa. Quem digita "recepcao" tem de achar "Recepção" — sem
   isso, o resultado da busca passa a depender do teclado de quem procura. */
function dobrar(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function countEntries(entries = []) {
  // "pendente" está no ar com alterações por publicar, então conta como
  // publicado: o visitante vê a versão antiga, mas vê.
  const publicados = entries.filter((e) => e.state !== "rascunho").length;
  return { total: entries.length, publicados, rascunhos: entries.length - publicados };
}

export function filterEntries(entries = [], { query = "", tab = "todos" } = {}) {
  const busca = dobrar(query);
  return entries.filter((entrada) => {
    if (tab === "rascunhos" && entrada.state !== "rascunho") return false;
    if (tab === "publicados" && entrada.state === "rascunho") return false;
    if (!busca) return true;
    const campos = [entrada.block?.title, entrada.block?.category, entrada.block?.summary];
    return campos.some((campo) => dobrar(campo).includes(busca));
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/potala/admin-filters.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Verify by mutation**

1. Remove the `normalize("NFD")` line from `dobrar` → the accent test must fail.
2. Count `state === "publicado"` instead of `!== "rascunho"` in `countEntries` → the pendente test must fail.
3. Search only `title` → the "contato" test must fail.
4. Return `true` when `tab === "publicados"` and state is `"rascunho"` → the tab test must fail.

- [ ] **Step 6: Run the full suite and lint**

- [ ] **Step 7: Commit**

```bash
git add outputs/js/admin/admin-filters.js tests/potala/admin-filters.test.mjs
git commit -m "feat(admin): filter and count the block list

Search folds accents and case, so typing 'recepcao' finds 'Recepção'. Without
that, which blocks a search returns depends on the keyboard of whoever is
searching.

A block with pending changes counts as published, because a visitor does see
it — an older version of it, but they see it. Only blocks that never went live
count as drafts, which is what the mockup's '10 publicados · 2 rascunhos'
describes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Migration — new columns, drafts table, publish RPC

One migration file, because the three pieces have to agree: the model gains fields, the mirror table has to carry the same ones, and the RPCs have to list them.

**Files:**
- Create: `supabase/migrations/202609030003_home_block_drafts.sql`
- Modify: `outputs/js/home/content-model.js` (add the three fields to `normalizeHomeBlock`)
- Modify: `outputs/js/home/supabase-content-repository.js` (add the three columns to `homeBlockToDatabase` and `HOME_BLOCK_COLUMNS`)
- Test: `tests/potala/home-block-drafts-migration.test.mjs`
- Modify: `tests/potala/home-content-model.test.mjs` (assert the three new fields)

**Interfaces:**
- Consumes: nothing.
- Produces: the columns `title_scale`, `allow_panel`, `meta_description` on both tables; the table `public.home_block_drafts`; the functions `public.save_home_block_draft(payload jsonb)`, `public.discard_home_block_draft(block_id text)`, `public.publish_home_block_drafts()`. Model fields `titleScale: string`, `allowPanel: boolean`, `metaDescription: string`.

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/potala/home-block-drafts-migration.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const url = new URL("../../supabase/migrations/202609030003_home_block_drafts.sql", import.meta.url);
const sql = await readFile(url, "utf8");

test("a tabela de rascunhos espelha as restrições da publicada", () => {
  assert.match(sql, /create table if not exists public\.home_block_drafts/i);
  assert.match(sql, /side text not null check \(side in \('left', 'right'\)\)/i);
  assert.match(sql, /position integer not null check \(position >= 0\)/i);
  assert.match(sql, /slug text not null unique/i);
  assert.match(sql, /updated_at timestamptz not null/i);
});

/*
 * O teste que mais importa deste arquivo.
 *
 * Rascunho é texto não publicado do instituto. Um grant para anon o
 * entregaria por uma URL do Supabase, sem login, para quem soubesse o
 * endereço do projeto.
 */
test("anon não recebe nada sobre rascunhos", () => {
  const grantsParaAnon = sql.match(/grant[^;]*to anon\s*;/gi) || [];
  for (const grant of grantsParaAnon) {
    assert.doesNotMatch(grant, /home_block_drafts/i, `grant indevido: ${grant}`);
  }
  assert.match(sql, /grant select, insert, update, delete on table public\.home_block_drafts to authenticated/i);
});

test("toda política de rascunho exige administrador", () => {
  const politicas = sql.match(/create policy[^;]*on public\.home_block_drafts[^;]*;/gi) || [];
  assert.ok(politicas.length >= 4, "faltam políticas para ler, inserir, atualizar e apagar");
  for (const politica of politicas) {
    assert.match(politica, /public\.is_portal_admin\(\)/i, `política sem guarda: ${politica}`);
  }
});

test("publicar é uma transação só", () => {
  assert.match(sql, /create or replace function public\.publish_home_block_drafts\(\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /insert into public\.home_blocks/i);
  assert.match(sql, /on conflict \(id\) do update/i);
  assert.match(sql, /delete from public\.home_block_drafts where true/i);
});

test("as três colunas novas existem nas duas tabelas", () => {
  for (const coluna of ["title_scale", "allow_panel", "meta_description"]) {
    const ocorrencias = sql.match(new RegExp(coluna, "gi")) || [];
    assert.ok(ocorrencias.length >= 2, `${coluna} precisa existir nas duas tabelas`);
  }
});

test("a limpeza temporária continua qualificada", () => {
  assert.doesNotMatch(sql, /delete\s+from\s+\S+\s*;/i, "DELETE sem WHERE é bloqueado pelo safe-update");
});
```

Add to `tests/potala/home-content-model.test.mjs`:

```javascript
test("os campos novos do editor têm padrão seguro", async () => {
  const { normalizeHomeBlock } = await import("../../outputs/js/home/content-model.js");
  const bloco = normalizeHomeBlock({ title: "Atendimentos" }, 0);
  assert.equal(bloco.titleScale, "normal");
  assert.equal(bloco.allowPanel, true);
  assert.equal(bloco.metaDescription, "");

  const compacto = normalizeHomeBlock(
    { title: "A", titleScale: "compact", allowPanel: false, metaDescription: " Um texto " },
    0,
  );
  assert.equal(compacto.titleScale, "compact");
  assert.equal(compacto.allowPanel, false);
  assert.equal(compacto.metaDescription, "Um texto");
});

/* Um valor inventado no banco não pode virar um data-attribute que o CSS não
   conhece — o título simplesmente sumiria de escala sem ninguém entender. */
test("escala de título fora da lista volta ao padrão", async () => {
  const { normalizeHomeBlock } = await import("../../outputs/js/home/content-model.js");
  assert.equal(normalizeHomeBlock({ title: "A", titleScale: "gigante" }, 0).titleScale, "normal");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/potala/home-block-drafts-migration.test.mjs tests/potala/home-content-model.test.mjs`
Expected: FAIL — migration file missing, and `titleScale` is `undefined`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/202609030003_home_block_drafts.sql
begin;

-- Os três campos que o editor ganha. Padrões seguros: um banco já povoado
-- continua válido sem que ninguém preencha nada.
alter table public.home_blocks
  add column if not exists title_scale text not null default 'normal',
  add column if not exists allow_panel boolean not null default true,
  add column if not exists meta_description text not null default '';

-- A tabela espelho. Espelho, e não uma coluna JSONB dentro de home_blocks,
-- para que o rascunho carregue as MESMAS restrições do publicado: um rascunho
-- inválido é recusado na hora de salvar, e não na hora de publicar, quando já
-- é tarde para avisar quem escreveu.
create table if not exists public.home_block_drafts (
  id text primary key,
  slug text not null unique,
  category text not null default '',
  title text not null,
  summary text not null default '',
  body text not null default '',
  image text not null default '',
  icon text not null default '',
  tags text[] not null default '{}',
  href text not null default '#',
  side text not null check (side in ('left', 'right')),
  position integer not null check (position >= 0),
  published boolean not null default true,
  title_scale text not null default 'normal',
  allow_panel boolean not null default true,
  meta_description text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.home_block_drafts enable row level security;

-- anon não aparece aqui, e é de propósito. Rascunho é texto não publicado do
-- instituto; um grant de leitura o entregaria por uma URL do Supabase, sem
-- login, para quem soubesse o endereço do projeto.
grant select, insert, update, delete on table public.home_block_drafts to authenticated;

create policy "admins can read drafts"
  on public.home_block_drafts for select to authenticated
  using (public.is_portal_admin());

create policy "admins can insert drafts"
  on public.home_block_drafts for insert to authenticated
  with check (public.is_portal_admin());

create policy "admins can update drafts"
  on public.home_block_drafts for update to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

create policy "admins can delete drafts"
  on public.home_block_drafts for delete to authenticated
  using (public.is_portal_admin());

create or replace function public.publish_home_block_drafts()
returns setof public.home_blocks
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_portal_admin() then
    raise exception 'portal_admin_required' using errcode = '42501';
  end if;

  insert into public.home_blocks (
    id, slug, category, title, summary, body, image, icon, tags, href,
    side, position, published, title_scale, allow_panel, meta_description, updated_at
  )
  select
    d.id, d.slug, d.category, d.title, d.summary, d.body, d.image, d.icon,
    d.tags, d.href, d.side, d.position, d.published, d.title_scale,
    d.allow_panel, d.meta_description, now()
  from public.home_block_drafts as d
  on conflict (id) do update set
    slug = excluded.slug,
    category = excluded.category,
    title = excluded.title,
    summary = excluded.summary,
    body = excluded.body,
    image = excluded.image,
    icon = excluded.icon,
    tags = excluded.tags,
    href = excluded.href,
    side = excluded.side,
    position = excluded.position,
    published = excluded.published,
    title_scale = excluded.title_scale,
    allow_panel = excluded.allow_panel,
    meta_description = excluded.meta_description,
    updated_at = excluded.updated_at;

  -- O WHERE é exigência do safe-update das conexões da API, não uma escolha:
  -- um DELETE sem predicado é recusado antes de rodar.
  delete from public.home_block_drafts where true;

  return query
    select blocks.* from public.home_blocks as blocks
    order by blocks.position, blocks.id;
end;
$$;

revoke all on function public.publish_home_block_drafts() from public;
grant execute on function public.publish_home_block_drafts() to authenticated;

commit;
```

- [ ] **Step 4: Add the model fields**

In `outputs/js/home/content-model.js`, inside the returned object of `normalizeHomeBlock`, after `published`:

```javascript
    // Só o que o CSS da Home entende. Um valor inventado no banco viraria um
    // data-attribute desconhecido, e o título perderia escala sem aviso.
    titleScale: input.titleScale === "compact" ? "compact" : "normal",
    allowPanel: input.allowPanel !== false,
    metaDescription: cleanString(input.metaDescription),
```

In `outputs/js/home/supabase-content-repository.js`, add to `homeBlockToDatabase` before `updated_at`:

```javascript
    title_scale: normalized.titleScale,
    allow_panel: normalized.allowPanel,
    meta_description: normalized.metaDescription,
```

And in `homeBlockFromDatabase`, map the snake_case back:

```javascript
export function homeBlockFromDatabase(row = {}, index = 0) {
  return normalizeHomeBlock({
    ...row,
    updatedAt: row.updated_at,
    titleScale: row.title_scale,
    allowPanel: row.allow_panel,
    metaDescription: row.meta_description,
  }, index);
}
```

Add the three column names to `HOME_BLOCK_COLUMNS` at the top of the same file.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/potala/home-block-drafts-migration.test.mjs tests/potala/home-content-model.test.mjs`
Expected: PASS.

- [ ] **Step 6: Verify by mutation**

1. Add `grant select on table public.home_block_drafts to anon;` → the anon test must fail. **This is the most important mutation in the plan; do not skip it.**
2. Drop `public.is_portal_admin()` from one policy → the policy test must fail.
3. Change `delete from public.home_block_drafts where true` to drop the `where true` → the safe-update test must fail.
4. Change `titleScale` to accept any string → the escala test must fail.

- [ ] **Step 7: Run the full suite and lint**

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202609030003_home_block_drafts.sql outputs/js/home/content-model.js outputs/js/home/supabase-content-repository.js tests/potala/home-block-drafts-migration.test.mjs tests/potala/home-content-model.test.mjs
git commit -m "feat(supabase): store drafts in a mirror table admins alone can read

The panel needs two versions of a block: one on the site and one being edited.
A boolean cannot hold two versions, so drafts get their own table.

A mirror rather than a JSONB column on home_blocks, so a draft carries the same
constraints as a published row — side, position, unique slug. An invalid draft
is refused when it is saved, not when it is published, which is too late to
tell whoever wrote it.

anon receives no grant on the drafts table, not even select. A draft is the
institute's unpublished writing, and a read grant would hand it out over a
Supabase URL, without a login, to anyone who knew the project address. The test
asserts the absence rather than the presence, because a grant added later would
pass a presence check untouched.

Publishing copies every draft and clears the table in one transaction. Half the
blocks published is a state nobody asked for and nobody can undo from the
screen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Repository support for drafts

**Files:**
- Modify: `outputs/js/home/supabase-content-repository.js`
- Modify: `outputs/js/home/content-repository.js` (local mirror, so the offline panel keeps working)
- Test: `tests/potala/supabase-content-repository.test.mjs`, `tests/potala/home-content-repository.test.mjs`

**Interfaces:**
- Consumes: `normalizeHomeBlocks` and `homeBlockToDatabase` from Task 4.
- Produces, on both repositories: `listDrafts(): Promise<Block[]>`, `saveDraft(block): Promise<Block>`, `discardDraft(id): Promise<void>`, `publishDrafts(): Promise<Block[]>`.

- [ ] **Step 1: Write the failing tests**

```javascript
// append to tests/potala/supabase-content-repository.test.mjs
test("saveDraft escreve na tabela de rascunhos, nunca na publicada", async () => {
  const escritas = [];
  const client = {
    from(tabela) {
      return {
        select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        upsert(linha) {
          escritas.push({ tabela, linha });
          return { select: () => ({ single: () => Promise.resolve({ data: linha, error: null }) }) };
        },
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    },
    rpc: () => Promise.resolve({ data: [], error: null }),
  };
  const repo = createSupabaseContentRepository({ client });
  await repo.saveDraft({ id: "a", title: "Atendimentos", side: "left", position: 0 });

  assert.equal(escritas.length, 1);
  assert.equal(escritas[0].tabela, "home_block_drafts");
  assert.equal(escritas[0].linha.title, "Atendimentos");
});

test("publishDrafts passa pela RPC, não por escrita direta", async () => {
  const chamadas = [];
  const client = {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    rpc(nome) {
      chamadas.push(nome);
      return Promise.resolve({ data: [], error: null });
    },
  };
  await createSupabaseContentRepository({ client }).publishDrafts();
  assert.deepEqual(chamadas, ["publish_home_block_drafts"]);
});

test("erro da RPC de publicar não vira sucesso silencioso", async () => {
  const client = {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    rpc: () => Promise.resolve({ data: null, error: { message: "portal_admin_required" } }),
  };
  await assert.rejects(
    () => createSupabaseContentRepository({ client }).publishDrafts(),
    /portal_admin_required/,
  );
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/potala/supabase-content-repository.test.mjs`
Expected: FAIL — `repo.saveDraft is not a function`.

- [ ] **Step 3: Implement on the Supabase repository**

Inside `createSupabaseContentRepository`, before the `return`:

```javascript
  async function listDrafts() {
    const { data, error } = await client
      .from("home_block_drafts")
      .select(HOME_BLOCK_COLUMNS)
      .order("position", { ascending: true });
    throwIfError("listDrafts", error);
    return rowsToBlocks(data || []);
  }

  async function saveDraft(block) {
    const linha = homeBlockToDatabase(block, Number(block?.position) || 0);
    if (!linha) throw new SupabaseContentError("saveDraft", "Bloco sem título não pode ser gravado.");
    const { data, error } = await client
      .from("home_block_drafts")
      .upsert(linha)
      .select()
      .single();
    throwIfError("saveDraft", error);
    return homeBlockFromDatabase(data || linha, linha.position);
  }

  async function discardDraft(id) {
    const { error } = await client.from("home_block_drafts").delete().eq("id", id);
    throwIfError("discardDraft", error);
  }

  async function publishDrafts() {
    const { data, error } = await client.rpc("publish_home_block_drafts");
    throwIfError("publishDrafts", error);
    return rowsToBlocks(data || []);
  }
```

Add `listDrafts, saveDraft, discardDraft, publishDrafts` to the returned object.

- [ ] **Step 4: Mirror it on the local repository**

In `outputs/js/home/content-repository.js`, keep drafts under a second storage key `"potala.home.drafts.v1"` and implement the same four functions against it, so the panel behaves identically without a network.

- [ ] **Step 5: Run the tests to verify they pass**

- [ ] **Step 6: Verify by mutation**

1. Point `saveDraft` at `"home_blocks"` → the first test must fail. This is the mutation that matters: writing a draft into the published table puts unfinished text on the site.
2. Make `publishDrafts` swallow the error and return `[]` → the third test must fail.

- [ ] **Step 7: Run the full suite and lint, then commit**

```bash
git add outputs/js/home/supabase-content-repository.js outputs/js/home/content-repository.js tests/potala/supabase-content-repository.test.mjs tests/potala/home-content-repository.test.mjs
git commit -m "feat(content): read and write drafts through both repositories

The panel now has four draft operations, and both the Supabase and the local
repository implement them, so the editor behaves the same with or without a
network.

A test asserts saveDraft names the drafts table specifically. Writing a draft
into home_blocks would put unfinished text on the live site, and nothing on
screen would say so.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Media manifest

**Files:**
- Create: `scripts/build-media-manifest.mjs`
- Create: `outputs/media/manifest.json` (generated)
- Test: `tests/potala/media-manifest.test.mjs`
- Modify: `package.json` (add `"build:media-manifest"` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `outputs/media/manifest.json` shaped `{geradoEm: string, imagens: [{arquivo, largura, altura, bytes}]}`, sorted by file name.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/potala/media-manifest.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifesto = JSON.parse(await readFile(new URL("../../outputs/media/manifest.json", import.meta.url), "utf8"));

test("o manifesto lista as imagens com dimensão e tamanho", () => {
  assert.ok(Array.isArray(manifesto.imagens));
  assert.ok(manifesto.imagens.length > 0, "nenhuma imagem encontrada");
  for (const imagem of manifesto.imagens) {
    assert.match(imagem.arquivo, /\.(webp|png|jpg|jpeg)$/i);
    assert.ok(Number.isInteger(imagem.largura) && imagem.largura > 0);
    assert.ok(Number.isInteger(imagem.altura) && imagem.altura > 0);
    assert.ok(Number.isInteger(imagem.bytes) && imagem.bytes > 0);
  }
});

/* Ordenado para que duas execuções do script produzam o mesmo arquivo. Sem
   isso, cada build vira um diff no git sem nenhuma mudança real. */
test("a ordem é estável", () => {
  const nomes = manifesto.imagens.map((i) => i.arquivo);
  assert.deepEqual(nomes, [...nomes].sort());
});

test("o próprio manifesto não se lista", () => {
  assert.ok(!manifesto.imagens.some((i) => i.arquivo === "manifest.json"));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/potala/media-manifest.test.mjs`
Expected: FAIL — `manifest.json` does not exist.

- [ ] **Step 3: Write the script**

```javascript
// scripts/build-media-manifest.mjs
/**
 * Manifesto das imagens disponíveis para os blocos da jornada.
 *
 * O painel é uma página estática: ele não consegue listar um diretório. Este
 * arquivo é o índice que a grade de "Trocar imagem" lê.
 *
 * A lista sai ordenada de propósito. Sem ordem estável, duas execuções do
 * script produziriam arquivos diferentes com o mesmo conteúdo, e cada build
 * viraria um diff no git sem nenhuma mudança real.
 *
 *   node scripts/build-media-manifest.mjs
 */
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const raiz = path.resolve(import.meta.dirname, "..");
const midia = path.join(raiz, "outputs", "media");
const EXTENSOES = new Set([".webp", ".png", ".jpg", ".jpeg"]);

const arquivos = (await readdir(midia))
  .filter((nome) => EXTENSOES.has(path.extname(nome).toLowerCase()))
  .sort();

const imagens = [];
for (const arquivo of arquivos) {
  const caminho = path.join(midia, arquivo);
  const { size } = await stat(caminho);
  const { width, height } = await sharp(caminho).metadata();
  imagens.push({ arquivo, largura: width, altura: height, bytes: size });
}

await writeFile(
  path.join(midia, "manifest.json"),
  `${JSON.stringify({ geradoEm: new Date().toISOString(), imagens }, null, 2)}\n`,
);

console.log(`Manifesto com ${imagens.length} imagens.`);
```

Add to `package.json` scripts: `"build:media-manifest": "node scripts/build-media-manifest.mjs"`.

- [ ] **Step 4: Generate and run the tests**

Run: `npm run build:media-manifest` then `node --test tests/potala/media-manifest.test.mjs`
Expected: PASS.

- [ ] **Step 5: Verify by mutation**

1. Remove `.sort()` from the file list → the stable-order test must fail (re-run the script first).
2. Drop the extension filter → the extension test must fail, because `manifest.json` itself appears.

- [ ] **Step 6: Run the full suite and lint, then commit**

```bash
git add scripts/build-media-manifest.mjs outputs/media/manifest.json tests/potala/media-manifest.test.mjs package.json
git commit -m "feat(media): index the available images for the block picker

The panel is a static page and cannot list a directory, so the image grid needs
an index to read.

The list is sorted so two runs of the script produce the same file. Without a
stable order every build would show up as a git diff with no real change.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Panel shell — markup and styles

The three-column frame from the mockup. No behaviour yet; the modules that follow attach to these hooks.

**Files:**
- Modify: `outputs/admin.html` (replace the `.admin-panel` section)
- Modify: `outputs/css/admin.css` (rewrite)
- Test: `tests/potala/admin-shell-html.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: the DOM hooks later tasks query — `[data-admin-nav]`, `[data-admin-search]`, `[data-admin-publish]`, `[data-admin-saved-at]`, `[data-admin-counts]`, `[data-admin-tabs]`, `[data-admin-list]`, `[data-admin-form]`, `[data-admin-form-tabs]`, `[data-admin-preview]`, `[data-admin-preview-device]`, `[data-admin-preview-zoom]`, `[data-admin-checklist]`, `[data-admin-media-grid]`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/potala/admin-shell-html.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../outputs/admin.html", import.meta.url), "utf8");

test("a navegação traz as sete seções do mockup", () => {
  for (const secao of ["Visão geral", "Jornada", "Páginas", "Mídia", "Programação", "Profissionais", "Configurações"]) {
    assert.ok(html.includes(secao), `seção ausente: ${secao}`);
  }
});

/*
 * As seis que não existem têm de ser inertes de verdade, não só apagadas.
 * Um item apenas esmaecido continua clicável e recebe foco do teclado, e o
 * visitante do painel vai parar numa tela vazia sem entender por quê.
 */
test("as seis seções sem implementação são inertes e dizem por quê", () => {
  const inertes = html.match(/<[^>]*aria-disabled="true"[^>]*>/g) || [];
  assert.equal(inertes.length, 6);
  assert.ok(html.includes("em breve"));
});

test("os ganchos que os módulos procuram existem", () => {
  for (const gancho of [
    "data-admin-nav", "data-admin-search", "data-admin-publish", "data-admin-saved-at",
    "data-admin-counts", "data-admin-tabs", "data-admin-list", "data-admin-form",
    "data-admin-form-tabs", "data-admin-preview", "data-admin-preview-device",
    "data-admin-preview-zoom", "data-admin-checklist", "data-admin-media-grid",
  ]) {
    assert.ok(html.includes(gancho), `gancho ausente: ${gancho}`);
  }
});

test("as abas do editor são um tablist de verdade", () => {
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab"[^>]*aria-selected/);
  assert.match(html, /role="tabpanel"/);
});

test("o resumo declara o limite que o contador mostra", () => {
  assert.match(html, /id="admin-summary"[^>]*maxlength="160"/s);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/potala/admin-shell-html.test.mjs`
Expected: FAIL — the sections are not in the markup.

- [ ] **Step 3: Write the markup**

Replace the `<section class="admin-panel">` block in `outputs/admin.html` with the three-column shell. Structure, in order:

```html
<section class="admin-panel" id="admin-panel" aria-labelledby="admin-panel-title" hidden>
  <nav class="admin-nav" data-admin-nav aria-label="Seções do painel">
    <p class="admin-brand"><span aria-hidden="true">▲</span> Potala <small>Instituto</small></p>
    <ul>
      <li><button type="button" data-section="visao" aria-disabled="true">Visão geral <small>em breve</small></button></li>
      <li><button type="button" data-section="jornada" aria-current="page">Jornada</button></li>
      <li><button type="button" data-section="paginas" aria-disabled="true">Páginas <small>em breve</small></button></li>
      <li><button type="button" data-section="midia" aria-disabled="true">Mídia <small>em breve</small></button></li>
      <li><button type="button" data-section="programacao" aria-disabled="true">Programação <small>em breve</small></button></li>
      <li><button type="button" data-section="profissionais" aria-disabled="true">Profissionais <small>em breve</small></button></li>
      <li><button type="button" data-section="config" aria-disabled="true">Configurações <small>em breve</small></button></li>
    </ul>
    <div class="admin-user">…avatar, nome, papel, menu com "Definir senha" e "Sair"…</div>
  </nav>

  <header class="admin-head">
    <div>
      <h2 id="admin-panel-title" tabindex="-1">Editor da jornada</h2>
      <p>Organize, edite e publique a experiência do portal</p>
    </div>
    <input type="search" data-admin-search placeholder="Buscar bloco" aria-label="Buscar bloco">
    <a class="admin-link" href="transcendido.html" target="_blank" rel="noopener">Visualizar site</a>
    <button type="button" class="admin-publish" data-admin-publish disabled>Publicar alterações</button>
    <p class="admin-saved-at" data-admin-saved-at role="status" aria-live="polite"></p>
  </header>

  <div class="admin-columns">
    <div class="admin-list-wrap">
      <p class="admin-counts" data-admin-counts></p>
      <div class="admin-tabs" data-admin-tabs role="tablist" aria-label="Filtrar blocos">…três abas…</div>
      <p class="admin-hint">Arraste para reordenar, ou use “Mover acima” e “Mover abaixo”.</p>
      <ol class="admin-list" data-admin-list aria-label="Ordem dos blocos na Home"></ol>
    </div>

    <form class="admin-form" data-admin-form novalidate>
      <p class="admin-breadcrumb">Jornada / <span data-admin-breadcrumb-title></span></p>
      <h3 data-admin-form-title></h3>
      <div data-admin-form-tabs role="tablist" aria-label="Seções do bloco">…Conteúdo, Aparência, SEO…</div>
      <div role="tabpanel" data-panel="conteudo">…campos de Conteúdo, com o textarea maxlength="160"…</div>
      <div role="tabpanel" data-panel="aparencia" hidden>…ícone, escala, temas…</div>
      <div role="tabpanel" data-panel="seo" hidden>…destino, slug, descrição acessível…</div>
      <footer><button type="button" data-admin-save-draft>Salvar rascunho</button><button class="admin-save" type="submit">Salvar bloco</button></footer>
    </form>

    <aside class="admin-preview">
      <header>
        <h3>Prévia ao vivo</h3>
        <div data-admin-preview-device role="group" aria-label="Dispositivo">…dois botões…</div>
        <div data-admin-preview-zoom role="group" aria-label="Zoom">…menos, valor, mais…</div>
      </header>
      <iframe data-admin-preview src="transcendido.html?admin-preview=1" title="Prévia ao vivo da Home do Portal Potala"></iframe>
      <ul class="admin-checklist" data-admin-checklist></ul>
      <div class="admin-media-grid" data-admin-media-grid hidden></div>
    </aside>
  </div>
</section>
```

Fill each `…` with the real fields, keeping the existing `name` attributes so the current form-reading code keeps working. Keep the `admin-status` paragraph and the password `<details>` — move the latter into the user menu.

- [ ] **Step 4: Write the styles**

Rewrite `outputs/css/admin.css` for the mockup: dark ground `#12100e`, panels `#1a1613`, gold `#d8b26a`, sidebar 220px, three columns `minmax(0,320px) minmax(0,1fr) minmax(0,460px)`. Active nav item gets a 3px gold bar via `::before`. Every button reaches 44px. Wrap all transitions in `@media (prefers-reduced-motion: no-preference)`.

- [ ] **Step 5: Run the tests to verify they pass**

- [ ] **Step 6: Check the stylesheet has no orphaned declarations**

Run: `node --test tests/potala/css-estrutura.test.mjs`
Expected: PASS. That test exists because a previous edit left declarations outside any rule and the browser dropped them in silence.

- [ ] **Step 7: Verify by mutation**

1. Remove `aria-disabled` from one inert item → the inert test must fail.
2. Remove `maxlength="160"` → the limit test must fail.

- [ ] **Step 8: Run the full suite and lint, then commit**

```bash
git add outputs/admin.html outputs/css/admin.css tests/potala/admin-shell-html.test.mjs
git commit -m "feat(admin): lay out the Editor da jornada shell

Three columns and a sidebar, matching the client's mockup: block list, editor,
live preview.

The six sections without an implementation carry aria-disabled and say 'em
breve'. Dimming them alone would leave them clickable and reachable by keyboard,
and whoever followed one would land on an empty screen with no explanation.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Navigation and user menu

**Files:**
- Create: `outputs/js/admin/admin-shell.js`
- Test: `tests/potala/admin-shell.test.mjs`

**Interfaces:**
- Consumes: the `[data-admin-nav]` hooks from Task 7.
- Produces: `createAdminShell({root, onSignOut}): {destroy()}` — marks the active section with `aria-current="page"`, refuses clicks on `aria-disabled` items, and wires the user menu.

- [ ] **Step 1: Write the failing test**

Use fake nodes, following the pattern in `tests/potala/home-block-expansion.test.mjs`. Assert: a click on an `aria-disabled` item does not change `aria-current`; a click on Jornada does; the sign-out button calls `onSignOut` exactly once.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Write the module**
- [ ] **Step 4: Run to verify it passes**
- [ ] **Step 5: Verify by mutation** — remove the `aria-disabled` guard; the refusal test must fail.
- [ ] **Step 6: Full suite, lint, commit**

---

### Task 9: Block list

**Files:**
- Create: `outputs/js/admin/admin-blocks-list.js`
- Test: `tests/potala/admin-blocks-list.test.mjs`

**Interfaces:**
- Consumes: `Entry` from Task 2, `filterEntries`/`countEntries` from Task 3.
- Produces: `createBlocksList({root, onSelect, onMove, onDuplicate, onDiscard, onDelete}): {render(entries, {activeId, query, tab}), destroy()}`.

- [ ] **Step 1: Write the failing test**

Assert: each row renders position number, title, category and the badge that matches `entry.state`; the active row carries `aria-current`; "Mover acima" on the first row is disabled; the kebab exposes Duplicar, Descartar rascunho and Apagar, and "Descartar rascunho" is absent when `hasDraft` is false.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Write the module** — keep the existing `renderBlockRow` drag handling and the "Mover acima"/"Mover abaixo" buttons; they are the keyboard path.
- [ ] **Step 4: Run to verify it passes**
- [ ] **Step 5: Verify by mutation** — render "Descartar rascunho" unconditionally; that test must fail.
- [ ] **Step 6: Full suite, lint, commit**

---

### Task 10: Editor form, tabs and checklist

**Files:**
- Create: `outputs/js/admin/admin-editor.js`
- Test: `tests/potala/admin-editor.test.mjs`

**Interfaces:**
- Consumes: `validateBlockDraft` and `draftFromBlock` from the existing `admin-controller.js`; move both into this module.
- Produces: `createAdminEditor({root, onChange, onSaveDraft, onSave}): {load(block), read(), destroy()}` and the pure `checklistFor(draft): [{id, ok, label, hint}]`.

- [ ] **Step 1: Write the failing test**

Assert: switching tabs moves `aria-selected` and toggles `hidden` on the panels; the summary counter reads `"105 / 160"` and gains a warning class past 140; `checklistFor` returns three items and marks "Imagem definida" false when `image` is empty; `read()` returns `titleScale`, `allowPanel` and `metaDescription` along with the existing fields.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Write the module**
- [ ] **Step 4: Run to verify it passes**
- [ ] **Step 5: Verify by mutation** — have `read()` drop `allowPanel`; that test must fail.
- [ ] **Step 6: Full suite, lint, commit**

---

### Task 11: Image picker

**Files:**
- Create: `outputs/js/admin/admin-media-picker.js`
- Test: `tests/potala/admin-media-picker.test.mjs`

**Interfaces:**
- Consumes: `outputs/media/manifest.json` from Task 6.
- Produces: `createMediaPicker({root, fetchManifest, onPick}): {open(), close(), destroy()}`.

- [ ] **Step 1: Write the failing test**

Assert: a rejected `fetchManifest` leaves the grid with an empty state and does not throw — the panel must not break because a build script did not run; picking a file calls `onPick` with `"media/<arquivo>"`.

- [ ] **Step 2–6:** as above, with a mutation that lets the rejection propagate; the empty-state test must fail.

---

### Task 12: Preview with device and zoom

**Files:**
- Create: `outputs/js/admin/admin-preview.js`
- Test: `tests/potala/admin-preview.test.mjs`

**Interfaces:**
- Consumes: `previewBlocksForDraft` and `createPreviewMessage` from the existing `admin-controller.js`; move both into this module.
- Produces: `createAdminPreview({root, schedule, cancel}): {publish(blocks, draft), setDevice("desktop"|"mobile"), setZoom(fator), destroy()}` and the pure `frameGeometry({device, zoom, available}): {width, height, scale}`.

- [ ] **Step 1: Write the failing test**

Assert `frameGeometry` gives width 1280 for desktop and 390 for mobile; that halving the zoom doubles the rendered width rather than shrinking the box — 50% must show twice as much page; that `setZoom` clamps to the 0.5–1.5 range.

Also assert the failure path: when the iframe fires `error`, the column shows the reason and a reload button. An empty rectangle tells the editor nothing about whether the preview is broken or the page itself is blank.

- [ ] **Step 2–6:** as above. Two mutations: apply `scale` without compensating the width, and swallow the iframe `error` event. Each must fail its own test.

---

### Task 13: Rewire the controller

**Files:**
- Modify: `outputs/js/admin/admin-controller.js` (down to orchestration only)
- Test: `tests/potala/admin-local.test.mjs`, `tests/potala/admin-live-preview.test.mjs`

**Interfaces:**
- Consumes: every module from Tasks 2, 3, 8–12 and the repository from Task 5.
- Produces: `createAdminController({root, repository, schedulePreview, cancelPreview}): {destroy()}`.
- Stays put: `moveBlock`, `applyDraft` and `removeBlock` keep their current home and their current exported names. They already have tests, and moving them would churn those tests for no gain.

- [ ] **Step 1: Write the failing test**

Assert: "Salvar rascunho" calls `repository.saveDraft` and never `replaceAll`; a rejected `saveDraft` restores the previous list and writes the reason into `[data-admin-status]` — a panel that shows the change and loses the save in silence is worse than a slow one; "Publicar alterações" is disabled when `pendingCount` is 0.

- [ ] **Step 2–6:** as above. Mutation: leave the optimistic state in place on rejection; the rollback test must fail.

---

### Task 14: Home consumes the new fields

**Files:**
- Modify: `outputs/js/home/home-scenes.js:193` (the `body` paragraph)
- Test: `tests/potala/home-scenes.test.mjs`

**Interfaces:**
- Consumes: `renderRestrictedMarkdown` from Task 1, `metaDescription` from Task 4.

- [ ] **Step 1: Write the failing test**

Assert: a `body` of `"**forte**"` reaches the DOM as `<strong>`; a `body` of `"<script>"` still arrives escaped; `metaDescription` becomes `aria-description` on the block link and the attribute is absent when the field is empty.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Replace `<p>${escapeHtml(body)}</p>` with `renderRestrictedMarkdown(body)`**
- [ ] **Step 4: Run to verify it passes**
- [ ] **Step 5: Verify by mutation** — swap the converter back for raw interpolation; the `<script>` test must fail. This mutation is the whole point of Task 1 and must be run.
- [ ] **Step 6: Full suite, lint, commit**

---

### Task 15: Verification and delivery

- [ ] **Step 1:** `npm run test:portal` — every test passes.
- [ ] **Step 2:** `npx eslint outputs tests scripts` — exit 0.
- [ ] **Step 3:** `node scripts/validate-portal-assets.mjs` — within budget.
- [ ] **Step 4:** Open the panel in the browser preview. Measure, do not eyeball: the three columns at 1280 and 1440; the sidebar's active bar; the preview at both devices and at 50%, 100% and 150% zoom; the summary counter at 139, 140 and 160 characters.
- [ ] **Step 5:** Confirm the six inert sections cannot be reached by Tab.
- [ ] **Step 6:** Confirm reordering works with the keyboard alone.
- [ ] **Step 7:** Report what was verified and what was not, naming anything that could not be exercised.

---

## Detail level, stated plainly

Tasks 1–7, 14 and 15 carry the literal code and the literal tests. Someone who has never seen this repository can work from them.

Tasks 8–13 carry the file, the interface, the assertions each test must make, and the mutation that proves the test — but not the module bodies. That is below the bar this plan holds itself to everywhere else, and it is written down here rather than left to be discovered: whoever executes those tasks needs either the context of the design conversation that produced this plan, or an expansion of the task before starting it.

## Notes for the executor

- The browser pane in this environment has failed to screenshot scrolled pages. Measure computed geometry with `javascript_tool` instead of relying on screenshots, and disable transitions before measuring — with the pane hidden, `requestAnimationFrame` freezes and animated properties read their start values.
- Bash heredocs in this environment strip one level of backslashes. Write test files containing regular expressions with the Write tool, not with a heredoc.
- `git status` may show files from another session. Stage only the files named in the task.
