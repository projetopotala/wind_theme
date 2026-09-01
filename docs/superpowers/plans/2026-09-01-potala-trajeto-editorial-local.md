# Potala Trajeto Editorial Local Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar localmente a nova Chegada com `chegada.png`, a Home híbrida 2.5D com trajeto Three.js e blocos expansíveis, e um painel editorial local que alimenta a Home no próximo acesso.

**Architecture:** O portal continuará sendo servido a partir de `outputs/`. A Home separará conteúdo, renderização HTML, interação e cena Three.js por interfaces pequenas; um repositório assíncrono de conteúdo usará `localStorage` agora e aceitará um adaptador Supabase posteriormente. A Chegada manterá respiração, som e handoff por scroll, usando a nova imagem como placa visual principal. A estrada Canvas 2D e o redirecionamento final para o Palácio deixarão de participar da Home, mas seus arquivos históricos não serão apagados nesta entrega.

**Tech Stack:** HTML semântico, CSS, JavaScript ES Modules, Three.js instalado por npm e servido como módulo local, Canvas/WebGL, `localStorage`, Node Test Runner, Sharp e imagegen.

**Spec:** `docs/superpowers/specs/2026-09-01-potala-trajeto-editorial-admin-design.md`

## Global Constraints

- Trabalhar em uma branch local `codex/trajeto-editorial-local`; não fazer push.
- Não criar nem conectar projeto Supabase nesta entrega.
- Preservar `outputs/media/chegada.png` e os commits locais existentes.
- Preservar som, respiração 3-3-3 e entrada na Home por scroll.
- Usar scroll nativo; não implementar scroll hijacking ou inércia artificial.
- Manter texto e controles no DOM; Three.js é decorativo.
- Exibir apenas um bloco expandido por vez.
- Manter o trajeto livre de sobreposição por blocos.
- Não redirecionar para `palacio.html` ao fim da Home.
- Implementar fallback estático quando WebGL não estiver disponível.
- Respeitar `prefers-reduced-motion`, teclado, touch e bfcache.
- Usar `apply_patch` para alterações textuais; scripts de cópia, conversão e geração podem gravar seus artefatos derivados.

---

## File Structure

### Conteúdo e administração

- Create `outputs/js/home/content-model.js`: normalização, validação, ordenação e valores padrão do bloco.
- Create `outputs/js/home/content-repository.js`: contrato assíncrono e adaptador local.
- Modify `outputs/js/home/journey-data.js`: expor os nove blocos no modelo editorial aprovado.
- Create `outputs/js/home/block-expansion.js`: exclusividade de expansão e acessibilidade.
- Create `outputs/admin.html`: entrada e estrutura do painel local.
- Create `outputs/css/admin.css`: linguagem visual e responsividade do painel.
- Create `outputs/js/admin/admin-controller.js`: CRUD, reordenação, formulário e prévia local.

### Cena e Home

- Create `outputs/js/home/home-path-layout.js`: pontos de controle e checkpoints normalizados.
- Create `outputs/js/home/home-path-three.js`: cena Three.js, reveal, qualidade, pausa e descarte.
- Create `outputs/js/home/home-path-fallback.js`: linha estática em Canvas 2D para ausência de WebGL.
- Modify `outputs/js/home/home-scenes.js`: markup dos blocos fechados/expandidos.
- Modify `outputs/js/home/home-controller.js`: carregar repositório, controlar presença e sincronizar trajeto.
- Modify `outputs/secoes.js`: aguardar a montagem assíncrona da Home.
- Modify `outputs/transcendido.html`: import map do Three.js e estrutura do canvas.
- Modify `outputs/css/home-journey.css`: novo layout editorial, expansão e fundo.

### Chegada e assets

- Modify `outputs/transcender.html`: `chegada.png` como imagem prioritária e estrutura simplificada.
- Create `outputs/js/chegada/arrival-plate-controller.js`: scroll, movimento leve, handoff e bfcache da nova placa.
- Modify `outputs/css/chegada-scene.css`: composição responsiva e emenda visual com a Home.
- Create `assets-source/home-travessia/home-travessia-source.png`: geração original aprovada.
- Create `outputs/media/home-travessia.webp`: derivado desktop 2048×1152.
- Create `outputs/media/home-travessia-mobile.webp`: derivado mobile 1080×1440.
- Create `scripts/prepare-home-travessia-assets.mjs`: derivados WebP com Sharp.
- Create `scripts/vendor-three.mjs`: copiar o módulo Three.js fixado para `outputs/vendor/`.
- Create `outputs/vendor/three.module.min.js`: módulo publicado junto ao portal.
- Modify `package.json` e `package-lock.json`: dependência `three` e scripts de preparação.
- Modify `scripts/validate-portal-assets.mjs`: dimensões e orçamento dos novos assets.

