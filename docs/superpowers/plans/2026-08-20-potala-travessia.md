# Portal Potala — A Travessia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Transformar a Chegada e a Home existentes em uma travessia contínua, com paisagem WebGL, respiração opcional integrada, drag preservado e estrada narrativa configurável.

**Architecture:** A superfície de produção continua sendo a aplicação estática em outputs, organizada em módulos ES independentes e sem migração para React. Chegada e Home permanecem em documentos separados, compartilham somente preferências efêmeras por sessionStorage e usam uma transição visual compatível com fallback. Estado e geometria testáveis ficam em módulos puros; DOM, WebGL, canvas e áudio são adaptadores de navegador.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Canvas 2D, WebGL 1/2 nativo, Node.js 22 test runner, ImageGen para assets originais, navegador local para QA.

**Spec:** docs/superpowers/specs/2026-08-20-potala-travessia-design.md

## Global Constraints

- Preservar a estrada existente, o drag e a respiração 3-3-3.
- Respiração: inspirar 3 segundos, segurar 3 segundos, expirar 3 segundos, por 8 ciclos.
- A respiração nunca inicia automaticamente; somente o convite discreto “Respirar” aparece antes da escolha.
- Chegada e Home continuam em outputs/transcender.html e outputs/transcendido.html.
- Não introduzir React, Three.js ou outra dependência 3D pesada na superfície outputs.
- Chegada ocupa aproximadamente 200svh e o scroll é a passagem narrativa principal.
- O drag da Chegada é atalho opcional e continua operável por mouse, touch, Espaço e Enter.
- Home contém oito regiões: Quem Somos, Atendimentos, Cursos, Atividades, Profissionais, Programação, Arte e Cultura e Inspiração.
- Exploração lateral elástica somente em Atendimentos e Profissionais.
- A travessia completa deve ter ritmo de aproximadamente 90 a 150 segundos em scroll confortável.
- Informações nunca podem cobrir a estrada nem permanecer em curvas.
- Usar três ou quatro imagens estratégicas na Home, sem poluição visual.
- Conteúdo real de profissionais, eventos e datas só entra depois de verificação em fonte pública oficial.
- Scroll nativo: não registrar wheel com preventDefault e não criar cauda artificial.
- Limitar o DPR efetivo do WebGL a 1,5 e oferecer fallback estático.
- Áudio opcional, inicialmente mudo, com fade na passagem e retomada discreta na Home.
- Respeitar prefers-reduced-motion, teclado, foco visível, touch, contraste e textos alternativos.
- Manter a aplicação React em app intacta; este plano altera a superfície estática em outputs.
- Não publicar nem enviar para GitHub/Vercel sem autorização explícita ao final da validação local.

## File Structure

### Criar

- outputs/js/core/math.js — interpolação e normalização compartilhadas.
- outputs/js/core/travessia-state.js — preferências efêmeras e contrato de handoff.
- outputs/js/chegada/breathing-timeline.js — cálculo puro do ciclo 3-3-3.
- outputs/js/chegada/arrival-scene.js — WebGL e fallback da paisagem.
- outputs/js/chegada/arrival-controller.js — scroll, ponteiro, visibilidade e respiração da cena.
- outputs/js/chegada/drag-controller.js — drag opcional e controles equivalentes de teclado.
- outputs/js/chegada/transition-handoff.js — passagem entre documentos.
- outputs/js/home/journey-data.js — regiões e descobertas editoriais.
- outputs/js/home/journey-layout.js — geometria pura da estrada e zonas seguras.
- outputs/js/home/home-road.js — renderização Canvas 2D.
- outputs/js/home/home-scenes.js — montagem e presença das regiões.
- outputs/js/home/lateral-exploration.js — drag elástico em duas regiões.
- outputs/js/home/home-controller.js — ciclo único de atualização da Home.
- outputs/css/chegada-scene.css — composição, fallback e passagem.
- outputs/css/home-journey.css — encontros editoriais, pontos de luz e responsividade.
- outputs/media/chegada-landscape.webp — paisagem principal aprovada.
- outputs/media/chegada-depth.webp — mapa de profundidade correspondente.
- outputs/media/chegada-landscape-mobile.webp — enquadramento mobile.
- outputs/media/journey-quem-somos.webp — encontro arquitetônico.
- outputs/media/journey-cuidado.webp — encontro de acolhimento.
- outputs/media/journey-cultura.webp — encontro artístico.
- outputs/media/journey-inspiracao.webp — encontro contemplativo.
- scripts/serve-outputs.mjs — servidor local sem dependências.
- scripts/validate-portal-assets.mjs — validação de presença e orçamento de mídia.
- tests/potala/breathing-timeline.test.mjs — contrato 3-3-3.
- tests/potala/travessia-state.test.mjs — preferências e handoff.
- tests/potala/drag-controller.test.mjs — progresso do drag.
- tests/potala/journey-data.test.mjs — oito regiões, links e relações.
- tests/potala/journey-layout.test.mjs — continuidade e zonas sem conteúdo.
- tests/potala/portal-html.test.mjs — semântica e integração estática.

### Modificar

- package.json — scripts test:portal, preview:portal e validate:portal.
- outputs/transcender.html — nova composição da Chegada.
- outputs/respiracao.js — controlador visual integrado e eventos ambientais.
- outputs/respiracao.css — estado discreto e não modal.
- outputs/transcendido.html — contêiner semântico e fallback da Home.
- outputs/secoes.js — bootstrap compatível e remoção do wheel artificial.
- outputs/secoes.css — base visual existente e importação da jornada.

### Preservar

- outputs/musica-fundo.mp3 — fonte de áudio atual até seleção final.
- outputs/media/chegada.mp4 — manter durante os primeiros marcos para rollback; remover apenas após aprovação da cena nova.
- outputs/atendimentos.html, outputs/atividades.html, outputs/cursos.html, outputs/programacao.html, outputs/cultura.html e outputs/saude-integrativa.html — páginas de aprofundamento atuais.
- app, public, .openai e configuração React/vinext — fora da superfície desta implementação.

---

### Task 1: Contratos puros, testes e preview local

**Files:**
- Create: outputs/js/core/math.js
- Create: outputs/js/core/travessia-state.js
- Create: scripts/serve-outputs.mjs
- Create: tests/potala/travessia-state.test.mjs
- Modify: package.json

**Interfaces:**
- Produces: clamp(value, min, max), lerp(from, to, progress), smoothstep(progress).
- Produces: readTravessiaState(storage), writeTravessiaState(patch, storage), consumeHandoff(storage).
- Produces: npm run preview:portal e npm run test:portal.

