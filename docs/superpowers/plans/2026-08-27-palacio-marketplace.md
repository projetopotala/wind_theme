# Palácio, Marketplace e Grama — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a travessia em círculo — grama na borda da estrada, nona região Marketplace, estrada estendida numa subida, e cena final interativa do interior do Palácio Potala de onde o visitante retorna à Chegada.

**Architecture:** A superfície continua sendo a aplicação estática em `outputs/`, em módulos ES sem framework. A cena do palácio não ganha motor novo: reaproveita `createArrivalScene` inteiro, trocando apenas perfil e assets. Lógica testável fica em módulos puros; DOM, canvas, WebGL e áudio são adaptadores.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Canvas 2D, WebGL 1 nativo, Node.js 22 test runner (`node:test`), sharp para pipeline de imagem.

**Spec:** `docs/superpowers/specs/2026-08-27-palacio-marketplace-design.md`

## Global Constraints

- Não introduzir React, Three.js ou dependência 3D. A superfície `outputs/` é estática.
- Não refazer o renderizador da estrada. A grama é camada nova.
- Preservar o contrato de `buildMedievalRoadLayers`: quatro camadas, larguras decrescentes, textura na terceira, `lineDash` vazio, todas `source-over`.
- Toda animação usa fase integrada na CPU. Nunca `tempo × velocidade` no shader — o produto salta quando a velocidade muda.
- Respeitar `prefers-reduced-motion`, teclado, foco visível e contraste em tudo que for novo.
- Nenhum gesto pode ser a única forma de completar uma ação.
- Rodar `npm run test:portal` ao fim de cada tarefa. Deve passar inteiro, não só o teste novo.
- Rodar `npx eslint` nos arquivos tocados. Zero erros novos.
- Comentários e mensagens de commit em português, como o resto do repositório.
- Não commitar nada além do que a tarefa pede. Não publicar em lugar nenhum.

---

## File Structure

**Grama**
- `outputs/js/home/road-grass.js` — posições, alturas e fases dos tufos. Puro, sem canvas.
- `outputs/js/home/home-road.js` — passa a chamar a camada de grama entre acostamento e calçamento.

**Travessia**
- `outputs/js/home/journey-layout.js` — nona direção e segmento da subida.
- `outputs/js/home/home-scenes.js` — alturas, `featuredDiscoveries`, bloco DOM da subida.
- `outputs/js/home/home-controller.js` — subida no mapeamento e véu ao fim.
- `outputs/js/home/journey-data.js` — região Marketplace.
- `outputs/js/chegada/transition-handoff.js` — `crossTo` genérico.
- `outputs/marketplace.html`, `outputs/secoes.js`, `outputs/transcendido.html`.

**Palácio**
- `scripts/prepare-palace-assets.mjs` — pipeline 2K.
- `scripts/build-palace-masks.mjs` — facho de luz e poeira.
- `outputs/js/palacio/palace-profile.js` — perfil, assets, correção de luz.
- `outputs/js/palacio/hold-to-return.js` — máquina de estado do segurar. Pura.
- `outputs/js/palacio/palace-controller.js` — adaptador: monta cena e liga o botão.
- `outputs/palacio.html`, `outputs/css/palacio.css`.

---

## Task 1: Módulo puro da grama

**Files:**
- Create: `outputs/js/home/road-grass.js`
- Test: `tests/potala/road-grass.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `grassTuftsForRange({ from, to, spacing, seed })` → `Array<{ distance: number, side: -1|1, height: number, lean: number, phase: number }>`
  - `GRASS_DEFAULTS` → `{ spacing: 26, height: [7, 17], lean: 0.34, sway: 0.5 }`
  - `grassSwayOffset(tuft, phase)` → `number` (deslocamento lateral em px)

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import {
  GRASS_DEFAULTS,
  grassSwayOffset,
  grassTuftsForRange,
} from "../../outputs/js/home/road-grass.js";

test("os tufos cobrem o intervalo pedido com o espaçamento pedido", () => {
  const tufts = grassTuftsForRange({ from: 0, to: 200, spacing: 25, seed: 7 });
  const distancias = [...new Set(tufts.map((t) => t.distance))].sort((a, b) => a - b);
  assert.deepEqual(distancias, [0, 25, 50, 75, 100, 125, 150, 175, 200]);
  // Os dois lados da estrada recebem tufo em cada posição.
  assert.equal(tufts.length, distancias.length * 2);
  assert.deepEqual([...new Set(tufts.map((t) => t.side))].sort(), [-1, 1]);
});

test("a mesma semente devolve exatamente os mesmos tufos", () => {
  const a = grassTuftsForRange({ from: 100, to: 300, spacing: 25, seed: 3 });
  const b = grassTuftsForRange({ from: 100, to: 300, spacing: 25, seed: 3 });
  assert.deepEqual(a, b);
});

test("a semente muda o resultado, e a posição não depende do intervalo pedido", () => {
  const a = grassTuftsForRange({ from: 0, to: 100, spacing: 25, seed: 1 });
  const b = grassTuftsForRange({ from: 0, to: 100, spacing: 25, seed: 2 });
  assert.notDeepEqual(a, b);

  // Um tufo em 75 tem que sair igual pedindo 0-100 ou 50-150: a estrada rola e
  // o intervalo visível muda a cada quadro, mas a grama não pode se mexer.
  const largo = grassTuftsForRange({ from: 0, to: 100, spacing: 25, seed: 5 });
  const estreito = grassTuftsForRange({ from: 50, to: 150, spacing: 25, seed: 5 });
  const de = (lista, distancia, side) =>
    lista.find((t) => t.distance === distancia && t.side === side);
  assert.deepEqual(de(largo, 75, 1), de(estreito, 75, 1));
  assert.deepEqual(de(largo, 75, -1), de(estreito, 75, -1));
});

test("altura e inclinação ficam dentro da faixa declarada", () => {
  const tufts = grassTuftsForRange({ from: 0, to: 2000, spacing: 20, seed: 11 });
  const [minima, maxima] = GRASS_DEFAULTS.height;
  for (const tuft of tufts) {
    assert.ok(tuft.height >= minima && tuft.height <= maxima, `altura ${tuft.height}`);
    assert.ok(Math.abs(tuft.lean) <= GRASS_DEFAULTS.lean, `inclinação ${tuft.lean}`);
    assert.ok(tuft.phase >= 0 && tuft.phase < Math.PI * 2, `fase ${tuft.phase}`);
  }
});

test("intervalo inválido devolve lista vazia em vez de estourar", () => {
  assert.deepEqual(grassTuftsForRange({ from: 300, to: 100, spacing: 25, seed: 1 }), []);
  assert.deepEqual(grassTuftsForRange({ from: 0, to: 100, spacing: 0, seed: 1 }), []);
});

test("a oscilação é limitada e some quando a fase não anda", () => {
  const [tuft] = grassTuftsForRange({ from: 0, to: 0, spacing: 25, seed: 9 });
  assert.equal(grassSwayOffset(tuft, 0), grassSwayOffset(tuft, 0));
  for (const phase of [0, 0.7, 1.9, 4.2, 12.5]) {
    assert.ok(Math.abs(grassSwayOffset(tuft, phase)) <= GRASS_DEFAULTS.sway * tuft.height);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/potala/road-grass.test.mjs`
Expected: FAIL — `Cannot find module .../road-grass.js`

- [ ] **Step 3: Write minimal implementation**

```javascript
/**
 * Grama da borda da estrada.
 *
 * A estrada curva, então uma faixa de textura não acompanha a borda sem esticar
 * ou repetir de forma visível. Tufo desenhado ao longo da normal da curva
 * acompanha qualquer traçado.
 *
 * As posições saem de semente determinística por distância percorrida, e não de
 * `Math.random`, por dois motivos: a mesma estrada precisa sair igual em
 * qualquer máquina, e o intervalo visível muda a cada quadro de rolagem — se o
 * tufo dependesse do intervalo pedido, a grama andaria junto com a câmera.
 */

export const GRASS_DEFAULTS = {
  spacing: 26,
  height: [7, 17],
  lean: 0.34,
  sway: 0.5,
};

const TAU = Math.PI * 2;

/** Hash determinística: mesma entrada, mesmo número, em qualquer máquina. */
function hash(index, seed, salt) {
  const value = Math.sin(index * 12.9898 + seed * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

export function grassTuftsForRange({
  from = 0,
  to = 0,
  spacing = GRASS_DEFAULTS.spacing,
  seed = 1,
} = {}) {
  const step = Number(spacing) || 0;
  if (!(step > 0) || !(to >= from)) return [];

  const [minHeight, maxHeight] = GRASS_DEFAULTS.height;
  const first = Math.ceil(from / step);
  const last = Math.floor(to / step);
  const tufts = [];

  for (let index = first; index <= last; index += 1) {
    const distance = index * step;
    for (const side of [-1, 1]) {
      // O índice do lado entra na hash para os dois lados não ficarem espelhados.
      const key = index * 2 + (side > 0 ? 1 : 0);
      tufts.push({
        distance,
        side,
        height: minHeight + hash(key, seed, 1) * (maxHeight - minHeight),
        lean: (hash(key, seed, 2) - 0.5) * 2 * GRASS_DEFAULTS.lean,
        phase: hash(key, seed, 3) * TAU,
      });
    }
  }
  return tufts;
}

export function grassSwayOffset(tuft, phase = 0) {
  if (!tuft) return 0;
  return Math.sin(phase + tuft.phase) * GRASS_DEFAULTS.sway * tuft.height;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/potala/road-grass.test.mjs`
Expected: PASS, 6 testes

