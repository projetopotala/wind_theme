import { createArrivalScene } from "../chegada/arrival-scene.js";
import { createSceneClock } from "../chegada/scene-clock.js";
import { crossTo } from "../chegada/transition-handoff.js";
import { readTravessiaState } from "../core/travessia-state.js";
import { PALACE_PROFILE, selectPalaceAssets } from "./palace-profile.js";
import { advanceHold, createHoldState, zoomForProgress } from "./hold-to-return.js";

const visual = document.getElementById("palace-visual");
const canvas = document.getElementById("palace-scene");
const button = document.getElementById("palace-return");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

if (visual && canvas && button) {
  // O palácio não tem controle de som próprio: só repassa adiante o que a
  // Home gravou ao cruzar para cá. Sem ler isto, `crossTo` usaria o padrão
  // (desligado) e apagaria a preferência do visitante ao fechar o círculo.
  const soundEnabled = readTravessiaState().soundEnabled === true;

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
    if (state.completed && !crossed) {
      crossed = true;
      // O destino é a Chegada: é ela que fecha o círculo da travessia, não a
      // página anterior do palácio.
      crossTo({ destination: "transcender.html", soundEnabled });
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

  const onVisibilityChange = () => {
    if (document.hidden) { clock.stop(); scene.pause(); }
    else { clock.resetTime(); scene.resume(); clock.start(); }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  const cleanup = () => {
    clock.stop();
    scene.destroy();
    removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
  };

  /*
   * O bfcache pode devolver esta página com o heap intacto: o visitante segura
   * até o fim, `crossTo` já marcou `data-transitioning` e navegou para
   * transcender.html, e ao apertar "voltar" o Chrome restaura palacio.html do
   * cache sem recarregar — `hold` continua `{ progress: 1, completed: true }`,
   * `crossed` continua `true` e o `<html>`/`<body>` continuam com as classes de
   * travessia. Sem desarmar isso aqui, o anel fica cheio, o zoom no máximo, e
   * o botão não responde mais: nem segurar nem Enter completam de novo, porque
   * o guard local (`crossed`) já foi consumido e `crossTo` também recusa uma
   * segunda travessia enquanto `data-transitioning` estiver setado. Espelha o
   * mesmo mecanismo já usado em arrival-controller.js e home-controller.js.
   */
  const onPageHide = (event) => {
    if (event.persisted) {
      clock.stop();
      scene.pause();
    } else {
      cleanup();
    }
  };
  const onPageShow = (event) => {
    if (!event.persisted) return;
    delete document.documentElement.dataset.transitioning;
    document.documentElement.classList.remove("is-crossing");
    document.body.classList.remove("is-arrival-transitioning");
    hold = createHoldState();
    holding = false;
    crossed = false;
    applyHold(hold);
    clock.resetTime();
    scene.resume();
    clock.start();
  };
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);

  // O relógio inicia mesmo quando o WebGL falha: `scene.render()` já retorna
  // cedo se a cena não carregou, e é justamente no fallback fotográfico que o
  // gesto de segurar (anel, zoom) mais precisa continuar funcionando — sem
  // isso só o teclado completaria o retorno, porque `applyHold` roda dentro
  // do `tick()` do relógio, não do listener de ponteiro.
  scene.ready.then(() => {
    clock.start();
  });
}