- [ ] **Step 1: Escrever o teste de estado que falha**

~~~javascript
import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeHandoff,
  readTravessiaState,
  writeTravessiaState,
} from "../../outputs/js/core/travessia-state.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("persiste apenas preferências efêmeras válidas", () => {
  const storage = memoryStorage();
  writeTravessiaState({ soundEnabled: true, entry: "scroll", unknown: 7 }, storage);
  assert.deepEqual(readTravessiaState(storage), {
    soundEnabled: true,
    entry: "scroll",
  });
});

test("consome o handoff sem apagar a preferência de som", () => {
  const storage = memoryStorage();
  writeTravessiaState({ soundEnabled: true, entry: "drag" }, storage);
  assert.deepEqual(consumeHandoff(storage), { soundEnabled: true, entry: "drag" });
  assert.deepEqual(readTravessiaState(storage), { soundEnabled: true });
});

test("falha de storage retorna estado seguro", () => {
  const storage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.deepEqual(readTravessiaState(storage), {});
  assert.doesNotThrow(() => writeTravessiaState({ soundEnabled: true }, storage));
});
~~~

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: node --test tests/potala/travessia-state.test.mjs  
Expected: FAIL com ERR_MODULE_NOT_FOUND para travessia-state.js.

- [ ] **Step 3: Implementar matemática e estado mínimos**

~~~javascript
// outputs/js/core/math.js
export const clamp = (value, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));
export const lerp = (from, to, progress) => from + (to - from) * progress;
export const smoothstep = (progress) => {
  const value = clamp(progress);
  return value * value * (3 - 2 * value);
};

// outputs/js/core/travessia-state.js
const STORAGE_KEY = "potala.travessia.v1";
const VALID_ENTRIES = new Set(["scroll", "drag", "keyboard"]);

function sanitize(value = {}) {
  const state = {};
  if (typeof value.soundEnabled === "boolean") state.soundEnabled = value.soundEnabled;
  if (VALID_ENTRIES.has(value.entry)) state.entry = value.entry;
  return state;
}