- [ ] **Step 5: Suíte inteira e lint**

Run: `npm run test:portal` — Expected: tudo passa
Run: `npx eslint outputs/js/home/road-grass.js tests/potala/road-grass.test.mjs` — Expected: sem saída

- [ ] **Step 6: Commit**

```bash
git add outputs/js/home/road-grass.js tests/potala/road-grass.test.mjs
git commit -m "feat: módulo puro da grama da borda da estrada"
```

---

## Task 2: Desenhar a grama no canvas da estrada

**Files:**
- Modify: `outputs/js/home/home-road.js`
- Test: `tests/potala/road-grass-draw.test.mjs`

**Interfaces:**
- Consumes: `grassTuftsForRange`, `grassSwayOffset`, `GRASS_DEFAULTS` (Task 1); `sampleSegment` de `journey-layout.js`.
- Produces: `visibleArcRange({ layout, camera, width, height, margin })` → `{ from: number, to: number }`, exportada de `home-road.js` para teste.

**Contexto que o implementador precisa:** `home-road.js` desenha em `draw()`. As camadas 0 e 1 (sombra e acostamento) são traçadas direto no contexto principal; as camadas 2 e 3 (textura) passam por `drawPavement`, que pinta a forma borrada numa tela auxiliar e entra com `source-in`. A grama entra **entre** as duas etapas: depois do acostamento, antes de `drawPavement`. Assim a base do tufo fica sob a pedra e a ponta se perde na borda esfumada.

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import * as homeRoad from "../../outputs/js/home/home-road.js";

test("o intervalo visível cobre a câmera e descarta o resto da estrada", () => {
  assert.equal(typeof homeRoad.visibleArcRange, "function");

  const layout = { totalLength: 10000 };
  const range = homeRoad.visibleArcRange({
    layout,
    cameraDistance: 5000,
    width: 1440,
    height: 900,
    margin: 200,
  });

  assert.ok(range.from < 5000 && range.to > 5000, "a câmera precisa estar dentro do intervalo");
  assert.ok(range.to - range.from < layout.totalLength, "não pode devolver a estrada inteira");
  assert.ok(range.from >= 0, "não pode pedir arco negativo");
  assert.ok(range.to <= layout.totalLength, "não pode passar do fim da estrada");
});

