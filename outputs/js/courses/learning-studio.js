const ADVICE_PATHS = {
  choose: {
    eyebrow: "Uma conversa antes da escolha",
    title: "Compare possibilidades com alguém experiente.",
    description: "Um encontro breve ajuda a esclarecer diferenças entre cursos, formatos e níveis de aprofundamento.",
    nextStep: "Solicitar conversa de orientação",
  },
  path: {
    eyebrow: "Um percurso feito com você",
    title: "Organize experiências que conversem entre si.",
    description: "A mentoria aproxima objetivos pessoais ou profissionais de cursos, práticas e encontros que façam sentido em sequência.",
    nextStep: "Conhecer as mentorias",
  },
};

const LABELS = {
  online: "Online",
  presencial: "Presencial",
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
  semana: "Durante a semana",
  sábado: "Sábado",
};

export function resolveLearningAdvice(goal) {
  return { ...(ADVICE_PATHS[goal] || ADVICE_PATHS.choose) };
}

export function buildCourseInterest(raw = {}) {
  const topic = String(raw.topic || "").trim();
  const modalityKey = String(raw.modality || "").trim().toLowerCase();
  const availabilityKeys = Array.isArray(raw.availability)
    ? raw.availability.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
    : [];

  if (topic.length < 3) {
    throw new Error("Conte qual tema você gostaria de aprender.");
  }
  if (!LABELS[modalityKey] || availabilityKeys.length === 0) {
    throw new Error("Escolha uma modalidade e ao menos um período disponível.");
  }

  return {
    topic,
    modality: LABELS[modalityKey],
    availability: availabilityKeys.map((key) => LABELS[key] || key),
    goal: String(raw.goal || "").trim(),
  };
}

export function getCohortProgress(currentStage, totalStages) {
  const lastStage = Math.max(0, Number(totalStages) - 1);
  const safeStage = Math.min(lastStage, Math.max(0, Number(currentStage) || 0));
  return {
    currentStage: safeStage,
    completedStages: safeStage,
    percentage: lastStage === 0 ? 100 : Math.round((safeStage / lastStage) * 100),
  };
}

function updateAdvice(studio, selectedButton) {
  const advice = resolveLearningAdvice(selectedButton.dataset.learningGoal);
  studio.querySelectorAll("[data-learning-goal]").forEach((button) => {
    const selected = button === selectedButton;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  studio.querySelector("[data-advice-eyebrow]").textContent = advice.eyebrow;
  studio.querySelector("[data-advice-title]").textContent = advice.title;
  studio.querySelector("[data-advice-description]").textContent = advice.description;
  studio.querySelector("[data-advice-next]").textContent = advice.nextStep;
}

function readInterestForm(form) {
  const data = new FormData(form);
  return buildCourseInterest({
    topic: data.get("topic"),
    goal: data.get("goal"),
    modality: data.get("modality"),
    availability: data.getAll("availability"),
  });
}

function renderInterestReview(studio, interest) {
  studio.querySelector("[data-interest-topic]").textContent = interest.topic;
  studio.querySelector("[data-interest-format]").textContent = `${interest.modality} · ${interest.availability.join(" ou ")}`;
  const goal = studio.querySelector("[data-interest-goal]");
  goal.textContent = interest.goal || "Objetivo ainda aberto para conversar com o Instituto.";
  const review = studio.querySelector("[data-interest-review]");
  review.hidden = false;
  review.focus({ preventScroll: true });
}

export function mountLearningStudio(root = document) {
  const studio = root.querySelector("[data-learning-studio]");
  if (!studio) return { destroy() {} };

  const listeners = [];
  studio.querySelectorAll("[data-learning-goal]").forEach((button) => {
    const onClick = () => updateAdvice(studio, button);
    button.addEventListener("click", onClick);
    listeners.push(() => button.removeEventListener("click", onClick));
  });

  const form = studio.querySelector("[data-course-interest-form]");
  const status = studio.querySelector("[data-interest-status]");
  const onSubmit = (event) => {
    event.preventDefault();
    try {
      renderInterestReview(studio, readInterestForm(form));
      status.textContent = "Sua ideia está pronta para ser revisada.";
      status.dataset.state = "success";
    } catch (error) {
      status.textContent = error.message;
      status.dataset.state = "error";
    }
  };
  form?.addEventListener("submit", onSubmit);
  if (form) listeners.push(() => form.removeEventListener("submit", onSubmit));

  const progressElement = studio.querySelector("[data-cohort-progress]");
  if (progressElement) {
    const progress = getCohortProgress(
      progressElement.dataset.currentStage,
      progressElement.dataset.totalStages,
    );
    progressElement.style.setProperty("--cohort-progress", `${progress.percentage}%`);
    progressElement.setAttribute("aria-valuenow", String(progress.percentage));
    studio.querySelectorAll("[data-cohort-stage]").forEach((stage, index) => {
      stage.dataset.state = index < progress.currentStage
        ? "complete"
        : index === progress.currentStage ? "current" : "upcoming";
    });
  }

  return { destroy() { listeners.forEach((remove) => remove()); } };
}

if (typeof document !== "undefined") mountLearningStudio();
