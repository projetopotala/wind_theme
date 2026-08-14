(() => {
  "use strict";

  if (document.getElementById("breathing-dialog")) return;

  document.body.insertAdjacentHTML("afterbegin", `
    <button class="ambient-sound" id="ambient-sound" type="button"
      aria-label="Ativar música de fundo" aria-pressed="false">
      <span class="ambient-sound-bars" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
      <span class="ambient-sound-label">SOM</span>
    </button>
    <audio id="ambient-audio" src="musica-fundo.mp3" loop preload="none"></audio>

    <button class="breath-launcher" id="breath-launcher" type="button"
      aria-haspopup="dialog" aria-controls="breathing-dialog" aria-expanded="false">
      <span class="breath-launcher-mark" aria-hidden="true"></span>
      <span class="breath-launcher-label">RESPIRAR</span>
    </button>

    <dialog class="breathing-dialog" id="breathing-dialog" aria-labelledby="breathing-title">
      <div class="breathing-shell">
        <button class="breath-close" id="breath-close" type="button" aria-label="Fechar guia de respiração">
          <span aria-hidden="true"></span>
        </button>

        <header class="breathing-header">
          <h1 class="breathing-title" id="breathing-title">RESPIRAÇÃO</h1>
          <p class="breathing-technique">TÉCNICA 3-3-3</p>
          <p class="breathing-duration">8 ciclos · 1 minuto e 12 segundos</p>
        </header>

        <div class="breathing-visual" aria-hidden="true">
          <span class="breathing-ring breathing-ring-one"></span>
          <span class="breathing-ring breathing-ring-two"></span>
          <div class="breathing-orb" id="breathing-orb">
            <span class="breathing-countdown" id="breathing-countdown">3</span>
          </div>
        </div>

        <div class="breathing-copy" id="breathing-copy" role="status" aria-live="polite" aria-atomic="true">
          <p class="breathing-phase" id="breathing-phase">PREPARE-SE</p>
          <p class="breathing-instruction" id="breathing-instruction"></p>
        </div>

        <div class="breathing-progress-meta">
          <p class="breathing-cycle" id="breathing-cycle">CICLO 0 DE 8</p>
        </div>
        <div class="breathing-track" aria-hidden="true">
          <span class="breathing-segment"><span class="breathing-segment-fill"></span></span>
          <span class="breathing-segment"><span class="breathing-segment-fill"></span></span>
          <span class="breathing-segment"><span class="breathing-segment-fill"></span></span>
          <span class="breathing-segment"><span class="breathing-segment-fill"></span></span>
          <span class="breathing-segment"><span class="breathing-segment-fill"></span></span>
          <span class="breathing-segment"><span class="breathing-segment-fill"></span></span>
          <span class="breathing-segment"><span class="breathing-segment-fill"></span></span>
          <span class="breathing-segment"><span class="breathing-segment-fill"></span></span>
        </div>

        <div class="breathing-actions">
          <button class="breath-action breath-action-restart" id="breathing-restart" type="button" hidden>RECOMEÇAR</button>
          <button class="breath-action" id="breathing-start" type="button">INICIAR</button>
          <button class="breath-action breath-action-stop" id="breathing-stop" type="button" hidden>PAUSAR</button>
        </div>
      </div>
    </dialog>
  `);

  const totalCycles = 8;
  const phaseDuration = 3000;
  const cycleDuration = phaseDuration * 3;
  const totalDuration = cycleDuration * totalCycles;
  const phaseClasses = ["phase-inhale", "phase-hold", "phase-exhale", "phase-complete"];
  const phases = [
    { className: "phase-inhale", label: "INSPIRE", instruction: "Puxe o ar suavemente pelo nariz." },
    { className: "phase-hold", label: "SEGURE", instruction: "Mantenha o ar sem criar tensão." },
    { className: "phase-exhale", label: "EXPIRE", instruction: "Solte o ar devagar e relaxe o corpo." }
  ];

  const launcher = document.getElementById("breath-launcher");
  const soundButton = document.getElementById("ambient-sound");
  const ambientAudio = document.getElementById("ambient-audio");
  const dialog = document.getElementById("breathing-dialog");
  const closeButton = document.getElementById("breath-close");
  const restartButton = document.getElementById("breathing-restart");
  const startButton = document.getElementById("breathing-start");
  const stopButton = document.getElementById("breathing-stop");
  const orb = document.getElementById("breathing-orb");
  const countdown = document.getElementById("breathing-countdown");
  const breathingCopy = document.getElementById("breathing-copy");
  const phaseLabel = document.getElementById("breathing-phase");
  const phaseInstruction = document.getElementById("breathing-instruction");
  const cycleLabel = document.getElementById("breathing-cycle");
  const progressSegments = [...document.querySelectorAll(".breathing-segment-fill")];

  let running = false;
  let startedAt = 0;
  let animationFrame = 0;
  let currentAbsolutePhase = -1;
  let paused = false;
  let pausedElapsed = 0;
  let closing = false;
  let closeTimer = 0;
  let phaseCopyTimer = 0;
  let audioFadeFrame = 0;
  let soundEnabled = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const closeDelay = reducedMotion ? 0 : 520;
  const phaseCopyDelay = reducedMotion ? 0 : 240;
  const ambientVolume = 0.3;

  function updateSoundButton() {
    soundButton.classList.toggle("is-on", soundEnabled);
    soundButton.setAttribute("aria-pressed", String(soundEnabled));
    soundButton.setAttribute("aria-label", soundEnabled ? "Desativar música de fundo" : "Ativar música de fundo");
  }

  function fadeAudioTo(targetVolume, onComplete) {
    cancelAnimationFrame(audioFadeFrame);
    const initialVolume = ambientAudio.volume;
    const duration = reducedMotion ? 0 : 520;

    if (duration === 0) {
      ambientAudio.volume = targetVolume;
      if (onComplete) onComplete();
      return;
    }

    const fadeStartedAt = performance.now();
    function updateAudioFade(now) {
      const progress = Math.min(1, (now - fadeStartedAt) / duration);
      const eased = progress * (2 - progress);
      ambientAudio.volume = initialVolume + (targetVolume - initialVolume) * eased;
      if (progress < 1) {
        audioFadeFrame = requestAnimationFrame(updateAudioFade);
      } else {
        audioFadeFrame = 0;
        if (onComplete) onComplete();
      }
    }
    audioFadeFrame = requestAnimationFrame(updateAudioFade);
  }

  async function toggleAmbientSound() {
    if (soundEnabled) {
      soundEnabled = false;
      updateSoundButton();
      fadeAudioTo(0, () => ambientAudio.pause());
      return;
    }

    soundEnabled = true;
    updateSoundButton();
    ambientAudio.volume = 0;
    try {
      await ambientAudio.play();
      if (soundEnabled) fadeAudioTo(ambientVolume);
      else ambientAudio.pause();
    } catch {
      soundEnabled = false;
      updateSoundButton();
    }
  }

  function clearPhaseClasses() {
    dialog.classList.remove(...phaseClasses);
  }

  function showStartButton(label) {
    startButton.textContent = label;
    startButton.hidden = false;
    stopButton.hidden = true;
  }

  function setProgress(elapsed) {
    const completedCycles = elapsed / cycleDuration;
    progressSegments.forEach((segment, index) => {
      const segmentProgress = Math.max(0, Math.min(1, completedCycles - index));
      segment.style.transform = `scaleX(${segmentProgress})`;
    });
  }

  function cancelPhaseCopyTransition() {
    clearTimeout(phaseCopyTimer);
    phaseCopyTimer = 0;
    breathingCopy.classList.remove("is-changing");
  }

  function resetSession() {
    running = false;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    currentAbsolutePhase = -1;
    paused = false;
    pausedElapsed = 0;
    dialog.classList.remove("is-paused");
    cancelPhaseCopyTransition();
    clearPhaseClasses();
    countdown.textContent = "3";
    phaseLabel.textContent = "PREPARE-SE";
    phaseInstruction.textContent = "";
    cycleLabel.textContent = `CICLO 0 DE ${totalCycles}`;
    setProgress(0);
    restartButton.hidden = true;
    stopButton.textContent = "PAUSAR";
    showStartButton("INICIAR");
  }

  function applyPhaseCopy(absolutePhase) {
    const phase = phases[absolutePhase % phases.length];
    phaseLabel.textContent = phase.label;
    phaseInstruction.textContent = phase.instruction;
  }

  function updatePhaseCopy(absolutePhase) {
    clearTimeout(phaseCopyTimer);

    if (phaseCopyDelay === 0) {
      breathingCopy.classList.remove("is-changing");
      applyPhaseCopy(absolutePhase);
      return;
    }

    breathingCopy.classList.add("is-changing");
    phaseCopyTimer = setTimeout(() => {
      applyPhaseCopy(absolutePhase);
      requestAnimationFrame(() => breathingCopy.classList.remove("is-changing"));
      phaseCopyTimer = 0;
    }, phaseCopyDelay);
  }

  function setPhase(absolutePhase) {
    const phase = phases[absolutePhase % phases.length];
    clearPhaseClasses();
    void orb.offsetWidth;
    dialog.classList.add(phase.className);
    updatePhaseCopy(absolutePhase);
    currentAbsolutePhase = absolutePhase;
  }

  function completeSession() {
    running = false;
    animationFrame = 0;
    paused = false;
    pausedElapsed = totalDuration;
    dialog.classList.remove("is-paused");
    cancelPhaseCopyTransition();
    clearPhaseClasses();
    dialog.classList.add("phase-complete");
    countdown.textContent = "✓";
    phaseLabel.textContent = "PRÁTICA CONCLUÍDA";
    phaseInstruction.textContent = "Leve essa respiração tranquila com você.";
    cycleLabel.textContent = `CICLO ${totalCycles} DE ${totalCycles}`;
    setProgress(totalDuration);
    restartButton.hidden = true;
    showStartButton("RECOMEÇAR");
    startButton.focus({ preventScroll: true });
  }

  function updateSession(now) {
    if (!running) return;

    const elapsed = Math.max(0, now - startedAt);
    if (elapsed >= totalDuration) {
      completeSession();
      return;
    }

    const absolutePhase = Math.floor(elapsed / phaseDuration);
    const phaseElapsed = elapsed % phaseDuration;
    const remaining = Math.max(1, Math.ceil((phaseDuration - phaseElapsed) / 1000));
    const cycle = Math.floor(elapsed / cycleDuration) + 1;

    if (absolutePhase !== currentAbsolutePhase) setPhase(absolutePhase);
    countdown.textContent = String(remaining);
    cycleLabel.textContent = `CICLO ${cycle} DE ${totalCycles}`;
    setProgress(elapsed);
    animationFrame = requestAnimationFrame(updateSession);
  }

  function startSession() {
    if (running) return;
    const resuming = paused;
    running = true;
    paused = false;
    cancelAnimationFrame(animationFrame);
    dialog.classList.remove("is-paused");
    if (resuming) {
      updatePhaseCopy(Math.floor(pausedElapsed / phaseDuration));
    } else {
      pausedElapsed = 0;
      currentAbsolutePhase = -1;
    }
    startButton.hidden = true;
    restartButton.hidden = false;
    stopButton.hidden = false;
    stopButton.textContent = "PAUSAR";
    stopButton.focus({ preventScroll: true });
    const now = performance.now();
    startedAt = now - pausedElapsed;
    updateSession(now);
  }

  function pauseSession() {
    if (!running) return;
    pausedElapsed = Math.min(performance.now() - startedAt, totalDuration);
    running = false;
    paused = true;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    dialog.classList.add("is-paused");
    cancelPhaseCopyTransition();
    phaseLabel.textContent = "PAUSADO";
    phaseInstruction.textContent = "";
    showStartButton("CONTINUAR");
    startButton.focus({ preventScroll: true });
  }

  function restartSession() {
    running = false;
    paused = false;
    pausedElapsed = 0;
    currentAbsolutePhase = -1;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    dialog.classList.remove("is-paused");
    clearPhaseClasses();
    startSession();
  }

  function openGuide() {
    clearTimeout(closeTimer);
    closeTimer = 0;
    closing = false;
    dialog.classList.remove("is-closing");
    resetSession();
    launcher.setAttribute("aria-expanded", "true");
    dialog.showModal();
    requestAnimationFrame(() => startButton.focus({ preventScroll: true }));
  }

  function finishClose() {
    clearTimeout(closeTimer);
    closeTimer = 0;
    if (dialog.open) dialog.close();
    dialog.classList.remove("is-closing");
    closing = false;
    resetSession();
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus({ preventScroll: true });
  }

  function closeGuide() {
    if (!dialog.open || closing) return;
    running = false;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    closing = true;
    dialog.classList.add("is-closing");
    closeTimer = setTimeout(finishClose, closeDelay);
  }

  soundButton.addEventListener("click", toggleAmbientSound);
  launcher.addEventListener("click", openGuide);
  closeButton.addEventListener("click", closeGuide);
  restartButton.addEventListener("click", restartSession);
  startButton.addEventListener("click", startSession);
  stopButton.addEventListener("click", pauseSession);

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeGuide();
  });

  dialog.addEventListener("click", (event) => {
    const bounds = dialog.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (outside) closeGuide();
  });

  dialog.addEventListener("close", () => {
    clearTimeout(closeTimer);
    closeTimer = 0;
    if (!closing) resetSession();
    dialog.classList.remove("is-closing");
    closing = false;
    launcher.setAttribute("aria-expanded", "false");
  });
})();