test("perto das pontas o intervalo encolhe em vez de sair da estrada", () => {
  const layout = { totalLength: 1000 };
  const inicio = homeRoad.visibleArcRange({ layout, cameraDistance: 0, width: 1440, height: 900, margin: 200 });
  const fim = homeRoad.visibleArcRange({ layout, cameraDistance: 1000, width: 1440, height: 900, margin: 200 });
  assert.equal(inicio.from, 0);
  assert.equal(fim.to, 1000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/potala/road-grass-draw.test.mjs`
Expected: FAIL — `homeRoad.visibleArcRange is not a function`

- [ ] **Step 3: Write minimal implementation**

Adicionar em `outputs/js/home/home-road.js`, junto às outras funções exportadas:

```javascript
/**
 * Arco da estrada que pode aparecer no quadro.
 *
 * A lista de tufos da estrada inteira é longa e a estrada redesenha a cada
 * quadro de rolagem. Recortar o arco antes de desenhar é o que mantém o custo
 * proporcional ao que se vê, e não ao tamanho da travessia.
 */
export function visibleArcRange({
  layout,
  cameraDistance = 0,
  width = 1440,
  height = 900,
  margin = 200,
} = {}) {
  const total = Math.max(0, Number(layout?.totalLength) || 0);
  // A diagonal cobre o pior caso: estrada atravessando o quadro na diagonal.
  const reach = Math.hypot(width, height) * 0.5 + margin;
  const center = Math.min(total, Math.max(0, Number(cameraDistance) || 0));
  return {
    from: Math.max(0, center - reach),
    to: Math.min(total, center + reach),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/potala/road-grass-draw.test.mjs`
Expected: PASS, 2 testes

- [ ] **Step 5: Ligar a grama ao desenho**

Em `home-road.js`, importar no topo:

```javascript
import { GRASS_DEFAULTS, grassSwayOffset, grassTuftsForRange } from "./road-grass.js";
```

Acrescentar a função de desenho, antes de `draw()`:

```javascript
  /**
   * Desenha a grama nas duas bordas.
   *
   * Cada tufo é posicionado pela normal da curva no ponto correspondente, então
   * a grama acompanha o traçado em vez de ser uma faixa reta ao lado dele.
   */
  function drawGrass(roadWidth, arcFrom, arcTo, phase) {
    const tufts = grassTuftsForRange({
      from: arcFrom,
      to: arcTo,
      spacing: GRASS_DEFAULTS.spacing,
      seed: 17,
    });
    if (!tufts.length) return;

    const half = roadWidth * 0.5;
    context.lineCap = "round";

    for (const tuft of tufts) {
      const point = pointAtDistance(tuft.distance);
      if (!point) continue;
      const sway = reducedMotion ? 0 : grassSwayOffset(tuft, phase);
      const baseX = point.x + point.normalX * half * tuft.side;
      const baseY = point.y + point.normalY * half * tuft.side;
      const tipX = baseX + point.normalX * tuft.height * tuft.side * 0.35
        + tuft.lean * tuft.height + sway;
      const tipY = baseY - tuft.height;

      context.strokeStyle = tuft.height > 12
        ? "rgba(104, 108, 66, .5)"
        : "rgba(126, 128, 82, .42)";
      context.lineWidth = 1.4;
      context.beginPath();
      context.moveTo(baseX, baseY);
      context.quadraticCurveTo(baseX + tuft.lean * tuft.height * 0.5, baseY - tuft.height * 0.6, tipX, tipY);
      context.stroke();
    }
  }
```

E a busca de ponto e normal por distância de arco:

```javascript
  /** Ponto e normal da estrada a uma distância de arco dada. */
  function pointAtDistance(distance) {
    let covered = 0;
    for (const segment of layout.segments) {
      if (covered + segment.length >= distance) {
        const local = (distance - covered) / Math.max(1, segment.length);
        const here = sampleSegment(segment, local);
        const ahead = sampleSegment(segment, Math.min(1, local + 0.01));
        const dx = ahead.x - here.x;
        const dy = ahead.y - here.y;
        const size = Math.hypot(dx, dy) || 1;
        // Normal é a tangente girada 90°.
        return { x: here.x, y: here.y, normalX: -dy / size, normalY: dx / size };
      }
      covered += segment.length;
    }
    return null;
  }
```

Importar `sampleSegment` na linha de import existente:

```javascript
import { buildJourneyLayout, sampleSegment } from "./journey-layout.js";
```

Em `draw()`, depois do laço das camadas 0 e 1 e do `context.restore()`, antes de `drawPavement`, acrescentar a fase e a chamada. A fase é integrada, nunca `tempo × velocidade`:

```javascript
    if (!reducedMotion) grassPhase += 0.016 * 0.9;
    const arc = visibleArcRange({
      layout,
      cameraDistance: progress * layout.totalLength,
      width,
      height,
    });
    context.save();
    context.translate(translateX, translateY);
    drawGrass(roadWidth, arc.from, arc.to, grassPhase);
    context.restore();
```

Declarar o acumulador junto às outras variáveis de estado:

```javascript
  let grassPhase = 0;
```

- [ ] **Step 6: Verificar no navegador**

Abrir `http://localhost:4173/transcendido.html`, rolar até uma região e conferir que a grama aparece nas duas bordas e acompanha a curva. Ler os erros do console: devem ser zero.

- [ ] **Step 7: Suíte inteira e lint**

Run: `npm run test:portal` — Expected: tudo passa
Run: `npx eslint outputs/js/home/home-road.js tests/potala/road-grass-draw.test.mjs` — Expected: sem saída

- [ ] **Step 8: Commit**

```bash
git add outputs/js/home/home-road.js tests/potala/road-grass-draw.test.mjs
git commit -m "feat: grama procedural nas bordas da estrada"
```

---

## Task 3: `crossTo` genérico na passagem entre documentos

**Files:**
- Modify: `outputs/js/chegada/transition-handoff.js`
- Test: `tests/potala/transition-handoff.test.mjs`

**Interfaces:**
- Consumes: `writeTravessiaState` de `../core/travessia-state.js`.
- Produces:
  - `crossTo({ entry, soundEnabled, destination })` → `boolean`
  - `enterHome({ entry, soundEnabled, destination })` → `boolean` (invólucro, destino padrão `transcendido.html`)
  - `handoffDelayForMotion({ reducedMotion })` → `number` (inalterada)

**Contexto:** o arquivo hoje exporta `enterHome`, que grava estado, marca `data-transitioning`, adiciona as classes do véu e navega depois de `handoffDelayForMotion`. A Home vai precisar do mesmo mecanismo para ir ao palácio, e o palácio para voltar à Chegada. O nome `enterHome` descreve mal esses usos.

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import * as handoff from "../../outputs/js/chegada/transition-handoff.js";

test("crossTo existe e enterHome continua sendo o caminho da Chegada", () => {
  assert.equal(typeof handoff.crossTo, "function");
  assert.equal(typeof handoff.enterHome, "function");
});

test("o atraso da passagem encurta em movimento reduzido", () => {
  assert.equal(handoff.handoffDelayForMotion({ reducedMotion: false }), 850);
  assert.equal(handoff.handoffDelayForMotion({ reducedMotion: true }), 80);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/potala/transition-handoff.test.mjs`
Expected: FAIL — `handoff.crossTo is not a function`

- [ ] **Step 3: Write minimal implementation**

Reescrever `outputs/js/chegada/transition-handoff.js`:

```javascript
import { writeTravessiaState } from "../core/travessia-state.js";

export function handoffDelayForMotion({ reducedMotion = false } = {}) {
  return reducedMotion ? 80 : 850;
}

/**
 * Fecha o véu e troca de documento.
 *
 * A travessia tem três passagens — Chegada para Home, Home para o palácio, e o
 * palácio de volta para a Chegada — e todas escondem a troca no escuro do véu.
 * O destino é o único parâmetro que muda entre elas.
 */
export function crossTo({
  entry,
  soundEnabled = false,
  destination = "transcendido.html",
} = {}) {
  if (document.documentElement.dataset.transitioning === "true") return false;
  document.documentElement.dataset.transitioning = "true";
  writeTravessiaState({ entry, soundEnabled });
  document.documentElement.classList.add("is-crossing");
  document.body.classList.add("is-arrival-transitioning");
  document.dispatchEvent(new CustomEvent("potala:prepare-handoff"));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(
    () => location.assign(destination),
    handoffDelayForMotion({ reducedMotion: reduced }),
  );
  return true;
}

/** A passagem da Chegada. Mantida por nome porque é a que o controlador chama. */
export function enterHome(options = {}) {
  return crossTo({ destination: "transcendido.html", ...options });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/potala/transition-handoff.test.mjs`
Expected: PASS, 2 testes

- [ ] **Step 5: Suíte inteira e lint**

Run: `npm run test:portal` — Expected: tudo passa, incluindo os testes da Chegada
Run: `npx eslint outputs/js/chegada/transition-handoff.js tests/potala/transition-handoff.test.mjs`

- [ ] **Step 6: Commit**

```bash
git add outputs/js/chegada/transition-handoff.js tests/potala/transition-handoff.test.mjs
git commit -m "refactor: crossTo genérico para as três passagens da travessia"
```

---

## Task 4: Marketplace nos dados e na navegação

**Files:**
- Modify: `outputs/js/home/journey-data.js`
- Modify: `outputs/js/home/home-scenes.js`
- Modify: `outputs/js/home/journey-layout.js`
- Modify: `outputs/secoes.js`
- Modify: `outputs/transcendido.html`
- Modify: `tests/potala/home-scenes.test.mjs`
- Test: `tests/potala/marketplace.test.mjs`

**Interfaces:**
- Consumes: nada novo.
- Produces: nona região com `id: "marketplace"` em `JOURNEY_REGIONS`.

**Contexto crítico:** nove pontos precisam da nona entrada, e a maioria quebra em silêncio. `DIRECTIONS` tem exatamente oito entradas; `featuredDiscoveries` tem oito; `regionHeights` tem oito e `silenceHeights` sete. O teste de ritmo em `home-scenes.test.mjs` varre sete trechos e passa a varrer oito.

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JOURNEY_REGIONS } from "../../outputs/js/home/journey-data.js";
import { DIRECTIONS } from "../../outputs/js/home/journey-layout.js";
import { journeyRhythmForIndex } from "../../outputs/js/home/home-scenes.js";

test("Marketplace é uma região da travessia", () => {
  const marketplace = JOURNEY_REGIONS.find((region) => region.id === "marketplace");
  assert.ok(marketplace, "região marketplace ausente");
  assert.equal(marketplace.href, "marketplace.html");
  assert.ok(marketplace.title);
  assert.ok(marketplace.description);
});

test("cada região tem direção e ritmo próprios", () => {
  const regioes = JOURNEY_REGIONS.filter((region) => region.type === "region");
  assert.equal(regioes.length, 9);
  assert.ok(DIRECTIONS.length >= regioes.length, `DIRECTIONS tem ${DIRECTIONS.length} para ${regioes.length} regiões`);
  for (let index = 0; index < regioes.length; index += 1) {
    const ritmo = journeyRhythmForIndex(index);
    assert.ok(ritmo.regionHeight > 100, `região ${index} sem altura própria`);
  }
});

test("Marketplace aparece na navegação e no fallback sem script", async () => {
  const secoes = await readFile("outputs/secoes.js", "utf8");
  assert.match(secoes, /marketplace\.html/);
  const home = await readFile("outputs/transcendido.html", "utf8");
  assert.match(home, /marketplace\.html/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/potala/marketplace.test.mjs`
Expected: FAIL — `região marketplace ausente`

- [ ] **Step 3: Acrescentar a região**

Em `outputs/js/home/journey-data.js`, inserir depois da região `arte-cultura` e antes de `inspiracao`:

```javascript
  {
    id: "marketplace",
    type: "region",
    category: "A loja",
    title: "Marketplace",
    description: "Cristais, incensos, livros e óleos essenciais — o que a casa reúne para levar junto.",
    media: "media/journey-cultura.webp",
    alt: "Prateleiras de loja com cristais, incensos e livros",
    href: "marketplace.html",
    priority: 74,
    tags: ["cristais", "incensos", "livros"],
    relatedContent: ["loja", "arte-cultura"],
    layoutVariant: "shelf-editorial",
    roadPlacement: "left",
  },
```

- [ ] **Step 4: Acrescentar direção, ritmo e descoberta**

Em `outputs/js/home/journey-layout.js`, `DIRECTIONS` passa a ter nove entradas:

```javascript
const DIRECTIONS = [
  { x: 0, y: 1 },
  { x: .42, y: .91 },
  { x: -.38, y: .92 },
  { x: 1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -.36, y: .93 },
  { x: .4, y: .92 },
  { x: 0, y: 1 },
];
```

Em `outputs/js/home/home-scenes.js`:

```javascript
const regionHeights = [198, 192, 195, 202, 192, 195, 202, 196, 192];
const silenceHeights = [44, 48, 42, 46, 43, 50, 44, 46];
```

```javascript
const featuredDiscoveries = [
  "acao-social",
  "recepcao",
  "blog",
  "saude-integrativa",
  "novos-profissionais",
  "eventos",
  "revista",
  "loja",
  "sono-reflexao",
];
```

- [ ] **Step 5: Navegação e fallback**

Em `outputs/secoes.js`, dentro de `siteSections`, depois de `cultura`:

```javascript
    { key: "marketplace", label: "Marketplace", href: "marketplace.html" },
```

Em `outputs/transcendido.html`, dentro da lista do `noscript`, depois de Arte e cultura:

```html
        <li><a href="marketplace.html">Marketplace</a></li>
```

- [ ] **Step 6: Atualizar o teste de ritmo**

Em `tests/potala/home-scenes.test.mjs`, o laço passa a varrer oito trechos:

```javascript
  for (let index = 0; index < 8; index += 1) {
```

- [ ] **Step 7: Run tests**

Run: `node --test tests/potala/marketplace.test.mjs` — Expected: PASS, 3 testes
Run: `npm run test:portal` — Expected: tudo passa

- [ ] **Step 8: Lint e commit**

```bash
npx eslint outputs/js/home tests/potala
git add outputs/js/home outputs/secoes.js outputs/transcendido.html tests/potala
git commit -m "feat: Marketplace como nona região da travessia"
```

---

## Task 5: Página do Marketplace

**Files:**
- Create: `outputs/marketplace.html`
- Test: `tests/potala/marketplace.test.mjs` (acrescentar caso)

**Interfaces:**
- Consumes: `secoes.css`, `secoes.js`, e o layout de `css/secao-conteudo.css`.
- Produces: nada para outras tarefas.

**Contexto:** as páginas de seção seguem um padrão fixo. Copiar a estrutura de `outputs/cultura.html`: `.page-view.page-view--article` com `.article-shell`, cabeçalho com `page-kicker`/`page-title`/`page-lead`, blocos `.article-block`, grupos `.article-groups`, e rodapé `.article-foot` com endereço e telefone.

- [ ] **Step 1: Write the failing test**

Acrescentar em `tests/potala/marketplace.test.mjs`:

```javascript
test("a página do Marketplace segue o padrão editorial das seções", async () => {
  const page = await readFile("outputs/marketplace.html", "utf8");
  assert.match(page, /<body data-section="marketplace"/);
  assert.match(page, /page-view--article/);
  assert.match(page, /secoes\.css/);
  assert.match(page, /secoes\.js/);
  assert.match(page, /article-back/);
  // Endereço e telefone reais do instituto, como nas outras páginas.
  assert.match(page, /Rua 24 de Maio, 748/);
  assert.match(page, /\(19\) 3834-6147/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/potala/marketplace.test.mjs`
Expected: FAIL — `ENOENT: outputs/marketplace.html`

- [ ] **Step 3: Write the page**

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#edf1ed">
  <meta name="description" content="A loja do Instituto Potala: cristais, incensos, livros, óleos essenciais e alimentos saudáveis.">
  <title>Instituto Potala — Marketplace</title>
  <script>document.documentElement.classList.add("js");</script>
  <link rel="stylesheet" href="secoes.css">
  <script src="secoes.js" defer></script>
</head>
<body data-section="marketplace">
  <main class="page-view page-view--article" id="conteudo">
    <div class="article-shell">
      <header class="article-head">
        <p class="page-kicker">A loja</p>
        <h1 class="page-title">Marketplace</h1>
        <p class="page-lead">O que a casa reúne para você levar junto — e continuar em casa o que começou aqui.</p>
      </header>

      <section class="article-block">
        <h2>Mais de três mil produtos</h2>
        <p>A loja ocupa a entrada do instituto e existe pelo mesmo motivo das salas de atendimento: dar continuidade ao cuidado. O incenso que acompanha a meditação, o livro que aprofunda o curso, o óleo essencial que a aromaterapia indicou.</p>

        <div class="article-groups">
          <div class="article-group">
            <h3>Cristais</h3>
            <p>Peças brutas e polidas, para coleção, para prática ou para presentear.</p>
          </div>
          <div class="article-group">
            <h3>Incensos e óleos</h3>
            <p>Incensos naturais e óleos essenciais, incluindo os usados nas formações de aromaterapia.</p>
          </div>
          <div class="article-group">
            <h3>Livros e oráculos</h3>
            <p>Títulos que acompanham os cursos e os grupos de estudo, e baralhos de tarô e outros oráculos.</p>
          </div>
          <div class="article-group">
            <h3>Alimentos saudáveis</h3>
            <p>Produtos naturais selecionados, para quem quer levar a prática também para a mesa.</p>
          </div>
        </div>
      </section>

      <section class="article-block">
        <h2>Como comprar</h2>
        <p>A loja é presencial, na entrada do instituto, aberta nos horários de funcionamento da casa. Encomendas e dúvidas sobre disponibilidade são atendidas pelo WhatsApp.</p>
      </section>

      <p class="article-note">Levar um objeto é levar a lembrança de uma prática — e é assim que ela continua depois que você sai daqui.</p>

      <footer class="article-foot">
        <p>Rua 24 de Maio, 748 — Centro, Indaiatuba/SP · (19) 3834-6147 · WhatsApp (19) 99776-6131</p>
        <p><a href="https://www.institutopotala.com" rel="noreferrer">institutopotala.com</a> · contato@institutopotala.com</p>
        <a class="article-back" href="transcendido.html">Voltar à travessia</a>
      </footer>
    </div>
  </main>
</body>
</html>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/potala/marketplace.test.mjs` — Expected: PASS, 4 testes

- [ ] **Step 5: Verificar no navegador**

Abrir `http://localhost:4173/marketplace.html`. Conferir: barra de navegação com Marketplace ativo, texto em marrom, rodapé com contato, zero erros no console.

- [ ] **Step 6: Commit**

```bash
git add outputs/marketplace.html tests/potala/marketplace.test.mjs
git commit -m "feat: página editorial do Marketplace"
```

---

## Task 6: Segmento de subida no fim da estrada

**Files:**
- Modify: `outputs/js/home/journey-layout.js`
- Modify: `outputs/js/home/home-scenes.js`
- Modify: `outputs/css/home-journey.css`
- Test: `tests/potala/journey-ascent.test.mjs`

**Interfaces:**
- Consumes: `buildJourneyLayout(regions, viewport)`, `mountJourney(root, { regions, discoveries })`.
- Produces: `ASCENT_HEIGHT` → `number` (svh), exportada de `home-scenes.js`.

**Contexto crítico — leia antes de escrever qualquer linha:** `roadStateForScroll`, em `home-controller.js`, casa seções do DOM com segmentos da estrada **em ordem, uma a uma**. Hoje: 9 regiões geram 9 retas e 8 curvas (a última região não gera curva) = 17 segmentos; o DOM tem 9 regiões + 8 silêncios = 17 blocos. Um bloco de subida no DOM sem segmento correspondente desloca todo o mapeamento e a estrada sai de sincronia com a rolagem — sem lançar erro nenhum.

Por isso a subida ganha reta própria no layout, e o teste abaixo trava a igualdade das duas contagens.

Sobre `roadOffsetForPathSection`: ela calcula `checkpointIndex = floor(sectionIndex / 2)` e satura no último checkpoint. A subida tem índice par e cai no último checkpoint, herdando o deslocamento da última região. É o comportamento desejado e não precisa de mudança.

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { JOURNEY_DISCOVERIES, JOURNEY_REGIONS } from "../../outputs/js/home/journey-data.js";
import { buildJourneyLayout } from "../../outputs/js/home/journey-layout.js";
import { ASCENT_HEIGHT } from "../../outputs/js/home/home-scenes.js";

const regioes = JOURNEY_REGIONS.filter((region) => region.type === "region");

test("a subida tem altura própria de rolagem", () => {
  assert.equal(typeof ASCENT_HEIGHT, "number");
  assert.ok(ASCENT_HEIGHT >= 60, `subida curta demais: ${ASCENT_HEIGHT}svh`);
});

test("a estrada ganha um segmento a mais para a subida", () => {
  const layout = buildJourneyLayout(regioes, { width: 1440, height: 900 });
  const retas = layout.segments.filter((s) => s.kind === "straight");
  const curvas = layout.segments.filter((s) => s.kind === "curve");

  // Uma reta por região, mais a reta da subida. Uma curva entre regiões vizinhas.
  assert.equal(retas.length, regioes.length + 1);
  assert.equal(curvas.length, regioes.length - 1);
  assert.equal(layout.segments.at(-1).id, "straight-ascent");
});

test("a contagem de blocos do DOM bate com a de segmentos da estrada", () => {
  const layout = buildJourneyLayout(regioes, { width: 1440, height: 900 });
  // Regiões + silêncios + subida, que é como mountJourney monta os blocos.
  const blocosDom = regioes.length + (regioes.length - 1) + 1;
  assert.equal(
    blocosDom,
    layout.segments.length,
    "desalinhamento entre seções do DOM e segmentos da estrada",
  );
});

test("a subida continua na direção da última região, sem dobra", () => {
  const layout = buildJourneyLayout(regioes, { width: 1440, height: 900 });
  const ultimaRegiao = layout.segments.at(-2);
  const subida = layout.segments.at(-1);
  assert.ok(Math.abs(subida.direction.x - ultimaRegiao.direction.x) < 1e-6);
  assert.ok(Math.abs(subida.direction.y - ultimaRegiao.direction.y) < 1e-6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/potala/journey-ascent.test.mjs`
Expected: FAIL — `ASCENT_HEIGHT` indefinido

- [ ] **Step 3: Acrescentar a reta da subida ao layout**

Em `outputs/js/home/journey-layout.js`, dentro de `buildJourneyLayout`, logo antes do `return`:

```javascript
  // A subida não tem informação nenhuma: é só caminho, e é o que dá ao visitante
  // a sensação de chegar em vez de ser teletransportado. Precisa de segmento
  // próprio porque o mapeamento casa blocos do DOM com segmentos um a um — um
  // bloco sem par desloca a estrada inteira em silêncio.
  const lastDirection = segments.at(-1)?.direction || normalize(DIRECTIONS[0]);
  const ascent = {
    id: "straight-ascent",
    kind: "straight",
    from: samePoint(cursor),
    to: add(cursor, lastDirection, capStraight),
    direction: lastDirection,
    length: capStraight,
    regionId: null,
  };
  segments.push(ascent);
  cursor = samePoint(ascent.to);
```

- [ ] **Step 4: Acrescentar o bloco de subida ao DOM**

Em `outputs/js/home/home-scenes.js`, exportar a altura:

```javascript
/** Rolagem da subida final, em svh. Sem informação: só caminho. */
export const ASCENT_HEIGHT = 120;
```

Em `mountJourney`, no `root.innerHTML`, inserir entre `${regionMarkup}` e a `<section class="journey-continuation">`:

```javascript
    <div class="journey-ascent" aria-hidden="true" style="--ascent-height:${ASCENT_HEIGHT}svh"></div>
```

- [ ] **Step 5: Estilo do bloco**

Em `outputs/css/home-journey.css`, junto de `.journey-silence`:

```css
/* A subida é irmã do silêncio: bloco sem conteúdo, existindo só como rolagem
   para a estrada percorrer. */
.journey-ascent {
  position: relative;
  z-index: 1;
  min-height: var(--ascent-height, 120svh);
  pointer-events: none;
}
```

- [ ] **Step 6: Incluir a subida no mapeamento**

Em `outputs/js/home/home-scenes.js`, na coleta de elementos, a subida entra em `pathSections`:

```javascript
    pathSections: [...root.querySelectorAll(".journey-region, .journey-silence, .journey-ascent")],
```

- [ ] **Step 7: Run tests**

Run: `node --test tests/potala/journey-ascent.test.mjs` — Expected: PASS, 4 testes
Run: `npm run test:portal` — Expected: tudo passa

- [ ] **Step 8: Verificar no navegador**

Rolar até o fim da Home. A estrada continua depois da última região por um trecho sem informação e some para fora do quadro. Se a estrada sair de sincronia com a rolagem em qualquer ponto, o alinhamento quebrou — pare e revise o Step 3.

- [ ] **Step 9: Lint e commit**

```bash
npx eslint outputs/js/home tests/potala/journey-ascent.test.mjs
git add outputs/js/home outputs/css/home-journey.css tests/potala/journey-ascent.test.mjs
git commit -m "feat: subida final da estrada com segmento próprio"
```

---

## Task 7: O véu do fim leva ao palácio

**Files:**
- Modify: `outputs/js/home/home-controller.js`
- Test: `tests/potala/ascent-handoff.test.mjs`

**Interfaces:**
- Consumes: `crossTo` (Task 3), `ASCENT_HEIGHT` (Task 6).
- Produces: `shouldCrossToPalace({ scrollTop, scrollHeight, viewportHeight })` → `boolean`, exportada de `home-controller.js`.

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import * as controller from "../../outputs/js/home/home-controller.js";

test("a passagem ao palácio só dispara no fim da subida", () => {
  assert.equal(typeof controller.shouldCrossToPalace, "function");
  const alto = { scrollHeight: 10000, viewportHeight: 900 };

  assert.equal(controller.shouldCrossToPalace({ scrollTop: 0, ...alto }), false);
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 5000, ...alto }), false);
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 8500, ...alto }), false);
  assert.equal(controller.shouldCrossToPalace({ scrollTop: 9100, ...alto }), true);
});

test("documento sem rolagem não dispara passagem", () => {
  assert.equal(
    controller.shouldCrossToPalace({ scrollTop: 0, scrollHeight: 800, viewportHeight: 900 }),
    false,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/potala/ascent-handoff.test.mjs`
Expected: FAIL — `controller.shouldCrossToPalace is not a function`

- [ ] **Step 3: Write minimal implementation**

Em `outputs/js/home/home-controller.js`, junto às outras funções puras exportadas:

```javascript
/**
 * Se a rolagem chegou ao fim da subida.
 *
 * A margem existe porque a última rolagem raramente para no pixel exato: em
 * rolagem suave e em trackpad o documento encosta no fim com sobra de alguns
 * pixels, e exigir igualdade deixaria a passagem sem disparar.
 */
export function shouldCrossToPalace({
  scrollTop = 0,
  scrollHeight = 0,
  viewportHeight = 0,
} = {}) {
  const maximo = scrollHeight - viewportHeight;
  if (maximo <= 0) return false;
  return scrollTop >= maximo - 8;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/potala/ascent-handoff.test.mjs` — Expected: PASS, 2 testes

- [ ] **Step 5: Ligar ao controlador**

Importar no topo de `home-controller.js`:

```javascript
import { crossTo } from "../chegada/transition-handoff.js";
```

No tratador de rolagem, depois de atualizar o estado da estrada:

```javascript
    if (shouldCrossToPalace({
      scrollTop: document.scrollingElement.scrollTop,
      scrollHeight: document.scrollingElement.scrollHeight,
      viewportHeight: innerHeight,
    })) {
      crossTo({ destination: "palacio.html" });
    }
```

- [ ] **Step 6: Suíte, lint e commit**

```bash
npm run test:portal
npx eslint outputs/js/home/home-controller.js tests/potala/ascent-handoff.test.mjs
git add outputs/js/home/home-controller.js tests/potala/ascent-handoff.test.mjs
git commit -m "feat: fim da subida fecha o véu e leva ao palácio"
```

---

## Task 8: Pipeline dos assets do palácio

**Files:**
- Create: `scripts/prepare-palace-assets.mjs`
- Modify: `scripts/validate-portal-assets.mjs`
- Test: `tests/potala/palace-assets.test.mjs`

**Interfaces:**
- Consumes: os dois arquivos já no disco, `assets-source/potala-interior/potala-interior-plate-1024x576.png` e `potala-interior-depth-1024x576.png`.
- Produces:
  - `preparePalaceAssets({ sourceDir, outputDir })` → `{ plate: { width, height }, files: string[] }`
  - `inspectPalaceSource(file)` → `{ width, height, format }`

**Contexto:** espelha `scripts/prepare-arrival-v2-assets.mjs`, que redimensiona para 2048×1152 com lanczos3, aplica `sharpen` na placa e grava máscaras em webp sem perdas. A recusa de assets desalinhados é o que impede um mapa de profundidade fora de registro de entrar no motor.

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  inspectPalaceSource,
  preparePalaceAssets,
} from "../../scripts/prepare-palace-assets.mjs";

const SOURCE = path.resolve("assets-source/potala-interior");

test("placa e profundidade do palácio compartilham a dimensão", async () => {
  const plate = await inspectPalaceSource(path.join(SOURCE, "potala-interior-plate-1024x576.png"));
  const depth = await inspectPalaceSource(path.join(SOURCE, "potala-interior-depth-1024x576.png"));
  assert.equal(plate.width, 1024);
  assert.equal(plate.height, 576);
  assert.equal(depth.width, plate.width);
  assert.equal(depth.height, plate.height);
});

test("o pipeline entrega as camadas em 2K alinhado", async () => {
  const outputDir = path.join(os.tmpdir(), `palace-${Date.now()}`);
  await mkdir(outputDir, { recursive: true });
  try {
    const result = await preparePalaceAssets({ outputDir });
    assert.deepEqual(result.plate, { width: 2048, height: 1152 });
    for (const file of result.files) {
      const meta = await sharp(path.join(outputDir, file)).metadata();
      assert.equal(meta.width, 2048, file);
      assert.equal(meta.height, 1152, file);
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
  }
});

test("o pipeline recusa profundidade desalinhada da placa", async () => {
  const dir = path.join(os.tmpdir(), `palace-bad-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  try {
    await sharp({ create: { width: 1024, height: 576, channels: 3, background: "#333" } })
      .png().toFile(path.join(dir, "potala-interior-plate-1024x576.png"));
    await sharp({ create: { width: 800, height: 450, channels: 3, background: "#000" } })
      .png().toFile(path.join(dir, "potala-interior-depth-1024x576.png"));
    await assert.rejects(
      () => preparePalaceAssets({ sourceDir: dir, outputDir: path.join(dir, "out") }),
      /desalinhad|está 800/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/potala/palace-assets.test.mjs`
Expected: FAIL — `Cannot find module .../prepare-palace-assets.mjs`

- [ ] **Step 3: Write the pipeline**

```javascript
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "assets-source", "potala-interior");
const OUTPUT = path.join(ROOT, "outputs", "media");
const OUTPUT_SIZE = { width: 2048, height: 1152 };

const FILES = [
  { source: "potala-interior-plate-1024x576.png", output: "palacio-master.webp", kind: "master" },
  { source: "potala-interior-depth-1024x576.png", output: "palacio-depth.webp", kind: "map" },
];

export async function inspectPalaceSource(file) {
  const info = await sharp(file).metadata();
  if (!info.width || !info.height) {
    throw new Error(`${file} não possui dimensão válida`);
  }
  return { width: info.width, height: info.height, format: info.format };
}

export async function preparePalaceAssets({ sourceDir = SOURCE, outputDir = OUTPUT } = {}) {
  const prepared = [];
  let plateSize = null;

  for (const file of FILES) {
    const input = path.join(sourceDir, file.source);
    try {
      await stat(input);
    } catch {
      throw new Error(`Asset do palácio ausente: ${file.source}`);
    }
    const meta = await inspectPalaceSource(input);
    if (!plateSize) plateSize = { width: meta.width, height: meta.height };
    if (meta.width !== plateSize.width || meta.height !== plateSize.height) {
      throw new Error(
        `${file.source} está ${meta.width}×${meta.height}, mas a placa é ${plateSize.width}×${plateSize.height}. `
          + "Mapas desalinhados deslocam a profundidade e quebram o parallax.",
      );
    }
    prepared.push({ ...file, input });
  }

  await mkdir(outputDir, { recursive: true });

  for (const file of prepared) {
    const pipeline = sharp(file.input).resize({
      ...OUTPUT_SIZE,
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    });
    const output = path.join(outputDir, file.output);
    if (file.kind === "master") {
      await pipeline.sharpen({ sigma: 0.6 }).webp({ quality: 90, smartSubsample: true, effort: 5 }).toFile(output);
    } else {
      await pipeline.webp({ lossless: true, effort: 4 }).toFile(output);
    }
  }

  return { plate: { ...OUTPUT_SIZE }, files: prepared.map((file) => file.output) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isMain) {
  const result = await preparePalaceAssets();
  console.log(`Palácio pronto: ${result.plate.width}×${result.plate.height} → ${result.files.join(", ")}`);
}
```

- [ ] **Step 4: Rodar o pipeline e o teste**

Run: `node scripts/prepare-palace-assets.mjs`
Expected: `Palácio pronto: 2048×1152 → palacio-master.webp, palacio-depth.webp`

Run: `node --test tests/potala/palace-assets.test.mjs` — Expected: PASS, 3 testes

- [ ] **Step 5: Orçamento dos assets**

Em `scripts/validate-portal-assets.mjs`, acrescentar ao array `budgets`:

```javascript
  { file: "outputs/media/palacio-master.webp", maximum: 2_200_000, width: 2048, height: 1152 },
  { file: "outputs/media/palacio-depth.webp", maximum: 1_200_000, width: 2048, height: 1152 },
```

Run: `npm run validate:portal` — Expected: `Assets essenciais da Travessia dentro do orçamento.`

- [ ] **Step 6: Adicionar script ao package.json**

Em `package.json`, junto de `prepare:arrival-v2`:

```json
    "prepare:palace": "node scripts/prepare-palace-assets.mjs",
```

- [ ] **Step 7: Commit**

```bash
git add scripts/prepare-palace-assets.mjs scripts/validate-portal-assets.mjs package.json outputs/media/palacio-*.webp tests/potala/palace-assets.test.mjs
git commit -m "feat: pipeline 2K dos assets do Palácio Potala"
```

---

## Task 9: Máscaras derivadas do facho de luz

**Files:**
- Create: `scripts/build-palace-masks.mjs`
- Test: `tests/potala/palace-masks.test.mjs`

**Interfaces:**
- Consumes: os PNG de origem do palácio.
- Produces:
  - `buildLightMask({ sourceDir, outputFile })` → `{ width, height, coverage, outputFile }`
  - `LIGHT_MASK_SETTINGS` → `{ minLuma: 150, maxDepth: 0.22, feather: 6 }`

**Contexto:** o vão da porta é o ponto mais claro da placa e o mais distante da profundidade (0.00). A combinação das duas condições isola o facho sem precisar de máscara pintada à mão — é a mesma técnica que gerou a máscara de céu da Chegada, e o motivo dela funcionar aqui é que nenhuma outra área junta brilho alto com profundidade baixa.

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { buildLightMask, LIGHT_MASK_SETTINGS } from "../../scripts/build-palace-masks.mjs";

test("os limiares ficam explícitos para ajuste futuro", () => {
  assert.equal(typeof LIGHT_MASK_SETTINGS.minLuma, "number");
  assert.ok(LIGHT_MASK_SETTINGS.maxDepth <= 0.3);
});

test("a máscara isola o vão da porta e ignora colunas e chão", async () => {
  const outputFile = "assets-source/potala-interior/potala-interior-light-mask.png";
  const result = await buildLightMask({ outputFile });

  assert.equal(result.width, 1024);
  assert.equal(result.height, 576);
  assert.ok(result.coverage > 0.01 && result.coverage < 0.25, `cobertura ${result.coverage}`);

  const mask = await sharp(outputFile).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = mask.info;
  const at = (u, v) => mask.data[Math.round(v * (height - 1)) * width + Math.round(u * (width - 1))] / 255;

  // Sem estes limites o facho vaza para a pedra e a poeira aparece onde não há luz.
  assert.ok(at(0.5, 0.45) > 0.6, "o vão da porta precisa entrar na máscara");
  assert.ok(at(0.06, 0.6) < 0.2, "a coluna próxima não pode entrar");
  assert.ok(at(0.5, 0.95) < 0.3, "o chão em primeiro plano não pode entrar");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/potala/palace-masks.test.mjs`
Expected: FAIL — `Cannot find module .../build-palace-masks.mjs`

- [ ] **Step 3: Write the mask builder**

```javascript
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "assets-source", "potala-interior");

/**
 * O facho de luz do vão da porta.
 *
 * Nenhuma outra área da cena junta brilho alto com profundidade baixa: as
 * colunas são claras mas próximas, o chão é claro mas próximo, e o fundo do
 * corredor é distante mas escuro. O cruzamento das duas condições isola o vão
 * sem máscara pintada à mão — mesma técnica da máscara de céu da Chegada.
 */
export const LIGHT_MASK_SETTINGS = {
  minLuma: 150,
  maxDepth: 0.22,
  feather: 6,
};

export async function buildLightMask({
  sourceDir = SOURCE,
  settings = LIGHT_MASK_SETTINGS,
  outputFile = path.join(SOURCE, "potala-interior-light-mask.png"),
} = {}) {
  const plate = await sharp(path.join(sourceDir, "potala-interior-plate-1024x576.png"))
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const depth = await sharp(path.join(sourceDir, "potala-interior-depth-1024x576.png"))
    .greyscale().raw().toBuffer({ resolveWithObject: true });

  const { width, height, channels } = plate.info;
  if (depth.info.width !== width || depth.info.height !== height) {
    throw new Error("a profundidade do palácio não compartilha a dimensão da placa");
  }

  const mask = Buffer.alloc(width * height);
  let covered = 0;
  for (let i = 0; i < width * height; i += 1) {
    const luma = 0.299 * plate.data[i * channels]
      + 0.587 * plate.data[i * channels + 1]
      + 0.114 * plate.data[i * channels + 2];
    const near = depth.data[i] / 255;
    const lit = luma >= settings.minLuma && near <= settings.maxDepth;
    mask[i] = lit ? 255 : 0;
    if (lit) covered += 1;
  }

  await sharp(mask, { raw: { width, height, channels: 1 } })
    .blur(settings.feather)
    .toColourspace("b-w")
    .png()
    .toFile(outputFile);

  return { width, height, coverage: covered / (width * height), outputFile };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isMain) {
  const result = await buildLightMask();
  console.log(`Facho do palácio: ${result.width}×${result.height} — cobertura ${(result.coverage * 100).toFixed(1)}%`);
}
```

- [ ] **Step 4: Rodar e conferir**

Run: `node scripts/build-palace-masks.mjs`
Expected: cobertura entre 1% e 25%

Run: `node --test tests/potala/palace-masks.test.mjs` — Expected: PASS, 2 testes

Se algum limite falhar, ajuste `minLuma` e `maxDepth` e rode de novo. Não afrouxe as asserções do teste: elas são o que garante que a poeira não apareça sobre a pedra.

- [ ] **Step 5: Incluir no pipeline**

Em `scripts/prepare-palace-assets.mjs`, acrescentar ao array `FILES`:

```javascript
  { source: "potala-interior-light-mask.png", output: "palacio-light-mask.webp", kind: "map" },
```

Run: `node scripts/build-palace-masks.mjs && node scripts/prepare-palace-assets.mjs`

Acrescentar o orçamento em `scripts/validate-portal-assets.mjs`:

```javascript
  { file: "outputs/media/palacio-light-mask.webp", maximum: 700_000, width: 2048, height: 1152 },
```

- [ ] **Step 6: Commit**

```bash
git add scripts/build-palace-masks.mjs scripts/prepare-palace-assets.mjs scripts/validate-portal-assets.mjs assets-source/potala-interior outputs/media/palacio-*.webp tests/potala/palace-masks.test.mjs
git commit -m "feat: máscara do facho de luz do palácio"
```

---

## Task 10: Perfil do palácio

**Files:**
- Create: `outputs/js/palacio/palace-profile.js`
- Test: `tests/potala/palace-profile.test.mjs`

**Interfaces:**
- Consumes: `ARRIVAL_MOTION` de `../chegada/arrival-scene-profile.js`.
- Produces:
  - `PALACE_PROFILE` → `{ id, plate: { width, height }, assets: { imageUrl, depthUrl, skyMaskUrl, mistMaskUrl, waterMaskUrl, waterfallMaskUrl, canopyMaskUrl }, motion, world }`
  - `selectPalaceAssets()` → o objeto `assets`

**Contexto crítico:** a cena é interior. O shader calcula `float sky = smoothstep(0.48, 0.16, sceneUv.y)` e usa esse valor para o brilho do sol. Como `uv.y = 1` é o topo da tela, o termo vale 1 no **rodapé** do quadro. Numa paisagem externa isso passa por luz refletida no chão; num corredor acenderia a laje errada. O perfil zera `sun` no mundo do palácio, e a luz da cena vem do facho.

Sem céu não há nuvem: `skyMaskUrl` fica vazio, e `uHasSkyMask` cai para 0, o que já zera a camada de nuvem no shader sem mudança nenhuma nele.

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { PALACE_PROFILE, selectPalaceAssets } from "../../outputs/js/palacio/palace-profile.js";

test("o perfil aponta para os assets do palácio em 2K", () => {
  const assets = selectPalaceAssets();
  assert.match(assets.imageUrl, /palacio-master\.webp$/);
  assert.match(assets.depthUrl, /palacio-depth\.webp$/);
  assert.deepEqual(PALACE_PROFILE.plate, { width: 2048, height: 1152 });
});

test("cena interior não carrega céu, água nem cachoeira", () => {
  const assets = selectPalaceAssets();
  // Sem máscara de céu o shader zera a nuvem sozinho, via uHasSkyMask.
  assert.equal(assets.skyMaskUrl, "");
  assert.equal(assets.waterMaskUrl, "");
  assert.equal(assets.waterfallMaskUrl, "");
});

test("o sol é zerado porque o termo de céu do shader acende o rodapé", () => {
  assert.equal(PALACE_PROFILE.world.sun, 0);
  assert.ok(PALACE_PROFILE.world.mist > 0, "o facho precisa de névoa para aparecer");
});

test("o movimento herda a Chegada mas sem nuvem", () => {
  assert.equal(PALACE_PROFILE.motion.cloudAmount, 0);
  assert.ok(PALACE_PROFILE.motion.nearParallax > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/potala/palace-profile.test.mjs`
Expected: FAIL — `Cannot find module .../palace-profile.js`

- [ ] **Step 3: Write the profile**

```javascript
import { ARRIVAL_MOTION } from "../chegada/arrival-scene-profile.js";

/**
 * Perfil da cena final, dentro do Palácio Potala.
 *
 * A cena é interior, e isso invalida dois padrões do motor:
 *
 * 1. Sem céu. `skyMaskUrl` vazio faz `uHasSkyMask` cair para 0 e a camada de
 *    nuvem se apagar sozinha, sem tocar no shader.
 * 2. A luz vem do vão da porta, não de cima. O shader calcula o brilho do sol
 *    sobre `smoothstep(0.48, 0.16, sceneUv.y)`, e como `uv.y = 1` é o topo da
 *    tela esse termo vale 1 no rodapé do quadro — num corredor ele acenderia a
 *    laje em vez do fundo. Zerar `sun` desliga esse caminho, e a luz da cena
 *    passa a vir do facho recortado pela máscara.
 */
export const PALACE_PROFILE = {
  id: "palacio-interior",
  plate: { width: 2048, height: 1152 },
  assets: {
    imageUrl: "media/palacio-master.webp",
    depthUrl: "media/palacio-depth.webp",
    mistMaskUrl: "media/palacio-light-mask.webp",
    skyMaskUrl: "",
    waterMaskUrl: "",
    waterfallMaskUrl: "",
    canopyMaskUrl: "",
  },
  motion: {
    ...ARRIVAL_MOTION,
    cloudAmount: 0,
    // O corredor é fundo e estreito: paralaxe mais forte que a paisagem vende a
    // profundidade das colunas sem precisar de câmera nova.
    nearParallax: 0.011,
    farParallax: 0.0015,
    cameraZoom: 0.018,
  },
  world: {
    wind: 0,
    water: 0,
    sun: 0,
    mist: 0.42,
    path: 0,
    attention: 0,
    windDir: [0, 0],
    attentionUv: [0.5, 0.45],
  },
};

export function selectPalaceAssets() {
  return { ...PALACE_PROFILE.assets };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/potala/palace-profile.test.mjs` — Expected: PASS, 4 testes

- [ ] **Step 5: Lint e commit**

```bash
npx eslint outputs/js/palacio tests/potala/palace-profile.test.mjs
git add outputs/js/palacio/palace-profile.js tests/potala/palace-profile.test.mjs
git commit -m "feat: perfil da cena interior do palácio"
```

---

## Task 11: Máquina de estado do botão de segurar

**Files:**
- Create: `outputs/js/palacio/hold-to-return.js`
- Test: `tests/potala/hold-to-return.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `HOLD_DURATION` → `1500`
  - `createHoldState()` → `{ progress: 0, holding: false, completed: false }`
  - `advanceHold(state, { elapsedMs, holding, reducedMotion })` → novo estado
  - `zoomForProgress(progress)` → `number` (escala, 1 no repouso)

**Contexto:** segurar é gesto sem convenção firme na web. O recuo ao soltar é o que ensina o gesto: o visitante experimenta, vê o zoom começar, entende, e aí completa. Por isso o progresso recua em vez de zerar de uma vez.

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceHold,
  createHoldState,
  HOLD_DURATION,
  zoomForProgress,
} from "../../outputs/js/palacio/hold-to-return.js";

test("o estado começa parado", () => {
  const state = createHoldState();
  assert.equal(state.progress, 0);
  assert.equal(state.holding, false);
  assert.equal(state.completed, false);
});

test("segurar avança e completa na duração declarada", () => {
  let state = createHoldState();
  let decorrido = 0;
  while (decorrido < HOLD_DURATION && !state.completed) {
    state = advanceHold(state, { elapsedMs: 100, holding: true });
    decorrido += 100;
  }
  assert.equal(state.completed, true);
  assert.equal(state.progress, 1);
  assert.ok(decorrido >= HOLD_DURATION, `completou cedo demais: ${decorrido}ms`);
});

test("soltar antes do fim recua o progresso em vez de zerar de uma vez", () => {
  let state = createHoldState();
  state = advanceHold(state, { elapsedMs: 600, holding: true });
  const noPico = state.progress;
  assert.ok(noPico > 0.3 && noPico < 1, `progresso no pico ${noPico}`);

  state = advanceHold(state, { elapsedMs: 100, holding: false });
  assert.ok(state.progress < noPico, "o progresso precisa recuar");
  assert.ok(state.progress > 0, "o recuo não pode ser instantâneo");
  assert.equal(state.completed, false);
});

test("soltando por tempo suficiente o progresso volta a zero e não completa", () => {
  let state = createHoldState();
  state = advanceHold(state, { elapsedMs: 700, holding: true });
  for (let i = 0; i < 40; i += 1) {
    state = advanceHold(state, { elapsedMs: 100, holding: false });
  }
  assert.equal(state.progress, 0);
  assert.equal(state.completed, false);
});

test("depois de completar o estado não regride", () => {
  let state = createHoldState();
  state = advanceHold(state, { elapsedMs: HOLD_DURATION + 50, holding: true });
  assert.equal(state.completed, true);
  state = advanceHold(state, { elapsedMs: 500, holding: false });
  assert.equal(state.completed, true, "completar é definitivo, senão a navegação seria cancelada no meio");
  assert.equal(state.progress, 1);
});

test("em movimento reduzido a conclusão é imediata", () => {
  const state = advanceHold(createHoldState(), { elapsedMs: 16, holding: true, reducedMotion: true });
  assert.equal(state.completed, true);
});

test("o zoom cresce com o progresso e parte de 1", () => {
  assert.equal(zoomForProgress(0), 1);
  assert.ok(zoomForProgress(0.5) > 1);
  assert.ok(zoomForProgress(1) > zoomForProgress(0.5));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/potala/hold-to-return.test.mjs`
Expected: FAIL — `Cannot find module .../hold-to-return.js`

- [ ] **Step 3: Write minimal implementation**

```javascript
/**
 * O botão de segurar que fecha a travessia.
 *
 * Segurar por 1,5s completa; soltar antes faz o progresso recuar, e o zoom
 * recua junto porque é função dele. O recuo não é enfeite: é o que ensina o
 * gesto. O visitante pressiona, vê a cena começar a avançar, entende o que o
 * botão faz, e aí completa — sem precisar de instrução escrita.
 *
 * Estado puro, fora do navegador, para o comportamento poder ser testado sem
 * simular ponteiro nem tempo real.
 */

export const HOLD_DURATION = 1500;
const RELEASE_FACTOR = 1.8; // recua mais rápido do que avança
const MAX_ZOOM = 1.85;

const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));

export function createHoldState() {
  return { progress: 0, holding: false, completed: false };
}

export function advanceHold(state, { elapsedMs = 0, holding = false, reducedMotion = false } = {}) {
  const current = state || createHoldState();
  // Completar é definitivo: sem isso, soltar durante a navegação cancelaria uma
  // troca de documento já disparada.
  if (current.completed) return { ...current, holding, progress: 1 };

  if (holding && reducedMotion) {
    return { progress: 1, holding: true, completed: true };
  }

  const delta = Math.max(0, Number(elapsedMs) || 0) / HOLD_DURATION;
  const progress = holding
    ? clamp(current.progress + delta)
    : clamp(current.progress - delta * RELEASE_FACTOR);

  return { progress, holding, completed: progress >= 1 };
}

export function zoomForProgress(progress) {
  const t = clamp(progress);
  // Aceleração no fim: o avanço parece ganhar velocidade ao entrar na luz.
  return 1 + (MAX_ZOOM - 1) * t * t;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/potala/hold-to-return.test.mjs` — Expected: PASS, 7 testes

- [ ] **Step 5: Lint e commit**

```bash
npx eslint outputs/js/palacio/hold-to-return.js tests/potala/hold-to-return.test.mjs
git add outputs/js/palacio/hold-to-return.js tests/potala/hold-to-return.test.mjs
git commit -m "feat: máquina de estado do botão de segurar"
```

---

## Task 12: Documento e cena do palácio

**Files:**
- Create: `outputs/palacio.html`
- Create: `outputs/css/palacio.css`
- Create: `outputs/js/palacio/palace-controller.js`
- Test: `tests/potala/palace-html.test.mjs`

**Interfaces:**
- Consumes: `createArrivalScene` de `../chegada/arrival-scene.js`; `createSceneClock` de `../chegada/scene-clock.js`; `PALACE_PROFILE`, `selectPalaceAssets` (Task 10); `advanceHold`, `createHoldState`, `zoomForProgress`, `HOLD_DURATION` (Task 11); `crossTo` (Task 3).
- Produces: nada para outras tarefas.

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("o palácio tem canvas, fallback e botão acessível", async () => {
  const page = await readFile("outputs/palacio.html", "utf8");

  assert.match(page, /id="palace-scene"[^>]*aria-hidden="true"/);
  // Fallback obrigatório: se o WebGL falhar, a cena não pode virar tela preta.
  assert.match(page, /palacio-master\.webp/);
  assert.match(page, /<button[^>]*id="palace-return"/);
  assert.match(page, /palacio\.css/);
  assert.doesNotMatch(page, /<audio[^>]*autoplay/i);
});

test("o botão anuncia o gesto e o destino em texto, não só em animação", async () => {
  const page = await readFile("outputs/palacio.html", "utf8");
  assert.match(page, /aria-describedby="palace-return-hint"/);
  assert.match(page, /id="palace-return-hint"/);
});

test("o controlador reaproveita o motor da Chegada em vez de duplicar", async () => {
  const controller = await readFile("outputs/js/palacio/palace-controller.js", "utf8");
  assert.match(controller, /createArrivalScene/);
  assert.match(controller, /from "\.\.\/chegada\/arrival-scene\.js"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/potala/palace-html.test.mjs`
Expected: FAIL — `ENOENT: outputs/palacio.html`

- [ ] **Step 3: Write the document**

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#171310">
  <meta name="description" content="O interior do Palácio Potala, ao fim da travessia.">
  <title>Potala — O Palácio</title>
  <link rel="preload" href="media/palacio-master.webp" as="image" type="image/webp" fetchpriority="high">
  <link rel="stylesheet" href="css/palacio.css">
  <script type="module" src="js/palacio/palace-controller.js"></script>
</head>
<body>
  <main class="palace" id="palace">
    <div class="palace-visual" id="palace-visual">
      <picture class="palace-fallback">
        <img src="media/palacio-master.webp"
          alt="Corredor de colunas do Palácio Potala, com três pessoas caminhando em direção à luz de um vão de porta"
          width="2048" height="1152" fetchpriority="high" decoding="async">
      </picture>
      <canvas class="palace-canvas" id="palace-scene" aria-hidden="true" hidden></canvas>
    </div>

    <button class="palace-return" id="palace-return" type="button"
      aria-describedby="palace-return-hint">
      <span class="palace-return-ring" aria-hidden="true"></span>
      <span class="palace-return-label">Voltar ao começo</span>
    </button>
    <p class="palace-return-hint" id="palace-return-hint">
      Segure o botão para atravessar a luz e retornar à Chegada. Enter também funciona.
    </p>
  </main>

  <noscript>
    <p class="palace-noscript"><a href="transcender.html">Voltar à Chegada</a></p>
  </noscript>
</body>
</html>
```

- [ ] **Step 4: Write the stylesheet**

```css
:root {
  color-scheme: dark;
  --palace-ink: #171310;
  --palace-ivory: #f0e6d6;
  --palace-gold: #d8b47c;
}

* { box-sizing: border-box; }

html, body {
  min-height: 100%;
  margin: 0;
  background: var(--palace-ink);
  color: var(--palace-ivory);
  font-family: Georgia, "Times New Roman", serif;
  -webkit-font-smoothing: antialiased;
}

.palace {
  position: relative;
  width: 100%;
  height: 100svh;
  min-height: min(480px, 100svh);
  overflow: hidden;
}

.palace-visual,
.palace-fallback,
.palace-fallback img,
.palace-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.palace-fallback img {
  display: block;
  object-fit: cover;
  transition: opacity 1.4s ease;
}

.palace-canvas {
  display: block;
  opacity: 0;
  transition: opacity 1.6s cubic-bezier(.22, .72, .24, 1);
}

.palace-visual.is-scene-ready .palace-canvas { opacity: 1; }
.palace-visual.is-scene-ready .palace-fallback img { opacity: .01; }

/* O zoom é aplicado no conjunto, não só no canvas, para o fallback fotográfico
   acompanhar quando o WebGL não estiver disponível. */
.palace-visual {
  transform: scale(var(--palace-zoom, 1));
  transform-origin: 50% 46%;
  will-change: transform;
}

.palace-return {
  position: absolute;
  z-index: 10;
  bottom: max(9svh, calc(env(safe-area-inset-bottom) + 28px));
  left: 50%;
  display: grid;
  min-width: 176px;
  min-height: 52px;
  padding: 0 26px;
  place-items: center;
  border: 1px solid rgba(216, 180, 124, .5);
  border-radius: 999px;
  background: rgba(23, 19, 16, .52);
  color: var(--palace-ivory);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .2em;
  text-transform: uppercase;
  cursor: pointer;
  transform: translateX(-50%);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}

.palace-return:focus-visible {
  outline: 2px solid var(--palace-gold);
  outline-offset: 4px;
}

/* O anel preenche conforme o progresso: é o retorno visual do gesto. */
.palace-return-ring {
  position: absolute;
  inset: -1px;
  border-radius: 999px;
  background: conic-gradient(
    var(--palace-gold) calc(var(--hold-progress, 0) * 360deg),
    transparent 0
  );
  opacity: .5;
  pointer-events: none;
}

.palace-return-label { position: relative; }

.palace-return-hint {
  position: absolute;
  z-index: 10;
  right: 0;
  bottom: max(4svh, calc(env(safe-area-inset-bottom) + 8px));
  left: 0;
  margin: 0;
  color: rgba(240, 230, 214, .62);
  font-size: clamp(11px, 1.3vw, 14px);
  text-align: center;
  text-wrap: balance;
}

.palace-noscript { padding: 24px; text-align: center; }
.palace-noscript a { color: var(--palace-gold); }

@media (prefers-reduced-motion: reduce) {
  .palace-canvas { display: none; }
  .palace-visual.is-scene-ready .palace-fallback img { opacity: 1; }
  .palace-visual { transition: none; }
  .palace-fallback img { transition-duration: .01ms !important; }
}
```

- [ ] **Step 5: Write the controller**

```javascript
import { createArrivalScene } from "../chegada/arrival-scene.js";
import { createSceneClock } from "../chegada/scene-clock.js";
import { crossTo } from "../chegada/transition-handoff.js";
import { PALACE_PROFILE, selectPalaceAssets } from "./palace-profile.js";
import { advanceHold, createHoldState, zoomForProgress } from "./hold-to-return.js";

const visual = document.getElementById("palace-visual");
const canvas = document.getElementById("palace-scene");
const button = document.getElementById("palace-return");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

if (visual && canvas && button) {
  const scene = createArrivalScene({
    canvas,
    ...selectPalaceAssets(),
    profile: PALACE_PROFILE,
    reducedMotion,
  });

  scene.setWorld(PALACE_PROFILE.world);

  let hold = createHoldState();
  let holding = false;
  let crossed = false;

  const applyHold = (state) => {
    visual.style.setProperty("--palace-zoom", zoomForProgress(state.progress).toFixed(4));
    button.style.setProperty("--hold-progress", state.progress.toFixed(4));
    button.setAttribute("aria-valuenow", Math.round(state.progress * 100));
    if (state.completed && !crossed) {
      crossed = true;
      visual.classList.add("is-crossing-light");
      crossTo({ destination: "transcender.html" });
    }
  };

  const clock = createSceneClock({
    tick(now, elapsedMs) {
      hold = advanceHold(hold, { elapsedMs, holding, reducedMotion });
      applyHold(hold);
      scene.render(elapsedMs);
    },
  });

  const press = () => { holding = true; };
  const release = () => { holding = false; };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("pointercancel", release);

  // Equivalente sem manter pressionado: segurar é difícil no teclado e para quem
  // tem limitação motora, e nenhum gesto pode ser a única forma de concluir.
  button.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    hold = { progress: 1, holding: false, completed: true };
    applyHold(hold);
  });

  const onPointerMove = (event) => {
    if (reducedMotion) return;
    scene.setPointer((event.clientX / innerWidth) * 2 - 1, -((event.clientY / innerHeight) * 2 - 1));
  };
  addEventListener("pointermove", onPointerMove, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { clock.stop(); scene.pause(); }
    else { clock.resetTime(); scene.resume(); clock.start(); }
  });

  scene.ready.then((ok) => {
    if (!ok) return;
    clock.start();
  });
}
```

- [ ] **Step 6: Run tests**

Run: `node --test tests/potala/palace-html.test.mjs` — Expected: PASS, 3 testes
Run: `npm run test:portal` — Expected: tudo passa

- [ ] **Step 7: Verificar no navegador**

Abrir `http://localhost:4173/palacio.html`. Conferir:

- a cena aparece e o parallax responde ao mouse;
- segurar o botão faz o zoom avançar e o anel preencher;
- soltar no meio faz zoom e anel recuarem;
- segurar até o fim leva a `transcender.html`;
- Enter conclui sem manter pressionado;
- Tab dá foco visível ao botão;
- zero erros no console.

- [ ] **Step 8: Lint e commit**

```bash
npx eslint outputs/js/palacio tests/potala/palace-html.test.mjs
git add outputs/palacio.html outputs/css/palacio.css outputs/js/palacio/palace-controller.js tests/potala/palace-html.test.mjs
git commit -m "feat: cena interativa do Palácio Potala com retorno à Chegada"
```

---

## Task 13: Fechar o círculo e revisar o conjunto

**Files:**
- Modify: `outputs/secoes.js` (se a navegação precisar do palácio)
- Test: `tests/potala/travessia-circulo.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("a travessia fecha em círculo", async () => {
  const home = await readFile("outputs/js/home/home-controller.js", "utf8");
  const palace = await readFile("outputs/js/palacio/palace-controller.js", "utf8");

  assert.match(home, /palacio\.html/, "a Home precisa levar ao palácio");
  assert.match(palace, /transcender\.html/, "o palácio precisa voltar à Chegada");
});

test("as três passagens usam o mesmo mecanismo de véu", async () => {
  const chegada = await readFile("outputs/js/chegada/arrival-controller.js", "utf8");
  const home = await readFile("outputs/js/home/home-controller.js", "utf8");
  const palace = await readFile("outputs/js/palacio/palace-controller.js", "utf8");

  assert.match(chegada, /transition-handoff/);
  assert.match(home, /transition-handoff/);
  assert.match(palace, /transition-handoff/);
});
```

- [ ] **Step 2: Run tests**

Run: `node --test tests/potala/travessia-circulo.test.mjs` — Expected: PASS, 2 testes

- [ ] **Step 3: Percorrer a travessia inteira no navegador**

Abrir `http://localhost:4173/` e percorrer sem pular: Chegada, arrastar para a Home, rolar as nove regiões conferindo que a grama acompanha as curvas e que as informações param no centro, seguir a subida até o véu fechar, chegar ao palácio, segurar o botão e voltar à Chegada.

Anotar qualquer coisa que destoe. Este passo é o único que exercita a travessia como um visitante.

- [ ] **Step 4: Suíte, validação e lint completos**

```bash
npm run test:portal
npm run validate:portal
npx eslint outputs/js tests scripts
```

Expected: todos os testes passam, assets dentro do orçamento, zero erros de lint novos.

- [ ] **Step 5: Commit**

```bash
git add tests/potala/travessia-circulo.test.mjs
git commit -m "test: travessia fecha em círculo pelas três passagens"
```

---

## Self-review

**Cobertura da spec:**

| Seção da spec | Tarefa |
|---|---|
| 4. Grama | 1, 2 |
| 5.1 Nona direção | 4 |
| 5.2 Trecho de subida | 6 |
| 5.3 Véu | 3, 7 |
| 6. Marketplace | 4, 5 |
| 7.1 Assets | 8 |
| 7.2 Cena interior | 10 |
| 7.3 Máscaras derivadas | 9 |
| 7.4 Movimento | 10, 12 |
| 7.5 Sem atores | 12 (ausência deliberada) |
| 8. Botão de segurar | 11, 12 |
| 10. Testes | todas |

**Consistência de tipos:** `grassTuftsForRange`, `grassSwayOffset` e `GRASS_DEFAULTS` mantêm nome entre as tarefas 1 e 2. `crossTo` mantém assinatura entre 3, 7 e 12. `advanceHold`/`zoomForProgress`/`createHoldState` mantêm nome entre 11 e 12. `PALACE_PROFILE`/`selectPalaceAssets` entre 10 e 12.

**Riscos com dono:** o desalinhamento seção↔segmento tem teste próprio na Task 6, Step 1, terceiro caso. O custo da grama por quadro tem descarte por arco na Task 2. O termo `sky` do shader é contornado na Task 10 e permanece registrado como dívida da Chegada.