### Testes

- Create `tests/potala/home-content-model.test.mjs`.
- Create `tests/potala/home-content-repository.test.mjs`.
- Create `tests/potala/home-block-expansion.test.mjs`.
- Create `tests/potala/home-path-layout.test.mjs`.
- Create `tests/potala/home-path-three.test.mjs`.
- Create `tests/potala/admin-local.test.mjs`.
- Create `tests/potala/home-trajeto-html.test.mjs`.
- Create `tests/potala/arrival-main-plate.test.mjs`.
- Modify tests que ainda exigirem a estrada ou o redirecionamento automático, preservando os testes puros dos módulos históricos que continuarem válidos.

---

### Task 1: Modelo editorial e repositório local

**Files:**
- Create: `outputs/js/home/content-model.js`
- Create: `outputs/js/home/content-repository.js`
- Modify: `outputs/js/home/journey-data.js`
- Test: `tests/potala/home-content-model.test.mjs`
- Test: `tests/potala/home-content-repository.test.mjs`

**Interfaces:**
- Produces: `normalizeHomeBlock(input, index) -> HomeBlock`, `normalizeHomeBlocks(input) -> HomeBlock[]`, `createLocalContentRepository({ storage, defaults, key }) -> ContentRepository`.
- `ContentRepository` exposes async `list({ publishedOnly })`, `replaceAll(blocks)`, and `reset()`.
- `HomeBlock` fields: `id`, `slug`, `category`, `title`, `summary`, `body`, `image`, `icon`, `tags`, `href`, `side`, `position`, `published`, `updatedAt`.

- [ ] **Step 1: Write failing model tests**

```js
test("normaliza blocos e alterna lados inválidos", () => {
  const blocks = normalizeHomeBlocks([
    { id: "a", title: "A", summary: "Resumo", side: "center", position: 9 },
    { id: "b", title: "B", summary: "Resumo", side: "left", position: 2 },
  ]);
  assert.deepEqual(blocks.map(({ id, side, position }) => ({ id, side, position })), [
    { id: "b", side: "left", position: 0 },
    { id: "a", side: "right", position: 1 },
  ]);
});

test("remove itens sem título e converte tags para lista segura", () => {
  const blocks = normalizeHomeBlocks([
    { id: "ok", title: " Presença ", summary: " Texto ", tags: "cuidado, escuta" },
    { id: "sem-titulo", title: "", summary: "Texto" },
  ]);
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].tags, ["cuidado", "escuta"]);
});
```

- [ ] **Step 2: Run model tests and confirm they fail**

Run: `node --test tests/potala/home-content-model.test.mjs`
Expected: FAIL because `content-model.js` does not exist.

- [ ] **Step 3: Implement the model minimally**

```js
export function normalizeHomeBlocks(input = []) {
  return input
    .map(normalizeHomeBlock)
    .filter(Boolean)
    .sort((a, b) => a.position - b.position)
    .map((block, position) => ({
      ...block,
      position,
      side: block.side === "left" || block.side === "right"
        ? block.side
        : position % 2 === 0 ? "left" : "right",
    }));
}
```

Normalize strings with `trim()`, reject empty `title`, generate a stable slug from `id || title`, default `published` to `true`, and clone arrays so callers cannot mutate defaults.

- [ ] **Step 4: Write failing repository tests**

```js
test("repositório usa defaults e persiste uma cópia normalizada", async () => {
  const storage = memoryStorage();
  const repo = createLocalContentRepository({ storage, defaults: DEFAULT_HOME_BLOCKS, key: "test" });
  assert.equal((await repo.list({ publishedOnly: true })).length, DEFAULT_HOME_BLOCKS.length);
  await repo.replaceAll([{ id: "novo", title: "Novo", summary: "Resumo", published: false }]);
  assert.equal((await repo.list({ publishedOnly: true })).length, 0);
  assert.equal((await repo.list()).length, 1);
});

test("dados corrompidos retornam aos defaults", async () => {
  const storage = memoryStorage({ test: "{" });
  const repo = createLocalContentRepository({ storage, defaults: DEFAULT_HOME_BLOCKS, key: "test" });
  assert.deepEqual(await repo.list(), normalizeHomeBlocks(DEFAULT_HOME_BLOCKS));
});
```

