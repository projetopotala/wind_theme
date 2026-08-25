import { getBreathFrame } from "./js/chegada/breathing-timeline.js";
import { planSoundToggle } from "./js/chegada/ambient-sound.js";

const totalCycles = 8;
const guide = document.getElementById("breathing-guide");
const launcher = document.getElementById("breath-launcher");
const closeButton = document.getElementById("breath-close");
const startButton = document.getElementById("breathing-start");
const stopButton = document.getElementById("breathing-stop");
const restartButton = document.getElementById("breathing-restart");
const phaseLabel = document.getElementById("breathing-phase");
const countdown = document.getElementById("breathing-countdown");
const cycleLabel = document.getElementById("breathing-cycle");
const progressSegments = [...document.querySelectorAll(".breathing-track > span")];
const soundButton = document.getElementById("ambient-sound");
const ambientAudio = document.getElementById("ambient-audio");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const phaseLabels = {
  inhale: "INSPIRE",
  hold: "SEGURE",
  exhale: "EXPIRE",
  complete: "CONCLUÍDO",
  paused: "PAUSADO",
};

let running = false;
let paused = false;
let startedAt = 0;
let pausedElapsed = 0;
let frameId = 0;
let lastAnnouncement = "";
let soundEnabled = false;
let soundFadeId = 0;
let closingTimer = 0;

function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

function announce(frame) {
  const signature = `${frame.phase}:${frame.cycle}:${frame.remainingSeconds}`;
  if (signature === lastAnnouncement) return;
  lastAnnouncement = signature;
  emit("potala:breath-state", frame);
}

function renderProgress(frame) {
  const cycleProgress = frame.progress * totalCycles;
  progressSegments.forEach((segment, index) => {
    const value = Math.max(0, Math.min(1, cycleProgress - index));
    segment.style.setProperty("--segment-progress", value.toFixed(4));
  });
}

function render(frame) {
  guide.dataset.phase = frame.phase;
  phaseLabel.textContent = phaseLabels[frame.phase] || "PREPARE-SE";
  countdown.textContent = frame.complete ? "✓" : String(frame.remainingSeconds);
  cycleLabel.textContent = `CICLO ${frame.complete ? totalCycles : frame.cycle} DE ${totalCycles}`;
  guide.style.setProperty("--breath-phase-progress", frame.phaseProgress ?? 0);
  renderProgress(frame);
  announce(frame);
}

function resetView() {
  cancelAnimationFrame(frameId);
  running = false;
  paused = false;
  pausedElapsed = 0;
  lastAnnouncement = "";
  guide.dataset.phase = "idle";
  phaseLabel.textContent = "PREPARE-SE";
  countdown.textContent = "3";
  cycleLabel.textContent = `CICLO 0 DE ${totalCycles}`;
  guide.style.setProperty("--breath-phase-progress", 0);
  progressSegments.forEach((segment) => segment.style.setProperty("--segment-progress", 0));
  startButton.hidden = false;
  startButton.textContent = "Iniciar";
  stopButton.hidden = true;
  stopButton.textContent = "Pausar";
  restartButton.hidden = true;
  emit("potala:breath-state", { ...getBreathFrame(0, totalCycles), phase: "idle" });
}

function completeSession() {
  running = false;
  paused = false;
  frameId = 0;
  pausedElapsed = 72_000;
  render(getBreathFrame(pausedElapsed, totalCycles));
  startButton.hidden = false;
  startButton.textContent = "Repetir";
  stopButton.hidden = true;
  restartButton.hidden = true;
}

function update(now) {
  if (!running) return;
  pausedElapsed = Math.max(0, now - startedAt);
  const frame = getBreathFrame(pausedElapsed, totalCycles);
  render(frame);
  if (frame.complete) {
    completeSession();
    return;
  }
  frameId = requestAnimationFrame(update);
}

function startSession() {
  if (running) return;
  if (getBreathFrame(pausedElapsed, totalCycles).complete) pausedElapsed = 0;
  startedAt = performance.now() - pausedElapsed;
  running = true;
  paused = false;
  startButton.hidden = true;
  stopButton.hidden = false;
  stopButton.textContent = "Pausar";
  restartButton.hidden = false;
  frameId = requestAnimationFrame(update);
}

