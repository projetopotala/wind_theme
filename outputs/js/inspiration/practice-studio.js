const REFLECTIONS = [
  "O que merece mais espaço na sua vida hoje?",
  "O que muda quando você responde sem pressa?",
  "Que cuidado pequeno pode sustentar o restante do seu dia?",
  "O que você pode soltar sem abandonar o que importa?",
];

export function breathingStateAt(elapsedSeconds) {
  const seconds = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  const cycleSecond = seconds % 9;
  const phase = cycleSecond < 3 ? "Inspirar" : cycleSecond < 6 ? "Segurar" : "Expirar";
  return { phase, phaseSecond: cycleSecond % 3, cycleSecond };
}

export function timedPracticeState(kind, elapsedSeconds) {
  const duration = kind === "escutar" ? 30 : 60;
  const elapsed = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  return {
    complete: elapsed >= duration,
    remaining: Math.max(0, duration - elapsed),
  };
}

export function reflectionAt(index) {
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
  return REFLECTIONS[safeIndex % REFLECTIONS.length];
}

const SETTINGS = {
  respirar: {
    label: "Respiração 3–3–3",
    idle: "Quando quiser, inicie três ciclos. Você pode interromper a qualquer momento.",
    duration: 27,
  },
  meditar: {
    label: "Um minuto de quietude",
    idle: "Apoie os pés, escolha um ponto e deixe os pensamentos passarem sem precisar segui-los.",
    duration: 60,
  },
  escutar: {
    label: "Escuta consciente",
    idle: "Durante trinta segundos, perceba primeiro o som mais distante e depois o mais próximo.",
    duration: 30,
  },
  refletir: {
    label: "Uma pergunta para levar",
    idle: REFLECTIONS[0],
    duration: 0,
  },
};

const INSPIRATION_RESOURCES = {
  meditacao: {
    title: "Meditação de chegada",
    description: "Dois minutos para pousar a atenção no corpo antes de continuar o dia.",
    steps: [
      "Sente-se com apoio e perceba três pontos de contato do corpo.",
      "Acompanhe o ar sem controlar o ritmo por seis respirações.",
      "Antes de seguir, reconheça uma sensação presente sem julgá-la.",
    ],
  },
  mantra: {
    title: "Mantra para presença",
    description: "Uma frase curta pode devolver direção quando repetida sem pressa.",
    steps: [
      "Repita mentalmente: eu posso estar inteiro neste instante.",
      "Faça uma pausa de uma respiração entre cada repetição.",
      "Encerre quando a frase deixar de ser esforço e virar lembrança.",
    ],
  },
  receita: {
    title: "Água aromática de cuidado",
    description: "Uma preparação simples para lembrar da hidratação ao longo do dia.",
    steps: [
      "Junte água fresca, duas rodelas de limão e folhas de hortelã bem lavadas.",
      "Deixe descansar por quinze minutos, sem adicionar açúcar.",
      "Consuma no mesmo dia; adapte os ingredientes às suas necessidades de saúde.",
    ],
  },
  gentileza: {
    title: "Uma gentileza possível",
    description: "Escolha um gesto pequeno, concreto e compatível com a sua energia de hoje.",
    steps: [
      "Pense em alguém cujo dia pode ficar mais leve com uma mensagem sincera.",
      "Faça o gesto sem esperar resposta ou reconhecimento.",
      "Perceba como oferecer cuidado também modifica quem oferece.",
    ],
  },
  "bem-estar": {
    title: "Pausa para os olhos",
    description: "Um intervalo breve para quem passou muito tempo diante de uma tela.",
    steps: [
      "Olhe por vinte segundos para o ponto mais distante que conseguir.",
      "Relaxe a testa e pisque lentamente algumas vezes.",
      "Ajuste postura, luminosidade e distância antes de retomar a atividade.",
    ],
  },
};

export function inspirationResourceFor(slug) {
  return INSPIRATION_RESOURCES[slug] || INSPIRATION_RESOURCES.meditacao;
}

export function transitionPracticeControl(state, action, now = Date.now()) {
  const current = state || { status: "idle", elapsedMs: 0, startedAt: 0 };
  const safeNow = Math.max(0, Number(now) || 0);
  if (action === "reset") return { status: "idle", elapsedMs: 0, startedAt: 0 };
  if (action === "start") return { status: "running", elapsedMs: 0, startedAt: safeNow };
  if (action === "pause" && current.status === "running") {
    return {
      status: "paused",
      elapsedMs: current.elapsedMs + Math.max(0, safeNow - current.startedAt),
      startedAt: 0,
    };
  }
  if (action === "resume" && current.status === "paused") {
    return { status: "running", elapsedMs: current.elapsedMs, startedAt: safeNow };
  }
  return { ...current };
}

export function practiceElapsedSeconds(state, now = Date.now()) {
  if (!state) return 0;
  const runningMs = state.status === "running"
    ? Math.max(0, (Number(now) || 0) - state.startedAt)
    : 0;
  return Math.floor((state.elapsedMs + runningMs) / 1000);
}