- [ ] **Step 5: Run repository tests and confirm they fail**

Run: `node --test tests/potala/home-content-repository.test.mjs`
Expected: FAIL because the repository is absent.

- [ ] **Step 6: Implement the repository and convert defaults**

Use storage key `potala.home.blocks.v1`. Every public method returns cloned arrays. `replaceAll` writes `{ version: 1, blocks }`; `reset` removes the key and returns normalized defaults. Convert the nine current regions into `DEFAULT_HOME_BLOCKS` with concise expanded bodies and explicit alternating sides.

- [ ] **Step 7: Run both tests**

Run: `node --test tests/potala/home-content-model.test.mjs tests/potala/home-content-repository.test.mjs`
Expected: PASS.

- [ ] **Step 8: Commit locally**

```bash
git add outputs/js/home/content-model.js outputs/js/home/content-repository.js outputs/js/home/journey-data.js tests/potala/home-content-model.test.mjs tests/potala/home-content-repository.test.mjs
git commit -m "feat(home): add local content repository"
```

### Task 2: Blocos expansíveis e exclusivos

**Files:**
- Modify: `outputs/js/home/home-scenes.js`
- Create: `outputs/js/home/block-expansion.js`
- Test: `tests/potala/home-block-expansion.test.mjs`
- Modify: `tests/potala/home-scenes.test.mjs`

**Interfaces:**
- Consumes: normalized `HomeBlock[]` from Task 1.
- Produces: `renderRegion(block, index, related) -> string`, `createBlockExpansion(root, options) -> { open(id), close(), destroy(), activeId }`.

- [ ] **Step 1: Write failing markup tests**

```js
test("bloco fechado controla detalhes expansíveis", () => {
  const markup = renderRegion(DEFAULT_HOME_BLOCKS[0], 0, []);
  assert.match(markup, /<button[^>]+aria-expanded="false"/);
  assert.match(markup, /aria-controls="quem-somos-details"/);
  assert.match(markup, /id="quem-somos-details"[^>]+aria-hidden="true"/);
  assert.match(markup, /data-side="left"/);
});
```

- [ ] **Step 2: Write failing exclusivity tests with a minimal fake root**

The fake sections must expose `dataset.regionId`, a summary button, a detail element and `classList`. Assert that opening `atendimentos` sets its `aria-expanded` to `true`, closes `quem-somos`, and that `Escape` closes the active item.

- [ ] **Step 3: Run tests and confirm failure**

Run: `node --test tests/potala/home-scenes.test.mjs tests/potala/home-block-expansion.test.mjs`
Expected: FAIL because the new markup and controller do not exist.

- [ ] **Step 4: Implement semantic markup**

```html
<section class="journey-region" data-region-id="quem-somos" data-side="left">
  <div class="region-stage">
    <article class="region-content">
      <button class="region-summary" aria-expanded="false" aria-controls="quem-somos-details">
        <span class="region-category">A entrada</span>
        <h2>Quem somos</h2>
        <p>Um instituto feito de pessoas, histórias e muitos modos de cuidar.</p>
      </button>
      <div class="region-details" id="quem-somos-details" aria-hidden="true">
        <p>Conheça a visão que reúne cuidado, conhecimento, cultura e convivência.</p>
        <ul class="region-tags"><li>história</li><li>propósito</li></ul>
        <a href="quem-somos.html">Conhecer este caminho</a>
      </div>
    </article>
  </div>
</section>
```

Escape all user-controlled strings before inserting markup. Do not apply `hidden` to the details element because CSS needs its box for the animated expansion; instead manage `aria-hidden`, descendant `tabindex` and `inert` when supported.

- [ ] **Step 5: Implement exclusive expansion**

Clicking the summary toggles its section. Opening one section closes the current one first. `Escape` closes the current item and restores focus to its summary. Destroy removes delegated click and keydown listeners.