export function readTravessiaState(storage = sessionStorage) {
  try {
    return sanitize(JSON.parse(storage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return {};
  }
}

export function writeTravessiaState(patch, storage = sessionStorage) {
  try {
    const next = sanitize({ ...readTravessiaState(storage), ...patch });
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return sanitize(patch);
  }
}

export function consumeHandoff(storage = sessionStorage) {
  const current = readTravessiaState(storage);
  try {
    if ("entry" in current) {
      const keep = sanitize({ soundEnabled: current.soundEnabled });
      storage.setItem(STORAGE_KEY, JSON.stringify(keep));
    }
  } catch {}
  return current;
}
~~~

- [ ] **Step 4: Criar servidor local sem dependências**

Implementar scripts/serve-outputs.mjs com node:http, servir somente arquivos resolvidos dentro de outputs, mapear / para /transcender.html e usar Content-Type correto para html, css, js, webp, mp3 e mp4. Bloquear caminhos cujo resolve não comece pelo diretório outputs.

~~~javascript
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve("outputs");
const port = Number(process.env.POTALA_PREVIEW_PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
};

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = pathname === "/" ? "transcender.html" : pathname.slice(1);
  const target = resolve(root, relative);
  if (target !== root && !target.startsWith(root + sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error("not-file");
    response.writeHead(200, { "Content-Type": types[extname(target)] || "application/octet-stream" });
    response.end(await readFile(target));
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log("Portal Potala: http://127.0.0.1:" + port + "/");
});
~~~

- [ ] **Step 5: Adicionar scripts sem alterar o script test existente**

~~~json
"test:portal": "node --test tests/potala/*.test.mjs",
"preview:portal": "node scripts/serve-outputs.mjs",
"validate:portal": "node scripts/validate-portal-assets.mjs"
~~~

- [ ] **Step 6: Rodar o teste e o smoke test do servidor**

Run: npm run test:portal  
Expected: 3 testes PASS.

Run: npm run preview:portal  
Expected: servidor informa http://127.0.0.1:4173/ e GET / responde 200.

- [ ] **Step 7: Commit**

~~~bash
git add package.json outputs/js/core scripts/serve-outputs.mjs tests/potala/travessia-state.test.mjs
git commit -m "test: establish travessia contracts"
~~~

---

### Task 2: Assets cinematográficos e orçamento de mídia

**Files:**
- Create: outputs/media/chegada-landscape.webp
- Create: outputs/media/chegada-depth.webp
- Create: outputs/media/chegada-landscape-mobile.webp
- Create: outputs/media/journey-quem-somos.webp
- Create: outputs/media/journey-cuidado.webp
- Create: outputs/media/journey-cultura.webp
- Create: outputs/media/journey-inspiracao.webp
- Create: scripts/validate-portal-assets.mjs

**Interfaces:**
- Produces: imagens sem texto, logo, botões ou UI.
- Produces: landscape 16:9, mobile 9:16, depth map alinhado ao landscape.
- Consumed by: arrival-scene.js e journey-data.js.

- [ ] **Step 1: Gerar a paisagem principal com ImageGen**

Usar este briefing, incluindo as duas imagens de referência já fornecidas na conversa:

~~~text
Paisagem cinematográfica fotorrealista para uma experiência contemplativa do Instituto Potala. Vale montanhoso ao amanhecer, névoa em camadas, luz dourada distante, árvores antigas e arquitetura de pedra muito sutil nas laterais. Um caminho quase invisível começa no primeiro plano e desaparece em direção às montanhas. Composição sofisticada e humana, ligeiramente mística sem símbolos esotéricos, amplo espaço negativo, profundidade clara de primeiro plano, plano médio e fundo. Paleta natural em azul frio, branco gelo, marrom mineral e dourado suave. Sem pessoas identificáveis, sem logotipo, sem letras, sem botões, sem molduras e sem qualquer elemento de interface. Proporção 16:9.
~~~

- [ ] **Step 2: Criar o mapa de profundidade correspondente**

Editar a paisagem aprovada mantendo exatamente a mesma geometria:

~~~text
Converta esta imagem em um mapa de profundidade técnico perfeitamente alinhado. Branco puro representa os objetos mais próximos; cinza médio representa o vale e a arquitetura; preto representa céu e montanhas distantes. Preserve todos os contornos e a composição pixel a pixel. Sem textura artística, sem texto, sem novos objetos.
~~~

- [ ] **Step 3: Criar o enquadramento mobile**

Editar a paisagem aprovada em 9:16, mantendo a luz distante e o início do caminho visíveis, sem inventar texto, logo ou UI.

- [ ] **Step 4: Gerar quatro encontros ambientais coerentes**

Gerar, na mesma linguagem, quatro imagens sem pessoas identificáveis nem alegações factuais:

1. journey-quem-somos.webp — pavilhão de pedra e árvore antiga, silencioso.
2. journey-cuidado.webp — espaço acolhedor vazio com luz quente e duas cadeiras discretas.
3. journey-cultura.webp — pavilhão aberto com lanternas, livros e instrumentos não destacados.
4. journey-inspiracao.webp — água, névoa e pequeno caminho desaparecendo ao longe.

Todas devem ser horizontais, sem texto, logo, botões ou interface.

- [ ] **Step 5: Apresentar os assets para aprovação antes de integrá-los**

Mostrar os sete arquivos no aplicativo. Se a paisagem principal não respeitar espaço negativo ou parecer poluída, fazer no máximo uma revisão dirigida antes de prosseguir.

- [ ] **Step 6: Implementar a validação de orçamento**

~~~javascript
// scripts/validate-portal-assets.mjs
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";

const budgets = new Map([
  ["outputs/media/chegada-landscape.webp", 1_800_000],
  ["outputs/media/chegada-depth.webp", 900_000],
  ["outputs/media/chegada-landscape-mobile.webp", 1_200_000],
  ["outputs/media/journey-quem-somos.webp", 900_000],
  ["outputs/media/journey-cuidado.webp", 900_000],
  ["outputs/media/journey-cultura.webp", 900_000],
  ["outputs/media/journey-inspiracao.webp", 900_000],
]);

for (const [file, maximum] of budgets) {
  const info = await stat(file);
  assert.ok(info.size > 10_000, file + " está vazio ou inválido");
  assert.ok(info.size <= maximum, file + " excede " + maximum + " bytes");
}
console.log("Assets Potala dentro do orçamento.");
~~~

- [ ] **Step 7: Comprimir somente se a validação falhar e rodar novamente**

Run: npm run validate:portal  
Expected: “Assets Potala dentro do orçamento.”

- [ ] **Step 8: Commit**

~~~bash
git add outputs/media scripts/validate-portal-assets.mjs
git commit -m "assets: add cinematic travessia imagery"
~~~

---

### Task 3: Primeiro marco visual — cena WebGL da Chegada

**Files:**
- Create: outputs/js/chegada/arrival-scene.js
- Create: outputs/js/chegada/arrival-controller.js
- Create: outputs/css/chegada-scene.css
- Create: tests/potala/arrival-scene.test.mjs
- Modify: outputs/transcender.html

**Interfaces:**
- Consumes: clamp, lerp, smoothstep; assets da Task 2.
- Produces: computeArrivalState(input).
- Produces: createArrivalScene(options) com setPointer, setScrollProgress, setBreathState, pause, resume e destroy.
- Emits: potala:scene-ready e potala:scene-fallback no document.

- [ ] **Step 1: Escrever o teste de estado visual que falha**

~~~javascript
import assert from "node:assert/strict";
import test from "node:test";
import { computeArrivalState } from "../../outputs/js/chegada/arrival-scene.js";

test("scroll abre névoa e revela o caminho sem salto", () => {
  assert.deepEqual(computeArrivalState({ scrollProgress: 0, phase: "idle" }), {
    camera: 0,
    depth: 0.18,
    fog: 0.76,
    light: 0.34,
    path: 0,
  });
  const end = computeArrivalState({ scrollProgress: 1, phase: "idle" });
  assert.ok(end.camera > 0.85);
  assert.ok(end.fog < 0.35);
  assert.equal(end.path, 1);
});

test("respiração altera o ambiente de forma limitada", () => {
  const inhale = computeArrivalState({ scrollProgress: 0.2, phase: "inhale" });
  const exhale = computeArrivalState({ scrollProgress: 0.2, phase: "exhale" });
  assert.ok(inhale.light > exhale.light);
  assert.ok(inhale.depth > exhale.depth);
  assert.ok(Math.abs(inhale.light - exhale.light) < 0.2);
});
~~~

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: node --test tests/potala/arrival-scene.test.mjs  
Expected: FAIL com ERR_MODULE_NOT_FOUND.

- [ ] **Step 3: Implementar computeArrivalState e os shaders**

Usar smoothstep no scroll e manter alterações da respiração dentro de amplitude pequena.

~~~javascript
export function computeArrivalState({ scrollProgress = 0, phase = "idle" }) {
  const progress = smoothstep(scrollProgress);
  const breath = {
    inhale: { depth: 0.06, fog: -0.07, light: 0.07 },
    hold: { depth: 0.04, fog: -0.05, light: 0.055 },
    exhale: { depth: -0.02, fog: 0.025, light: -0.025 },
    idle: { depth: 0, fog: 0, light: 0 },
    paused: { depth: 0, fog: 0, light: 0 },
  }[phase] || { depth: 0, fog: 0, light: 0 };
  return {
    camera: progress,
    depth: Number(clamp(0.18 + progress * 0.12 + breath.depth, 0.12, 0.38).toFixed(3)),
    fog: Number(clamp(0.76 - progress * 0.48 + breath.fog, 0.18, 0.82).toFixed(3)),
    light: Number(clamp(0.34 + progress * 0.22 + breath.light, 0.24, 0.66).toFixed(3)),
    path: Number(clamp((progress - 0.46) / 0.54).toFixed(3)),
  };
}
~~~

Fragment shader mínimo:

~~~glsl
precision mediump float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform vec2 uPointer;
uniform float uCamera;
uniform float uDepthAmount;
uniform float uFog;
uniform float uLight;
uniform float uTime;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  float depth = texture2D(uDepth, vUv).r;
  vec2 perspective = (depth - 0.5) *
    (uPointer * 0.026 + vec2(0.0, -uCamera * 0.018)) *
    uDepthAmount;
  vec2 uv = clamp(vUv + perspective, 0.002, 0.998);
  vec3 color = texture2D(uImage, uv).rgb;
  float mistBand = sin((vUv.y + uTime * 0.006) * 14.0) * 0.5 + 0.5;
  float mistNoise = hash(floor(vUv * vec2(42.0, 18.0)));
  float mist = smoothstep(0.36, 0.84, mistBand * 0.55 + mistNoise * 0.45) * uFog;
  vec3 fogColor = vec3(0.82, 0.86, 0.87);
  color = mix(color, fogColor, mist * (1.0 - depth) * 0.42);
  color *= 0.86 + uLight * 0.32;
  gl_FragColor = vec4(color, 1.0);
}
~~~

- [ ] **Step 4: Implementar o adaptador WebGL e fallback**

createArrivalScene deve:

- criar contexto webgl2, depois webgl;
- limitar canvas.width e canvas.height usando Math.min(devicePixelRatio, 1.5);
- carregar imagem e depth via fetch + createImageBitmap;
- disparar potala:scene-ready após o primeiro frame;
- ouvir webglcontextlost, cancelar o frame e ativar .is-scene-fallback;
- não criar segundo canvas;
- cancelar requestAnimationFrame em destroy.

- [ ] **Step 5: Transformar transcender.html no primeiro slice reconhecível**

Remover o data URI grande, ocultar o vídeo sem apagá-lo ainda e criar:

~~~html
<main class="arrival" id="arrival">
  <div class="arrival-sticky">
    <picture class="arrival-fallback">
      <source media="(max-width: 720px)" srcset="media/chegada-landscape-mobile.webp">
      <img src="media/chegada-landscape.webp" alt="Montanhas e névoa ao amanhecer">
    </picture>
    <canvas id="arrival-scene" aria-hidden="true"></canvas>
    <div class="arrival-mist" aria-hidden="true"></div>
    <div class="arrival-content">
      <button id="breath-launcher" type="button">Respirar</button>
      <div id="arrival-drag-slot"></div>
    </div>
  </div>
</main>
~~~

Importar chegada-scene.css e arrival-controller.js como module. Preservar temporariamente a marcação existente do drag e da respiração quando ela ainda for necessária para manter funcionalidade.

- [ ] **Step 6: Rodar testes**

Run: npm run test:portal  
Expected: testes de estado e cena PASS.

- [ ] **Step 7: Cumprir o primeiro meaningful preview**

Iniciar npm run preview:portal, fazer uma requisição HTTP a /transcender.html e só então abrir a URL local no navegador. Confirmar que paisagem, profundidade e affordance principal do drag aparecem, sem ampliar ainda a Home.

- [ ] **Step 8: Commit**

~~~bash
git add outputs/transcender.html outputs/js/chegada outputs/css/chegada-scene.css tests/potala/arrival-scene.test.mjs
git commit -m "feat: introduce interactive arrival scene"
~~~

---

### Task 4: Respiração opcional integrada à paisagem

**Files:**
- Create: outputs/js/chegada/breathing-timeline.js
- Create: tests/potala/breathing-timeline.test.mjs
- Modify: outputs/respiracao.js
- Modify: outputs/respiracao.css
- Modify: outputs/transcender.html

**Interfaces:**
- Produces: getBreathFrame(elapsedMs, totalCycles).
- Emits: potala:breath-state com detail { phase, cycle, totalCycles, remainingSeconds, progress }.
- Emits: potala:sound-state com detail { enabled } sempre que a preferência sonora mudar.
- Consumed by: arrival-controller.js.

- [ ] **Step 1: Escrever o teste completo do ciclo**

~~~javascript
import assert from "node:assert/strict";
import test from "node:test";
import { getBreathFrame } from "../../outputs/js/chegada/breathing-timeline.js";

test("mapeia as três fases de 3 segundos", () => {
  assert.equal(getBreathFrame(0).phase, "inhale");
  assert.equal(getBreathFrame(2_999).phase, "inhale");
  assert.equal(getBreathFrame(3_000).phase, "hold");
  assert.equal(getBreathFrame(6_000).phase, "exhale");
  assert.equal(getBreathFrame(9_000).cycle, 2);
});

test("completa exatamente oito ciclos", () => {
  const last = getBreathFrame(71_999);
  assert.equal(last.complete, false);
  const complete = getBreathFrame(72_000);
  assert.equal(complete.complete, true);
  assert.equal(complete.cycle, 8);
  assert.equal(complete.progress, 1);
});

test("a contagem restante é 3, 2, 1", () => {
  assert.equal(getBreathFrame(0).remainingSeconds, 3);
  assert.equal(getBreathFrame(1_001).remainingSeconds, 2);
  assert.equal(getBreathFrame(2_001).remainingSeconds, 1);
});
~~~

- [ ] **Step 2: Rodar e confirmar falha**

Run: node --test tests/potala/breathing-timeline.test.mjs  
Expected: FAIL com módulo ausente.

- [ ] **Step 3: Implementar o cálculo puro**

~~~javascript
const PHASE_DURATION = 3_000;
const PHASES = ["inhale", "hold", "exhale"];

export function getBreathFrame(elapsedMs, totalCycles = 8) {
  const totalDuration = PHASE_DURATION * PHASES.length * totalCycles;
  const elapsed = Math.max(0, Math.min(elapsedMs, totalDuration));
  const complete = elapsed >= totalDuration;
  if (complete) {
    return {
      phase: "complete",
      cycle: totalCycles,
      totalCycles,
      remainingSeconds: 0,
      progress: 1,
      complete: true,
    };
  }
  const absolutePhase = Math.floor(elapsed / PHASE_DURATION);
  const phaseElapsed = elapsed % PHASE_DURATION;
  return {
    phase: PHASES[absolutePhase % PHASES.length],
    cycle: Math.floor(absolutePhase / PHASES.length) + 1,
    totalCycles,
    remainingSeconds: Math.max(1, Math.ceil((PHASE_DURATION - phaseElapsed) / 1_000)),
    progress: elapsed / totalDuration,
    complete: false,
  };
}
~~~

- [ ] **Step 4: Refatorar respiracao.js sem alterar o relógio de pausa**

Substituir o cálculo duplicado por getBreathFrame. Ao mudar de fase, disparar:

~~~javascript
document.dispatchEvent(new CustomEvent("potala:breath-state", {
  detail: frame,
}));
~~~

Na pausa, guardar elapsed antes de cancelar o frame; na retomada, definir startedAt = performance.now() - pausedElapsed. O botão Recomeçar deve zerar pausedElapsed; Continuar não deve zerar. Ao mudar o som, emitir potala:sound-state. Ao receber potala:prepare-handoff, fazer fade até zero antes da navegação.

- [ ] **Step 5: Substituir dialog por interface integrada e inicialmente recolhida**

A marcação expandida deve usar section com hidden e aria-labelledby. O launcher é o único elemento inicial. Iniciar expande a seção; Sair recolhe; Escape recolhe; scroll e drag continuam ativos.

~~~html
<section class="breathing-guide" id="breathing-guide" aria-labelledby="breathing-phase" hidden>
  <p class="breathing-kicker">Respiração · Técnica 3-3-3</p>
  <div class="breathing-orb" id="breathing-orb" aria-hidden="true"></div>
  <p id="breathing-phase" aria-live="polite">PREPARE-SE</p>
  <p id="breathing-countdown">3</p>
  <p id="breathing-cycle">CICLO 0 DE 8</p>
  <div class="breathing-actions">
    <button id="breathing-restart" type="button">Recomeçar</button>
    <button id="breathing-start" type="button">Iniciar</button>
    <button id="breathing-stop" type="button">Pausar</button>
    <button id="breath-close" type="button">Sair</button>
  </div>
</section>
~~~

- [ ] **Step 6: Conectar o ambiente**

arrival-controller.js escuta potala:breath-state e chama scene.setBreathState(detail.phase). Em reduced motion, o canvas recebe apenas uLight; deslocamento e névoa permanecem estáticos.

- [ ] **Step 7: Rodar testes**

Run: npm run test:portal  
Expected: timeline, estado e cena PASS.

- [ ] **Step 8: Commit**

~~~bash
git add outputs/respiracao.js outputs/respiracao.css outputs/transcender.html outputs/js/chegada/breathing-timeline.js tests/potala/breathing-timeline.test.mjs
git commit -m "feat: integrate optional breathing into arrival"
~~~

---

### Task 5: Drag preservado e passagem Chegada → Home

**Files:**
- Create: outputs/js/chegada/drag-controller.js
- Create: outputs/js/chegada/transition-handoff.js
- Create: tests/potala/drag-controller.test.mjs
- Modify: outputs/transcender.html
- Modify: outputs/css/chegada-scene.css
- Modify: outputs/js/chegada/arrival-controller.js
- Modify: outputs/transcendido.html

**Interfaces:**
- Produces: dragProgress(startProgress, startX, currentX, travel).
- Produces: createDragController(element, options).
- Produces: enterHome({ entry, soundEnabled, destination }).
- Consumes: writeTravessiaState.

- [ ] **Step 1: Escrever o teste do drag**

~~~javascript
import assert from "node:assert/strict";
import test from "node:test";
import { dragProgress } from "../../outputs/js/chegada/drag-controller.js";

test("limita o drag entre zero e um", () => {
  assert.equal(dragProgress(0, 100, 50, 200), 0);
  assert.equal(dragProgress(0, 100, 400, 200), 1);
});

test("continua a partir do progresso atual", () => {
  assert.equal(dragProgress(0.25, 100, 150, 200), 0.5);
});
~~~

- [ ] **Step 2: Rodar e confirmar falha**

Run: node --test tests/potala/drag-controller.test.mjs  
Expected: FAIL com módulo ausente.

- [ ] **Step 3: Implementar dragProgress e createDragController**

O controlador deve usar Pointer Events, setPointerCapture, aria-valuenow e touch-action: pan-y. Completion ocorre em 0.985. Setas alteram 0.1; Home/End vão para 0/1; Espaço e Enter concluem com entry keyboard.

~~~javascript
export function dragProgress(startProgress, startX, currentX, travel) {
  return clamp(startProgress + (currentX - startX) / Math.max(1, travel));
}
~~~

- [ ] **Step 4: Implementar handoff idempotente**

~~~javascript
export function enterHome({
  entry,
  soundEnabled,
  destination = "transcendido.html",
}) {
  if (document.documentElement.dataset.transitioning === "true") return;
  document.documentElement.dataset.transitioning = "true";
  writeTravessiaState({ entry, soundEnabled });
  document.documentElement.classList.add("is-crossing");
  document.dispatchEvent(new CustomEvent("potala:prepare-handoff"));
  const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : 720;
  window.setTimeout(() => location.assign(destination), delay);
}
~~~

- [ ] **Step 5: Acionar a mesma passagem por scroll e drag**

arrival-controller deve medir o progresso de 0 a 1 dentro de 200svh. Ao atingir 0.995 descendo, chamar enterHome com entry scroll. Ao completar drag, chamar com entry drag. Não chamar ao voltar para cima.

- [ ] **Step 6: Criar continuidade visual**

Adicionar @view-transition { navigation: auto; } em CSS para navegadores compatíveis servidos via HTTP. A camada .arrival-transition-road cresce a partir do caminho final; transcendido.html inicia com .journey-entry-road no mesmo eixo. Em fallback, uma camada gelo opaca faz crossfade de 720ms sem preto.

- [ ] **Step 7: Testar histórico**

No navegador local: entrar por scroll, voltar, entrar por drag, voltar, avançar. Expected: botões do navegador mantêm comportamento nativo e nenhuma ação lateral é disparada.

- [ ] **Step 8: Rodar testes e commit**

Run: npm run test:portal  
Expected: todos PASS.

~~~bash
git add outputs/transcender.html outputs/transcendido.html outputs/css/chegada-scene.css outputs/js/chegada tests/potala/drag-controller.test.mjs
git commit -m "feat: connect arrival and home traversal"
~~~

---

### Task 6: Camada editorial configurável da Home

**Files:**
- Create: outputs/js/home/journey-data.js
- Create: tests/potala/journey-data.test.mjs
- Modify: outputs/transcendido.html

**Interfaces:**
- Produces: JOURNEY_REGIONS, JOURNEY_DISCOVERIES, findRelatedContent(id).
- Consumed by: home-scenes.js, journey-layout.js e lateral-exploration.js.

- [ ] **Step 1: Escrever o teste de dados**

~~~javascript
import assert from "node:assert/strict";
import test from "node:test";
import {
  JOURNEY_DISCOVERIES,
  JOURNEY_REGIONS,
  findRelatedContent,
} from "../../outputs/js/home/journey-data.js";

const expected = [
  "quem-somos",
  "atendimentos",
  "cursos",
  "atividades",
  "profissionais",
  "programacao",
  "arte-cultura",
  "inspiracao",
];

test("define exatamente as oito regiões na ordem narrativa", () => {
  assert.deepEqual(JOURNEY_REGIONS.map((region) => region.id), expected);
  assert.ok(JOURNEY_REGIONS.every((region) => region.href && region.href !== "#"));
});

test("drag lateral existe somente em duas regiões", () => {
  assert.deepEqual(
    JOURNEY_REGIONS.filter((region) => region.lateral).map((region) => region.id),
    ["atendimentos", "profissionais"],
  );
});

test("relações apontam para conteúdo existente", () => {
  const ids = new Set([
    ...JOURNEY_REGIONS.map((item) => item.id),
    ...JOURNEY_DISCOVERIES.map((item) => item.id),
  ]);
  for (const item of [...JOURNEY_REGIONS, ...JOURNEY_DISCOVERIES]) {
    assert.ok((item.relatedContent || []).every((id) => ids.has(id)));
  }
  assert.ok(findRelatedContent("sono-reflexao").length > 0);
});
~~~

- [ ] **Step 2: Rodar e confirmar falha**

Run: node --test tests/potala/journey-data.test.mjs  
Expected: FAIL com módulo ausente.

- [ ] **Step 3: Implementar as oito regiões**

Cada registro usa:

~~~javascript
{
  id: "atendimentos",
  type: "region",
  category: "O cuidado",
  title: "Atendimentos",
  description: "Cada pessoa chega com uma história diferente.",
  media: "media/journey-cuidado.webp",
  alt: "Espaço acolhedor iluminado suavemente",
  href: "atendimentos.html",
  priority: 90,
  tags: ["acolhimento", "orientação"],
  relatedContent: ["sono-reflexao", "saude-integrativa"],
  layoutVariant: "editorial-right",
  roadPlacement: "left",
  lateral: {
    left: ["primeira-visita", "atendimento-online"],
    right: ["saude-integrativa", "conteudo-relacionado"],
  },
}
~~~

As demais regiões seguem o mesmo contrato. Usar cultura.html para Arte e Cultura e páginas oficiais verificadas para rotas ainda ausentes. Antes do commit, abrir institutopotala.com e confirmar que todo link externo usado existe. Na ausência de rota oficial, usar a raiz oficial, nunca #.

- [ ] **Step 4: Implementar descobertas secundárias sem alegações temporais**

Criar composições neutras para Blog, Revista, Saúde Integrativa, Loja, Empresas, ação social e inspiração. Não inserir “hoje”, data, inscrição aberta ou nome de profissional sem verificação atual. O item sono-reflexao deve relacionar inspiração, saúde integrativa, atendimentos e cursos.

- [ ] **Step 5: Criar fallback HTML sem JavaScript**

transcendido.html deve conter main#journey-root e um noscript com lista semântica das oito regiões e seus links. O canvas permanece aria-hidden.

- [ ] **Step 6: Rodar testes e commit**

Run: npm run test:portal  
Expected: dados e relações PASS.

~~~bash
git add outputs/transcendido.html outputs/js/home/journey-data.js tests/potala/journey-data.test.mjs
git commit -m "feat: model potala journey content"
~~~

---

### Task 7: Estrada contínua com zonas seguras

**Files:**
- Create: outputs/js/home/journey-layout.js
- Create: outputs/js/home/home-road.js
- Create: tests/potala/journey-layout.test.mjs
- Modify: outputs/secoes.js
- Modify: outputs/secoes.css

**Interfaces:**
- Produces: buildJourneyLayout(regions, viewport).
- Produces: sampleSegment(segment, progress).
- Produces: createHomeRoad(canvas, options).
- Consumes: JOURNEY_REGIONS e math.js.

- [ ] **Step 1: Escrever testes de continuidade e segurança**

~~~javascript
import assert from "node:assert/strict";
import test from "node:test";
import { buildJourneyLayout } from "../../outputs/js/home/journey-layout.js";
import { JOURNEY_REGIONS } from "../../outputs/js/home/journey-data.js";

test("cada região fica no centro de um trecho reto", () => {
  const layout = buildJourneyLayout(JOURNEY_REGIONS, { width: 1440, height: 900 });
  for (const checkpoint of layout.checkpoints) {
    assert.equal(checkpoint.segmentKind, "straight");
    assert.ok(checkpoint.clearance >= 900 * 0.62);
  }
});

test("segmentos se conectam sem lacunas", () => {
  const layout = buildJourneyLayout(JOURNEY_REGIONS, { width: 1440, height: 900 });
  layout.segments.slice(1).forEach((segment, index) => {
    assert.deepEqual(segment.from, layout.segments[index].to);
  });
});

test("mobile mantém painel e estrada em lados opostos", () => {
  const layout = buildJourneyLayout(JOURNEY_REGIONS, { width: 390, height: 844 });
  for (const checkpoint of layout.checkpoints) {
    assert.notEqual(Math.sign(checkpoint.roadOffsetX), Math.sign(checkpoint.panelOffsetX));
  }
});
~~~

- [ ] **Step 2: Rodar e confirmar falha**

Run: node --test tests/potala/journey-layout.test.mjs  
Expected: FAIL com módulo ausente.

- [ ] **Step 3: Implementar a rota por segmentos**

buildJourneyLayout cria para cada região um straight longo, checkpoint no centro e uma transição posterior. Usar padrão de direção variado:

~~~javascript
const DIRECTIONS = [
  { x: 0, y: 1 },
  { x: 0.42, y: 0.91 },
  { x: -0.38, y: 0.92 },
  { x: 1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -0.36, y: 0.93 },
  { x: 0, y: 1 },
];
~~~

Cada straight deve medir no mínimo 1.75 vezes a maior dimensão da viewport; cada curva fica entre straights e tem safety clearance de 0.62 vezes a altura. A estrada começa e termina 2.2 alturas além do primeiro/último checkpoint para esconder caps circulares.

- [ ] **Step 4: Implementar home-road.js**

O renderer deve:

- usar um único canvas fixed, aria-hidden;
- limitar DPR a 1.5;
- construir Path2D para acostamento, asfalto e faixa;
- usar lineCap round somente com caps fora da viewport;
- redesenhar apenas se progress, viewport ou tema mudar;
- cancelar o frame em destroy;
- reagir a visibilitychange;
- não aplicar filtros grandes animados.

- [ ] **Step 5: Substituir secoes.js por bootstrap modular**

Remover wheelTailFrame, wheelTailTimer, handleStoryWheel e o listener wheel passive false. secoes.js deve somente importar e chamar home-controller.js quando body[data-story-page=true], preservando a inicialização das páginas secundárias existentes em uma função legacy isolada.

- [ ] **Step 6: Rodar testes**

Run: npm run test:portal  
Expected: continuidade, clearance e mobile PASS.

- [ ] **Step 7: Commit**

~~~bash
git add outputs/js/home/journey-layout.js outputs/js/home/home-road.js outputs/secoes.js outputs/secoes.css tests/potala/journey-layout.test.mjs
git commit -m "feat: rebuild continuous journey road"
~~~

---

### Task 8: Regiões, silêncio e descobertas da Home

**Files:**
- Create: outputs/js/home/home-scenes.js
- Create: outputs/js/home/home-controller.js
- Create: outputs/css/home-journey.css
- Modify: outputs/transcendido.html
- Modify: outputs/secoes.css

**Interfaces:**
- Produces: mountJourney(root, data).
- Produces: createHomeController({ root, canvas, data }).
- Consumes: JOURNEY_REGIONS, JOURNEY_DISCOVERIES, buildJourneyLayout e createHomeRoad.

- [ ] **Step 1: Montar oito regiões com variantes editoriais**

mountJourney cria uma section por região com min-height entre 190svh e 240svh e stage sticky. Variantes:

- Quem Somos: fotografia grande e uma frase.
- Atendimentos: texto ao lado oposto da estrada e uma pequena descoberta.
- Cursos: tipografia grande e detalhe visual discreto.
- Atividades: composição mais aberta e dois elementos em movimento leve.
- Profissionais: retrato neutro/arquitetura enquanto não houver profissional verificado.
- Programação: composição tipográfica sem evento inventado.
- Arte e Cultura: imagem estratégica e pontos de luz.
- Inspiração: frase curta, grande área vazia e estrada desaparecendo.

Cada region recebe data-region-id, data-layout-variant e um link semântico real.

- [ ] **Step 2: Inserir trechos de silêncio**

Entre regiões, criar div.journey-silence com aria-hidden e altura de 70svh a 110svh. Curvas só aparecem nesses intervalos. No máximo uma frase de transição em quatro dos sete intervalos:

1. “Conhecer também é uma forma de chegar.”
2. “Cuidar também é aprender.”
3. “Conhecimento também precisa ser vivido.”
4. “Você não precisa conhecer tudo hoje.”

- [ ] **Step 3: Implementar presença com platô longo**

A visibilidade não deve piscar no centro. Usar:

~~~javascript
export function presenceForDistance(distance, viewportHeight) {
  const hold = viewportHeight * 0.34;
  const release = viewportHeight * 0.92;
  if (distance <= hold) return 1;
  return 1 - smoothstep((distance - hold) / (release - hold));
}
~~~

O conteúdo entra por 480–700ms, fica estável no platô e sai por 700–900ms. reduced motion remove transform e mantém fade de no máximo 120ms.

- [ ] **Step 4: Montar pontos de luz variados**

Cada discovery é button ou link com aria-label. Alternar apresentações entre brilho ambiental, frase, detalhe fotográfico e objeto CSS simples. Não usar pins iguais. Abrir uma revelação curta adjacente, sem dialog modal e sem bloquear a estrada.

- [ ] **Step 5: Criar ciclo único da Home**

home-controller registra scroll passivo, marca dirty e usa um único requestAnimationFrame para:

- ler scrollTop e viewport;
- atualizar câmera/estrada;
- atualizar presença das regiões;
- atualizar no máximo os pontos de luz próximos;
- pausar ao esconder a aba.

Não suavizar scrollTop nem alterar body.scrollTop.

- [ ] **Step 6: Integrar estado de entrada e som**

consumeHandoff define classe entry-from-arrival por um frame e mostra controle discreto “Retomar som” somente se soundEnabled for true. Não iniciar áudio automaticamente.

- [ ] **Step 7: Teste visual do ritmo**

No preview local, percorrer a Home em desktop e confirmar: oito regiões, sete silêncios, nenhum painel sobre estrada, nenhuma curva sob informação e ausência de repetição visual.

- [ ] **Step 8: Commit**

~~~bash
git add outputs/transcendido.html outputs/secoes.css outputs/css/home-journey.css outputs/js/home/home-scenes.js outputs/js/home/home-controller.js
git commit -m "feat: compose editorial home journey"
~~~

---

### Task 9: Exploração lateral elástica

**Files:**
- Create: outputs/js/home/lateral-exploration.js
- Create: tests/potala/lateral-exploration.test.mjs
- Modify: outputs/js/home/home-scenes.js
- Modify: outputs/css/home-journey.css

**Interfaces:**
- Produces: elasticOffset(delta, limit), createLateralExploration(element, options).
- Consumes: lateral de journey-data.

- [ ] **Step 1: Escrever o teste da elasticidade**

~~~javascript
import assert from "node:assert/strict";
import test from "node:test";
import { elasticOffset } from "../../outputs/js/home/lateral-exploration.js";

test("mantém deslocamento dentro do limite com resistência", () => {
  assert.equal(elasticOffset(0, 300), 0);
  assert.ok(elasticOffset(600, 300) < 300);
  assert.ok(elasticOffset(-600, 300) > -300);
});

test("é simétrico", () => {
  assert.equal(elasticOffset(180, 300), -elasticOffset(-180, 300));
});
~~~

- [ ] **Step 2: Rodar e confirmar falha**

Run: node --test tests/potala/lateral-exploration.test.mjs  
Expected: FAIL com módulo ausente.

- [ ] **Step 3: Implementar a curva elástica**

~~~javascript
export function elasticOffset(delta, limit) {
  const sign = Math.sign(delta);
  const magnitude = Math.abs(delta);
  return sign * limit * (1 - Math.exp(-magnitude / Math.max(1, limit)));
}
~~~

- [ ] **Step 4: Implementar Pointer Events sem conflito vertical**

Ativar somente depois de 12px de intenção horizontal e quando abs(deltaX) > abs(deltaY) * 1.25. Antes disso, não chamar preventDefault. Depois da ativação, capturar ponteiro e atualizar --lateral-x. No release, animar para 0 em 620ms com cubic-bezier(.16,1,.3,1).

- [ ] **Step 5: Implementar teclado**

Seta esquerda/direita revela o respectivo lado; Escape e seta para a estrada retornam ao centro. aria-expanded indica quando há conteúdo lateral aberto. A ordem de tabulação permanece lógica.

- [ ] **Step 6: Montar somente em Atendimentos e Profissionais**

home-scenes valida region.lateral antes de criar o controlador. Nenhuma outra região recebe listeners de drag.

- [ ] **Step 7: Rodar testes e commit**

Run: npm run test:portal  
Expected: elasticidade e simetria PASS.

~~~bash
git add outputs/js/home/lateral-exploration.js outputs/js/home/home-scenes.js outputs/css/home-journey.css tests/potala/lateral-exploration.test.mjs
git commit -m "feat: add optional lateral discoveries"
~~~

---

### Task 10: Acessibilidade, fallbacks e integração estática

**Files:**
- Create: tests/potala/portal-html.test.mjs
- Modify: outputs/transcender.html
- Modify: outputs/transcendido.html
- Modify: outputs/respiracao.css
- Modify: outputs/css/chegada-scene.css
- Modify: outputs/css/home-journey.css
- Modify: outputs/js/chegada/arrival-controller.js
- Modify: outputs/js/home/home-controller.js
- Delete: outputs/media/chegada.mp4 após aprovação final da imagem, do WebGL e do fallback

**Interfaces:**
- Verifies: semântica, mídia fallback, módulos e ausência de autoplay/scroll interception.

- [ ] **Step 1: Escrever testes HTML que falham**

~~~javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chegada = await readFile("outputs/transcender.html", "utf8");
const home = await readFile("outputs/transcendido.html", "utf8");
const homeJs = await readFile("outputs/secoes.js", "utf8");

test("respiração é opt-in e o fallback visual existe", () => {
  assert.match(chegada, /id="breath-launcher"/);
  assert.match(chegada, /id="breathing-guide"[^>]*hidden/);
  assert.match(chegada, /chegada-landscape\.webp/);
  assert.doesNotMatch(chegada, /<audio[^>]*autoplay/i);
});

test("drag e canvas têm semântica correta", () => {
  assert.match(chegada, /aria-valuemin="0"/);
  assert.match(chegada, /aria-valuemax="100"/);
  assert.match(chegada, /id="arrival-scene"[^>]*aria-hidden="true"/);
});

test("home mantém fallback e não intercepta wheel", () => {
  assert.match(home, /<noscript>/);
  assert.match(home, /id="journey-road"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(homeJs, /addEventListener\(["']wheel["']/);
  assert.doesNotMatch(homeJs, /handleStoryWheel|wheelTailFrame|wheelTailTimer/);
});
~~~

- [ ] **Step 2: Rodar e confirmar as falhas específicas**

Run: node --test tests/potala/portal-html.test.mjs  
Expected: FAIL nos atributos/contratos ainda ausentes; não aceitar erro de sintaxe.

- [ ] **Step 3: Completar semântica e foco**

Adicionar skip link na Home, foco visível, lang pt-BR, títulos únicos, aria-live apenas para mudança de fase, alt das quatro imagens, aria-hidden nos canvas e decorative layers, e aria-current quando uma região estiver centralizada.

- [ ] **Step 4: Completar reduced motion**

Em reduced motion:

- chegada usa imagem estática;
- não inicia loop WebGL;
- respiração altera somente texto/luz CSS;
- estrada é desenhada sem dash animado;
- regiões aparecem sem parallax;
- drag mantém feedback de progresso sem elasticidade prolongada.

- [ ] **Step 5: Completar fallback e cleanup**

Quando WebGL falhar: adicionar is-scene-fallback, mostrar picture, continuar scroll/drag/respiração. Em pagehide: cancelar frames, observers, audio fades e listeners. Em pageshow: reativar apenas controladores destruídos. Depois que a cena e o fallback forem aprovados no preview, remover outputs/media/chegada.mp4 e confirmar por busca que nenhum HTML, CSS ou JavaScript ainda o referencia; o Git mantém recuperação histórica.

- [ ] **Step 6: Garantir orçamento de execução**

Confirmar por código:

- um canvas na Chegada e um na Home;
- nenhuma leitura de pixels por frame;
- DPR máximo 1.5;
- imagens Home loading=lazy e decoding=async;
- listener scroll passivo;
- visibilitychange pausa loops.

- [ ] **Step 7: Rodar testes**

Run: npm run test:portal  
Expected: todos os testes PASS.

Run: npm run validate:portal  
Expected: assets dentro do orçamento.

- [ ] **Step 8: Commit**

~~~bash
git add outputs tests/potala/portal-html.test.mjs
git commit -m "fix: harden travessia accessibility and fallbacks"
~~~

---

### Task 11: Validação integral e entrega local

**Files:**
- Modify only if validation reveals a concrete defect in files from Tasks 1–10.
- Review: docs/superpowers/specs/2026-08-20-potala-travessia-design.md
- Review: docs/superpowers/plans/2026-08-20-potala-travessia.md

**Interfaces:**
- Consumes: toda a implementação.
- Produces: evidência de testes, QA visual e estado Git limpo.

- [ ] **Step 1: Rodar a suíte da superfície Potala**

Run: npm run test:portal  
Expected: todos PASS, zero skipped.

- [ ] **Step 2: Rodar orçamento de mídia**

Run: npm run validate:portal  
Expected: todos os sete assets presentes e abaixo dos limites.

- [ ] **Step 3: Verificar formatação Git**

Run: git diff --check  
Expected: nenhuma saída.

- [ ] **Step 4: Rodar build do projeto hospedeiro sem modificá-lo**

Run: npm run build  
Expected: exit 0. Se falhar por problema preexistente em app, registrar separadamente e não alterar app para mascarar a falha.

- [ ] **Step 5: Iniciar preview e validar Chegada em desktop**

Usar a habilidade browser:control-in-app-browser porque o usuário pediu validação visual. Verificar:

- cena carrega sem erro;
- mouse move a perspectiva sutilmente;
- “Respirar” é discreto e nada inicia sozinho;
- 3-3-3, pausa, retomada, reinício e saída;
- som permanece mudo até ação;
- scroll revela caminho;
- drag, Espaço e Enter atravessam;
- voltar/avançar do navegador funcionam.

- [ ] **Step 6: Validar Home em desktop**

Verificar:

- estrada contínua;
- oito regiões na ordem;
- conteúdo sempre fora da estrada e das curvas;
- regiões permanecem tempo suficiente;
- scroll nativo sem atraso ou cauda;
- drag lateral somente em Atendimentos e Profissionais;
- pontos de luz acessíveis;
- estrada continua além do final.

- [ ] **Step 7: Validar mobile/touch e resize**

Testar largura aproximada de 390px e orientação horizontal:

- fallback/crop correto;
- drag não bloqueia scroll vertical;
- respiração cabe na viewport;
- estrada e informação ficam em lados opostos;
- links e controles têm alvo adequado;
- não há overflow horizontal acidental.

- [ ] **Step 8: Validar reduced motion e falha WebGL**

Emular prefers-reduced-motion e bloquear o contexto WebGL. Expected: imagem estática, controles funcionais, navegação completa, sem tela vazia.

- [ ] **Step 9: Corrigir somente defeitos reproduzidos e repetir a verificação afetada**

Cada correção deve incluir teste de regressão quando o comportamento puder ser isolado em módulo puro ou HTML estático.

- [ ] **Step 10: Commit final de correções, se houver**

~~~bash
git add outputs tests scripts package.json
git commit -m "fix: finalize potala traversal experience"
~~~

- [ ] **Step 11: Entregar resumo sem publicar**

Informar:

- arquivos e subsistemas alterados;
- testes executados e resultados;
- assets gerados e aprovados;
- conteúdo que ainda depende de backend ou confirmação institucional;
- commit final;
- que GitHub/Vercel/Sites não foram atualizados porque publicação exige autorização explícita.
