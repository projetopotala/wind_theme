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
      // O destino é a Chegada: é ela que fecha o círculo da travessia, não a
      // página anterior do palácio.
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