- [ ] **Step 6: Run markup and interaction tests**

Run: `node --test tests/potala/home-scenes.test.mjs tests/potala/home-block-expansion.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit locally**

```bash
git add outputs/js/home/home-scenes.js outputs/js/home/block-expansion.js tests/potala/home-scenes.test.mjs tests/potala/home-block-expansion.test.mjs
git commit -m "feat(home): add expandable editorial blocks"
```

### Task 3: Nova paisagem e pipeline de assets

**Files:**
- Create: `assets-source/home-travessia/home-travessia-source.png`
- Create: `outputs/media/home-travessia.webp`
- Create: `outputs/media/home-travessia-mobile.webp`
- Create: `scripts/prepare-home-travessia-assets.mjs`
- Modify: `scripts/validate-portal-assets.mjs`
- Test: `tests/potala/home-travessia-assets.test.mjs`

**Interfaces:**
- Produces: desktop 2048×1152 WebP and mobile 1080×1440 WebP, both referenced by Task 6.

- [ ] **Step 1: Write the failing asset test**

```js
for (const [file, width, height, maximum] of [
  ["outputs/media/home-travessia.webp", 2048, 1152, 1_800_000],
  ["outputs/media/home-travessia-mobile.webp", 1080, 1440, 1_300_000],
]) {
  test(file, async () => {
    const info = await stat(file);
    const meta = await sharp(file).metadata();
    assert.equal(meta.width, width);
    assert.equal(meta.height, height);
    assert.ok(info.size <= maximum);
  });
}
```

- [ ] **Step 2: Run the asset test and confirm failure**

Run: `node --test tests/potala/home-travessia-assets.test.mjs`
Expected: FAIL because the derived assets are missing.

- [ ] **Step 3: Generate one source image with built-in imagegen**

Use `outputs/media/chegada.png` as a **style and continuity reference**, not as an edit target. Use this prompt:

```text
Use case: stylized-concept
Asset type: full-screen website journey background
Primary request: create the next landscape encountered after walking through the reference scene, as a seamless visual continuation of the same contemplative Potala world
Input images: Image 1: style, lighting, palette, architecture and perspective reference
Scene/backdrop: an open mountain valley at warm dawn, gentle mist, reflective water at the edges, restrained stone pavilion architecture far from the center, organic vegetation and a subtle physical path receding toward the horizon
Style/medium: cinematic photorealistic environment, natural textures, sophisticated and contemplative, slightly mystical without generic esoteric symbols
Composition/framing: wide landscape, low eye-level perspective, strong centered vanishing point, the middle third must remain visually quiet for an overlaid luminous path, useful negative space on both left and right for editorial blocks, no large foreground objects crossing the center
Lighting/mood: soft golden sunrise matching the reference, brown, warm ivory, muted moss green and restrained blue-gray shadows
Constraints: no luminous line baked into the image; no road markings; no text; no logo; no buttons; no watermark; no UI; no close-up people; preserve believable scale and depth
Avoid: fantasy castle, neon beam, saturated orange, crowded scene, symmetrical temple dominating the center
```

Inspect the result. Retry once only if it violates the central negative space, contains baked-in light, text, or an unusable focal point. Save the accepted source non-destructively under `assets-source/home-travessia/`.

- [ ] **Step 4: Implement the Sharp preparation script**

Read the source image and create:

```js
await source.clone().resize(2048, 1152, { fit: "cover", position: "centre" })
  .webp({ quality: 86, effort: 5 }).toFile(desktop);
await source.clone().resize(1080, 1440, { fit: "cover", position: "centre" })
  .webp({ quality: 84, effort: 5 }).toFile(mobile);