function togglePause() {
  if (running) {
    pausedElapsed = Math.max(0, performance.now() - startedAt);
    running = false;
    paused = true;
    cancelAnimationFrame(frameId);
    frameId = 0;
    const current = getBreathFrame(pausedElapsed, totalCycles);
    guide.dataset.phase = "paused";
    phaseLabel.textContent = phaseLabels.paused;
    stopButton.textContent = "Continuar";
    emit("potala:breath-state", { ...current, phase: "paused" });
    return;
  }
  if (paused) startSession();
}

function restartSession() {
  resetView();
  startSession();
}

function openGuide() {
  clearTimeout(closingTimer);
  guide.hidden = false;
  guide.classList.remove("is-closing");
  launcher.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => guide.classList.add("is-open"));
  startButton.focus({ preventScroll: true });
}

function closeGuide({ restoreFocus = true } = {}) {
  if (running) togglePause();
  guide.classList.remove("is-open");
  guide.classList.add("is-closing");
  launcher.setAttribute("aria-expanded", "false");
  closingTimer = window.setTimeout(() => {
    guide.hidden = true;
    guide.classList.remove("is-closing");
    if (restoreFocus) launcher.focus({ preventScroll: true });
  }, reducedMotion ? 0 : 360);
}

function updateSoundButton() {
  soundButton.classList.toggle("is-on", soundEnabled);
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  soundButton.setAttribute("aria-label", soundEnabled ? "Desativar som ambiente" : "Ativar som ambiente");
  emit("potala:sound-state", { enabled: soundEnabled });
}

function fadeSound(target, duration = 420, onComplete) {
  cancelAnimationFrame(soundFadeId);
  const initial = ambientAudio.volume;
  const start = performance.now();
  const activeDuration = reducedMotion ? 0 : duration;
  if (!activeDuration) {
    ambientAudio.volume = target;
    onComplete?.();
    return;
  }
  const step = (now) => {
    const progress = Math.min(1, (now - start) / activeDuration);
    const eased = 1 - (1 - progress) ** 3;
    ambientAudio.volume = initial + (target - initial) * eased;
    if (progress < 1) soundFadeId = requestAnimationFrame(step);
    else onComplete?.();
  };
  soundFadeId = requestAnimationFrame(step);
}

async function toggleSound() {
  const plan = planSoundToggle({ enabled: soundEnabled, paused: ambientAudio.paused });
  if (plan.action === "disable") {
    soundEnabled = false;
    updateSoundButton();
    fadeSound(0, 360, () => ambientAudio.pause());
    return;
  }
  ambientAudio.volume = plan.startVolume;
  try {
    await ambientAudio.play();
    soundEnabled = true;
    updateSoundButton();
    fadeSound(plan.targetVolume, 520);
  } catch {
    soundEnabled = false;
    updateSoundButton();
  }
}

launcher?.addEventListener("click", openGuide);
closeButton?.addEventListener("click", () => closeGuide());
startButton?.addEventListener("click", startSession);
stopButton?.addEventListener("click", togglePause);
restartButton?.addEventListener("click", restartSession);
soundButton?.addEventListener("click", toggleSound);

document.addEventListener("potala:world-action", (event) => {
  if (event.detail?.action === "breathe") openGuide();
});
closeButton?.addEventListener("click", () => closeGuide());
startButton?.addEventListener("click", startSession);
stopButton?.addEventListener("click", togglePause);
restartButton?.addEventListener("click", restartSession);
soundButton?.addEventListener("click", toggleSound);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !guide.hidden) closeGuide();
});

document.addEventListener("potala:prepare-handoff", () => {
  if (!soundEnabled) return;
  fadeSound(0, 500, () => ambientAudio.pause());
});

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(frameId);
  cancelAnimationFrame(soundFadeId);
  clearTimeout(closingTimer);
}, { once: true });

resetView();
updateSoundButton();
