# Potala Blog Editor Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar localmente o Blog “Caderno de Travessia”, páginas completas de artigo e um editor visual funcional protegido pelo mesmo login administrativo da Home.

**Architecture:** O conteúdo será normalizado por um modelo independente do DOM e persistido em um repositório `localStorage` com padrões empacotados. Blog, artigo e editor compartilharão esse modelo; a prévia receberá uma lista normalizada por `postMessage`, sem acessar o estado do formulário. O novo editor terá página própria para não acoplar seu ciclo ao editor da Home, mas reutilizará o mesmo cliente Supabase e `createAdminAuth()`.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Supabase Auth existente, `localStorage`, iframe + `postMessage`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-07-potala-blog-editor-frontend-design.md`

## Global Constraints

- Nenhuma tabela, migração ou gravação nova no Supabase nesta fase.
- Nenhum push ou publicação; execução somente no workspace local.
- Reutilizar a autenticação e a função de papel administrativo existentes.
- O administrador edita conteúdo; a estrutura e os lugares do layout permanecem fixos.
- HTML arbitrário nunca entra nos dados dos posts.
- Preservar teclado, foco visível, movimento reduzido e mobile.
- Não incluir mudanças pendentes e não relacionadas em commits.

---

### Task 1: Modelo editorial e repositório local

**Files:**
- Create: `outputs/js/blog/blog-model.js`
- Create: `outputs/js/blog/blog-repository.js`
- Modify: `outputs/js/blog/blog-data.js`
- Test: `tests/potala/blog-content-model.test.mjs`

**Interfaces:**
- Produces: `normalizePost(post, index)`, `normalizePosts(posts)`, `placeBlogPosts(posts)`, `createBlogRepository({ storage, defaults, key })`.
- `placeBlogPosts` returns `{ featured, grid, recent, categories }` using only `published` posts.

- [ ] **Step 1: Write failing tests** for normalization, unique featured placement, date ordering, draft exclusion and local persistence.
- [ ] **Step 2: Run** `node --test tests/potala/blog-content-model.test.mjs` and confirm missing-module failure.
- [ ] **Step 3: Implement** strict normalization for the six block types and a repository with `list`, `save`, `remove`, `reset`.
- [ ] **Step 4: Run the test** and confirm all cases pass.

### Task 2: Public Blog in the approved composition

**Files:**
- Modify: `outputs/blog.html`
- Modify: `outputs/css/blog.css`
- Modify: `outputs/js/blog/blog-controller.js`
- Test: `tests/potala/blog-secao.test.mjs`
- Test: `tests/potala/blog-layout-v2.test.mjs`

**Interfaces:**
- Consumes: `createBlogRepository()` and `placeBlogPosts()`.
- Produces: fixed hero, featured story, article grid, search, categories and recent list.
- Preview message: `{ type: "potala:blog-preview", posts, selectedSlug }`.

- [ ] **Step 1: Add failing structural and rendering tests** for the Caderno header, panorama, fixed placement, search and preview messages.
- [ ] **Step 2: Run focused tests** and verify failure against the current Blog.
- [ ] **Step 3: Replace the public composition** while preserving semantic headings and graceful empty states.
- [ ] **Step 4: Run focused tests** and confirm success.

### Task 3: Full article page and demonstration comments

**Files:**
- Create: `outputs/artigo.html`
- Create: `outputs/css/artigo.css`
- Create: `outputs/js/blog/article-renderer.js`
- Create: `outputs/js/blog/article-controller.js`
- Test: `tests/potala/blog-article.test.mjs`

**Interfaces:**
- Produces: `renderArticleBlock(block)`, `renderArticle(post)`, `findPostBySlug(posts, slug)`.
- Reads: `artigo.html?post=<slug>`.
- Accepts the same `potala:blog-preview` message in preview mode.

- [ ] **Step 1: Write failing tests** for all six block types, unknown slug, published visibility and safe escaping.
- [ ] **Step 2: Run focused tests** and confirm missing-page/module failure.
- [ ] **Step 3: Implement the article template**, related stories and per-article local demonstration comments.
- [ ] **Step 4: Run focused tests** and confirm success.

### Task 4: Protected Blog editor shell

**Files:**
- Create: `outputs/blog-admin.html`
- Create: `outputs/css/blog-admin.css`
- Create: `outputs/js/blog-admin/blog-admin-entry.js`
- Modify: `outputs/admin.html`
- Test: `tests/potala/blog-admin-shell.test.mjs`

**Interfaces:**
- Consumes: `getSupabaseClient()`, `createAdminAuth()` and `createBlogRepository()`.
- Produces: a three-column editor shell, shared authentication and links between the two editors.

- [ ] **Step 1: Write failing tests** for shared authentication imports, no public signup, editor navigation and responsive shell.
- [ ] **Step 2: Run focused tests** and confirm missing-page failure.
- [ ] **Step 3: Implement the shell** matching the approved visual hierarchy.
- [ ] **Step 4: Run focused tests** and confirm success.

### Task 5: Post operations, structured blocks and live preview

**Files:**
- Create: `outputs/js/blog-admin/blog-editor.js`
- Create: `outputs/js/blog-admin/blog-preview.js`
- Test: `tests/potala/blog-admin-editor.test.mjs`

**Interfaces:**
- Produces: `createBlogEditor({ root, repository, previewWindow })`, `postPreview(previewWindow, posts, selectedSlug, origin)`.
- Editor operations: create, select, update, delete, feature, publish/hide, add/update/remove/move content block.

- [ ] **Step 1: Write failing behavior tests** for create/delete, one featured post, six block types, reorder and same-origin preview payload.
- [ ] **Step 2: Run focused tests** and verify missing-module failure.
- [ ] **Step 3: Implement the smallest controller** that wires the fixed form, list, block editor and iframe.
- [ ] **Step 4: Run focused tests** and confirm success.

### Task 6: Integrated verification

**Files:**
- Modify only if a failing proof exposes a task-scoped defect.

**Interfaces:**
- No new interfaces.

- [ ] **Step 1: Run** `npm run test:portal`.
- [ ] **Step 2: Run** `npm run validate:portal`.
- [ ] **Step 3: Run focused ESLint** on all new and modified Blog modules.
- [ ] **Step 4: Check** `git diff --check` and HTTP 200 for Blog, article, editor and new assets.
- [ ] **Step 5: Inspect desktop and mobile previews locally; stop when the approved front-end acceptance conditions pass.**