```

Fail if the source is missing. Do not overwrite `chegada.png`.

- [ ] **Step 5: Generate derivatives and inspect both visually**

Run: `node scripts/prepare-home-travessia-assets.mjs`
Expected: both WebP files are written within their budgets. Inspect both files with the image viewer and verify the center path area survives each crop.

- [ ] **Step 6: Run asset validation**

Run: `node --test tests/potala/home-travessia-assets.test.mjs`
Run: `npm run validate:portal`
Expected: PASS for dimensions and budgets.

- [ ] **Step 7: Commit locally**

```bash
git add assets-source/home-travessia scripts/prepare-home-travessia-assets.mjs scripts/validate-portal-assets.mjs outputs/media/home-travessia.webp outputs/media/home-travessia-mobile.webp tests/potala/home-travessia-assets.test.mjs
git commit -m "feat(media): add home journey landscape"
```

### Task 4: Three.js local e geometria do trajeto

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/vendor-three.mjs`
- Create: `outputs/vendor/three.module.min.js`
- Create: `outputs/js/home/home-path-layout.js`
- Create: `outputs/js/home/home-path-three.js`
- Create: `outputs/js/home/home-path-fallback.js`
- Test: `tests/potala/home-path-layout.test.mjs`
- Test: `tests/potala/home-path-three.test.mjs`

**Interfaces:**
- Produces: `buildHomePathLayout(blocks) -> { points, checkpoints }`, `drawRangeForProgress(progress, indexCount) -> number`, `qualityForViewport(viewport) -> quality`, `createHomePath(canvas, options) -> PathController`.
- `PathController` exposes `setProgress(progress)`, `resize()`, `pause()`, `resume()`, `destroy()`, and `mode` (`three` or `fallback`).

- [ ] **Step 1: Write failing pure geometry tests**

```js
test("checkpoints seguem a ordem e alternam os lados", () => {
  const layout = buildHomePathLayout(DEFAULT_HOME_BLOCKS.slice(0, 4));
  assert.deepEqual(layout.checkpoints.map(({ side }) => side), ["left", "right", "left", "right"]);
  assert.ok(layout.checkpoints.every((point, index, all) => index === 0 || point.progress > all[index - 1].progress));
});

test("reveal nunca ultrapassa os índices disponíveis", () => {
  assert.equal(drawRangeForProgress(-1, 120), 0);
  assert.equal(drawRangeForProgress(.5, 120), 60);
  assert.equal(drawRangeForProgress(2, 120), 120);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test tests/potala/home-path-layout.test.mjs tests/potala/home-path-three.test.mjs`
Expected: FAIL because the modules are absent.

- [ ] **Step 3: Install and vendor a fixed Three.js version**

Run: `npm install --save-exact three`
Add script `vendor:three` that copies `node_modules/three/build/three.module.min.js` to `outputs/vendor/three.module.min.js`. The script must verify the source exists and create the destination directory. Run it once and commit the vendored module so the static portal does not depend on a CDN.

- [ ] **Step 4: Implement the layout and pure helpers**

Use a centered series of `THREE.Vector3`-compatible plain objects. Each checkpoint advances along negative Y, uses small alternating X offsets no larger than 0.42 world units, and varies Z gently to create depth. Checkpoint progress is `(index + 0.5) / blockCount`.

- [ ] **Step 5: Implement the Three.js path controller**

Construct a `CatmullRomCurve3`, then create two `TubeGeometry` meshes:

- core: radius `0.028`, warm ivory/gold, additive blending, opacity near `0.98`;
- halo: radius `0.095`, warm amber, additive blending, opacity near `0.22`, depth write disabled.

Reveal both with `geometry.setDrawRange(0, drawRangeForProgress(progress, geometry.index.count))`. Use a `PerspectiveCamera` with restrained forward movement and no free orbit controls. Cap DPR at 1.5 desktop and 1.25 mobile. Pause on `visibilitychange`; destroy renderer, geometries, materials and textures explicitly.

- [ ] **Step 6: Implement fallback controller**

Draw one centered quadratic path in Canvas 2D with a broad low-opacity amber stroke and a narrow ivory core. Use the same `setProgress`, `resize`, `pause`, `resume`, `destroy` surface. The fallback must not animate continuously when the page is idle.

- [ ] **Step 7: Run path tests**

Run: `node --test tests/potala/home-path-layout.test.mjs tests/potala/home-path-three.test.mjs`
Expected: PASS, including quality caps and idempotent destroy behavior.

- [ ] **Step 8: Commit locally**

```bash
git add package.json package-lock.json scripts/vendor-three.mjs outputs/vendor/three.module.min.js outputs/js/home/home-path-layout.js outputs/js/home/home-path-three.js outputs/js/home/home-path-fallback.js tests/potala/home-path-layout.test.mjs tests/potala/home-path-three.test.mjs
git commit -m "feat(home): add threejs light path"
```