export function mountPracticeStudio(root = document, clock = () => Date.now()) {
  const shell = root.querySelector?.("[data-practice-studio]");
  if (!shell) return null;

  const choices = [...shell.querySelectorAll("[data-practice-choice]")];
  const stage = shell.querySelector("[data-practice-stage]");
  const label = shell.querySelector("[data-practice-label]");
  const message = shell.querySelector("[data-practice-message]");
  const time = shell.querySelector("[data-practice-time]");
  const start = shell.querySelector("[data-practice-start]");
  const reset = shell.querySelector("[data-practice-reset]");
  let kind = "respirar";
  let control = transitionPracticeControl(undefined, "reset", clock());
  let timer = 0;
  let reflectionIndex = 0;

  const clearTimer = () => {
    if (timer) globalThis.clearInterval(timer);
    timer = 0;
    stage?.classList.remove("is-running");
  };

  const idle = () => {
    clearTimer();
    control = transitionPracticeControl(control, "reset", clock());
    const setting = SETTINGS[kind];
    if (stage) {
      stage.dataset.kind = kind;
      stage.dataset.status = "idle";
      delete stage.dataset.phase;
      stage.classList.remove("is-paused");
    }
    if (label) label.textContent = setting.label;
    if (message) message.textContent = setting.idle;
    if (time) time.textContent = setting.duration ? `${setting.duration} segundos` : "Permanece disponível";
    if (start) start.textContent = kind === "refletir" ? "Outra reflexão" : "Iniciar";
  };

  const complete = () => {
    clearTimer();
    control = { ...control, status: "complete" };
    if (stage) {
      stage.dataset.status = "complete";
      stage.classList.remove("is-paused");
    }
    if (message) message.textContent = "Prática concluída. Continue somente quando quiser.";
    if (time) time.textContent = "Concluída";
    if (start) start.textContent = "Fazer novamente";
  };

  const update = () => {
    const elapsed = practiceElapsedSeconds(control, clock());
    const setting = SETTINGS[kind];
    if (elapsed >= setting.duration) return complete();

    if (kind === "respirar") {
      const state = breathingStateAt(elapsed);
      if (message) message.textContent = state.phase;
      if (time) time.textContent = `${setting.duration - elapsed} segundos`;
      if (stage) stage.dataset.phase = state.phase.toLocaleLowerCase("pt-BR");
      return;
    }

    const state = timedPracticeState(kind, elapsed);
    if (time) time.textContent = `${state.remaining} segundos`;
    if (message) {
      message.textContent = kind === "meditar"
        ? "Observe a respiração sem precisar modificá-la."
        : elapsed < 10 ? "Perceba o som mais distante."
          : elapsed < 20 ? "Agora, o som mais próximo."
            : "Por fim, note o silêncio entre eles.";
    }
  };

  const choose = (button) => {
    kind = button.dataset.practiceChoice || "respirar";
    choices.forEach((item) => {
      const selected = item === button;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    idle();
  };

  const onStart = () => {
    if (kind === "refletir") {
      reflectionIndex += 1;
      if (message) message.textContent = reflectionAt(reflectionIndex);
      return;
    }
    if (control.status === "running") {
      control = transitionPracticeControl(control, "pause", clock());
      clearTimer();
      const elapsed = practiceElapsedSeconds(control, clock());
      stage?.classList.add("is-paused");
      if (stage) stage.dataset.status = "paused";
      if (time) time.textContent = String(SETTINGS[kind].duration - elapsed) + " segundos · pausada";
      if (start) start.textContent = "Continuar";
      return;
    }
    control = transitionPracticeControl(
      control,
      control.status === "paused" ? "resume" : "start",
      clock(),
    );
    stage?.classList.remove("is-paused");
    stage?.classList.add("is-running");
    if (stage) stage.dataset.status = "running";
    update();
    timer = globalThis.setInterval(update, 250);
    if (start) start.textContent = "Pausar";
  };
  const onReset = () => idle();
  const choiceListeners = choices.map((button) => {
    const listener = () => choose(button);
    button.addEventListener("click", listener);
    return () => button.removeEventListener("click", listener);
  });
  start?.addEventListener("click", onStart);
  reset?.addEventListener("click", onReset);
  idle();

  return {
    destroy() {
      clearTimer();
      choiceListeners.forEach((remove) => remove());
      start?.removeEventListener("click", onStart);
      reset?.removeEventListener("click", onReset);
    },
  };
}

export function mountInspirationResources(root = document) {
  const panel = root.querySelector?.("[data-inspiration-resource-panel]");
  const buttons = [...(root.querySelectorAll?.("[data-inspiration-resource]") || [])];
  if (!panel || !buttons.length) return null;

  const title = panel.querySelector("[data-inspiration-resource-title]");
  const description = panel.querySelector("[data-inspiration-resource-description]");
  const steps = panel.querySelector("[data-inspiration-resource-steps]");

  const render = (button) => {
    const resource = inspirationResourceFor(button.dataset.inspirationResource);
    buttons.forEach((item) => {
      const selected = item === button;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    if (title) title.textContent = resource.title;
    if (description) description.textContent = resource.description;
    if (steps) {
      const items = resource.steps.map((text) => {
        const item = root.createElement("li");
        item.textContent = text;
        return item;
      });
      steps.replaceChildren(...items);
    }
  };

  const listeners = buttons.map((button) => {
    const listener = () => render(button);
    button.addEventListener("click", listener);
    return () => button.removeEventListener("click", listener);
  });
  render(buttons.find((button) => button.getAttribute("aria-pressed") === "true") || buttons[0]);

  return { destroy: () => listeners.forEach((remove) => remove()) };
}

if (typeof document !== "undefined") {
  mountPracticeStudio();
  mountInspirationResources();
}