### Task 5: Integrar conteúdo, scroll e fim sem Palácio

**Files:**
- Modify: `outputs/js/home/home-controller.js`
- Modify: `outputs/secoes.js`
- Modify: `outputs/transcendido.html`
- Modify: `outputs/js/home/home-scenes.js`
- Test: `tests/potala/home-trajeto-html.test.mjs`
- Modify: `tests/potala/home-road-lifecycle.test.mjs`
- Modify: `tests/potala/home-scenes.test.mjs`

**Interfaces:**
- Consumes: repository from Task 1, expansion from Task 2, and path controller from Task 4.
- Produces: async `mountHomeJourney({ repository } = {}) -> HomeController`.

- [ ] **Step 1: Write failing integration assertions**

```js
test("Home carrega Three.js local e não arma o Palácio", async () => {
  const html = await readFile(new URL("../../outputs/transcendido.html", import.meta.url), "utf8");
  const controller = await readFile(new URL("../../outputs/js/home/home-controller.js", import.meta.url), "utf8");
  assert.match(html, /three\.module\.min\.js/);
  assert.match(controller, /createHomePath/);
  assert.doesNotMatch(controller, /crossTo|palacio\.html|shouldCrossToPalace/);
});
```

Add a repository stub test proving `mountHomeJourney` requests `{ publishedOnly: true }` and passes only the returned items to `mountJourney`.

- [ ] **Step 2: Run integration tests and confirm failure**

Run: `node --test tests/potala/home-trajeto-html.test.mjs`
Expected: FAIL because Home still imports the medieval road and Palácio handoff.

- [ ] **Step 3: Update HTML and loader**

Add an import map before `secoes.js`:

```html
<script type="importmap">
  {"imports":{"three":"./vendor/three.module.min.js"}}
</script>
```

Keep the canvas id stable or rename it consistently to `journey-path`. Make `secoes.js` await `mountHomeJourney()` and retain the fallback class on rejection.

- [ ] **Step 4: Replace controller wiring**

Load published blocks from the default local repository before mounting. Remove `createHomeRoad`, lateral exploration, road offsets, ascent crossing state, `crossTo`, and all Palácio-trigger conditions. Keep scroll progress, sound resume, visibility handling, pageshow cleanup and destruction.

Use a single passive scroll listener that schedules at most one animation frame. Compute native document progress directly and call `path.setProgress(progress)` without altering `scrollTop`.

- [ ] **Step 5: Add visibility-based presence**

Create one `IntersectionObserver` with thresholds `[0, .15, .35, .6, .85]`. Toggle `is-present` and update `--region-presence` from the intersection ratio. With reduced motion, apply only opacity. Disconnect the observer on destroy.

- [ ] **Step 6: Remove the automatic ascent from rendered markup**

Keep the contemplative continuation and footer, but remove `.journey-ascent` and any automatic destination. End the path visually by passing progress `1` near the continuation.

- [ ] **Step 7: Run integration and relevant regression tests**

Run: `node --test tests/potala/home-trajeto-html.test.mjs tests/potala/home-scenes.test.mjs tests/potala/home-road-lifecycle.test.mjs tests/potala/travessia-state.test.mjs`
Expected: PASS. Historical road lifecycle tests may continue targeting the unused module, but no Home integration test may require it.

- [ ] **Step 8: Commit locally**

```bash
git add outputs/js/home/home-controller.js outputs/js/home/home-scenes.js outputs/secoes.js outputs/transcendido.html tests/potala/home-trajeto-html.test.mjs tests/potala/home-scenes.test.mjs tests/potala/home-road-lifecycle.test.mjs
git commit -m "refactor(home): follow the light path"
```

### Task 6: Aplicar a nova Chegada e o layout editorial responsivo

**Files:**
- Modify: `outputs/transcender.html`
- Create: `outputs/js/chegada/arrival-plate-controller.js`
- Modify: `outputs/css/chegada-scene.css`
- Modify: `outputs/css/home-journey.css`
- Test: `tests/potala/arrival-main-plate.test.mjs`
- Modify: `tests/potala/arrival-html.test.mjs`
- Modify: `tests/potala/arrival-handoff.test.mjs`

**Interfaces:**
- Produces: `mountArrivalPlate({ arrival, visual, image }) -> ArrivalPlateController` with `destroy()`.
- Consumes: `enterHome`, scroll cue math and `potala:sound-state` events already used by the existing Chegada.

- [ ] **Step 1: Write failing Chegada assertions**

```js
test("Chegada usa chegada.png como placa principal", async () => {
  const html = await readFile(new URL("../../outputs/transcender.html", import.meta.url), "utf8");
  assert.match(html, /preload[^>]+media\/chegada\.png/);
  assert.match(html, /<img[^>]+src="media\/chegada\.png"/);
  assert.match(html, /arrival-plate-controller\.js/);
});
```

Test `progressForArrival` with start, middle and end values and prove handoff fires once after the threshold.

- [ ] **Step 2: Run Chegada tests and confirm failure**

Run: `node --test tests/potala/arrival-main-plate.test.mjs tests/potala/arrival-html.test.mjs tests/potala/arrival-handoff.test.mjs`
Expected: FAIL because the old master/controller is still active.

- [ ] **Step 3: Mount the new plate without removing breathing or sound**

Change only the visual controller script in `transcender.html`; keep `respiracao.js`, breathing markup, sound markup and audio element. Point preload and picture to `media/chegada.png`. Keep the transition veil and scroll cue.

- [ ] **Step 4: Implement lightweight arrival behavior**

The controller writes `--arrival-progress`, `--arrival-pointer-x` and `--arrival-pointer-y`, with pointer amplitudes capped to 6px. On scroll it schedules one frame, updates the scroll cue, and calls `enterHome({ entry: "scroll", soundEnabled })` once at progress `>= .985`. It resets transition classes on persisted `pageshow` and destroys listeners on non-persisted `pagehide`.

- [ ] **Step 5: Rebuild the Home CSS around the central trajectory**

Use the generated desktop/mobile assets as fixed full-viewport backgrounds. Keep the canvas above the background and below content. Each region uses a two-column grid with a protected central gutter:

```css
.region-stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(96px, 14vw, 190px) minmax(0, 1fr);
}
.journey-region[data-side="left"] .region-content { grid-column: 1; justify-self: end; }
.journey-region[data-side="right"] .region-content { grid-column: 3; justify-self: start; }
```

Closed width is bounded near `min(34vw, 480px)`; expanded width near `min(43vw, 680px)`. Left blocks use `transform-origin: right center`; right blocks use `transform-origin: left center`. Use grid-template rows/opacity for detail reveal. Do not use blur filters on large moving surfaces.

- [ ] **Step 6: Add mobile and reduced-motion rules**

At `max-width: 720px`, shift the path gutter to the left, place all blocks in the right content column and expand vertically. Preserve at least 32px between the path halo and the nearest block edge. Under reduced motion, disable transforms and animate only opacity in at most 120ms.

- [ ] **Step 7: Run Chegada, layout and accessibility-focused tests**

Run: `node --test tests/potala/arrival-main-plate.test.mjs tests/potala/arrival-html.test.mjs tests/potala/arrival-handoff.test.mjs tests/potala/home-trajeto-html.test.mjs`
Expected: PASS.

- [ ] **Step 8: Commit locally**

```bash
git add outputs/transcender.html outputs/js/chegada/arrival-plate-controller.js outputs/css/chegada-scene.css outputs/css/home-journey.css tests/potala/arrival-main-plate.test.mjs tests/potala/arrival-html.test.mjs tests/potala/arrival-handoff.test.mjs
git commit -m "feat(arrival): join the new light journey"
```

### Task 7: Painel editorial local

**Files:**
- Create: `outputs/admin.html`
- Create: `outputs/css/admin.css`
- Create: `outputs/js/admin/admin-controller.js`
- Test: `tests/potala/admin-local.test.mjs`

**Interfaces:**
- Consumes: `createLocalContentRepository`, `normalizeHomeBlock`, and `DEFAULT_HOME_BLOCKS`.
- Produces: `moveBlock(blocks, id, delta)`, `createAdminController({ root, repository })`, and the `admin.html` route.

- [ ] **Step 1: Write failing admin tests**

```js
test("painel declara claramente que a proteção é local", async () => {
  const html = await readFile(new URL("../../outputs/admin.html", import.meta.url), "utf8");
  assert.match(html, /Prévia local/i);
  assert.match(html, /não representa autenticação real/i);
  assert.match(html, /admin-controller\.js/);
});

test("moveBlock reordena sem perder os lados definidos", () => {
  const moved = moveBlock([
    { id: "a", side: "left", position: 0 },
    { id: "b", side: "right", position: 1 },
  ], "b", -1);
  assert.deepEqual(moved.map(({ id, side, position }) => ({ id, side, position })), [
    { id: "b", side: "right", position: 0 },
    { id: "a", side: "left", position: 1 },
  ]);
});
```

- [ ] **Step 2: Run admin tests and confirm failure**

Run: `node --test tests/potala/admin-local.test.mjs`
Expected: FAIL because the route and controller are missing.

- [ ] **Step 3: Build the local entry state**

Show a full-page branded entry with the exact warning “Prévia local — este acesso não representa autenticação real.” A button “Abrir painel local” reveals the editor for the current tab. Do not ask for or store a fake password.

- [ ] **Step 4: Build CRUD and form validation**

The list shows title, side, visibility and order. The form supports every approved field. Require title, summary, valid side and an `href` that is relative or starts with `https://`. Show validation next to the field and never save an invalid draft.

- [ ] **Step 5: Implement reordering and publish controls**

Support HTML drag-and-drop on desktop plus “Mover acima” and “Mover abaixo” buttons everywhere. After each accepted action, call `repository.replaceAll(nextBlocks)` and announce success through an `aria-live="polite"` status region.

- [ ] **Step 6: Implement preview and reset**

“Ver Home” opens `transcendido.html` in the same origin. “Restaurar conteúdo original” requires a confirmation dialog, calls `repository.reset()`, rerenders the list and reports the result. Image input accepts only path or URL in this phase.

- [ ] **Step 7: Run admin tests**

Run: `node --test tests/potala/admin-local.test.mjs tests/potala/home-content-repository.test.mjs`
Expected: PASS.

- [ ] **Step 8: Commit locally**

```bash
git add outputs/admin.html outputs/css/admin.css outputs/js/admin/admin-controller.js tests/potala/admin-local.test.mjs
git commit -m "feat(admin): add local editorial preview"
```

### Task 8: Verificação completa e prévia local

**Files:**
- Modify only files required by failures that reproduce acceptance criteria.
- Update tests only when the expected behavior changed in the approved spec.

**Interfaces:**
- Validates the complete local deliverable. Produces no new feature surface.

- [ ] **Step 1: Run the full portal test suite**

Run: `npm run test:portal`
Expected: all tests pass; no Palácio auto-cross expectation remains in Home integration tests.

- [ ] **Step 2: Validate assets**

Run: `npm run validate:portal`
Expected: every required image exists, has exact dimensions and stays within budget.

- [ ] **Step 3: Run lint and build checks relevant to the repository**

Run: `npm run lint`
Run: `npm run build`
Expected: both exit with code 0. If the unrelated Vinext starter build exposes an existing failure, record it separately and still require the portal tests and preview server to pass.

- [ ] **Step 4: Start the retained local preview**

Run: `npm run preview:portal`
Expected local URL: `http://127.0.0.1:4173/`.

- [ ] **Step 5: Force-load all three routes without visual inspection first**

Request `/`, `/transcendido.html`, and `/admin.html`; require HTTP 200 and no module-load error in the server output.

- [ ] **Step 6: Open one browser preview and perform requested visual QA**

Verify desktop and mobile widths for:

- `chegada.png` composition;
- seamless warm transition;
- visible glowing path;
- no block-path overlap;
- left/right alternation;
- one expanded block at a time;
- touch/keyboard expansion;
- smooth native scroll;
- no final Palácio transition;
- local admin save followed by Home reload;
- reduced-motion fallback.

- [ ] **Step 7: Check lifecycle and performance behavior**

Navigate Home → section page → Back three times. Confirm path and background return every time, only one render loop exists, the tab stops rendering while hidden, and no large layout shift occurs when a block expands.

- [ ] **Step 8: Run final verification once more after any fixes**

Run: `npm run test:portal`
Run: `npm run validate:portal`
Expected: both pass after the exact code shown in the preview.

- [ ] **Step 9: Stop before Supabase or publishing**

Leave the preview available for user review. Report the local URL, the files/features completed, verification results, and the fact that Supabase, GitHub push and Vercel deployment remain untouched.
