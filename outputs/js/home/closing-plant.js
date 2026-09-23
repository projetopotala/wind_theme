export const PLANT_KEY = "potala.plantinha.v1";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 36500;
const STAGES = Object.freeze([
  { name: "Início", min: 0, asset: "media/closing/plant-stage-1.webp" },
  { name: "Crescimento", min: 3, asset: "media/closing/plant-stage-2.webp" },
  { name: "Florescimento", min: 7, asset: "media/closing/plant-stage-3.webp" },
  { name: "Plenitude", min: 14, asset: "media/closing/plant-stage-4.webp" },
]);

function validHistory(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((day) => DAY.test(String(day))))].sort().slice(-120);
}

function previousDay(day) {
  if (!DAY.test(day)) return "";
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return localDay(date);
}

export function localDay(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function plantState(raw = {}) {
  const visits = Math.min(LIMIT, Math.max(0, Math.trunc(Number(raw?.visits ?? raw?.waterings) || 0)));
  const lastDay = DAY.test(String(raw?.lastDay ?? raw?.lastWatered ?? "")) ? String(raw.lastDay ?? raw.lastWatered) : "";
  const history = validHistory(raw?.history);
  const streak = Math.min(LIMIT, Math.max(0, Math.trunc(Number(raw?.streak) || (lastDay ? 1 : 0))));
  return { visits, lastDay, streak, history };
}

export function waterPlant(raw, day = localDay()) {
  const current = plantState(raw);
  if (!DAY.test(day) || current.lastDay >= day) return current;
  const history = validHistory([...current.history, day]);
  const streak = current.lastDay === previousDay(day) ? current.streak + 1 : 1;
  return { visits: current.visits + 1, lastDay: day, streak, history };
}

export function mergePlantStates(local, remote) {
  const a = plantState(local);
  const b = plantState(remote);
  const latest = a.lastDay >= b.lastDay ? a : b;
  return plantState({
    visits: Math.max(a.visits, b.visits, new Set([...a.history, ...b.history]).size),
    lastDay: a.lastDay >= b.lastDay ? a.lastDay : b.lastDay,
    streak: latest.streak,
    history: [...a.history, ...b.history],
  });
}

export function plantStage(visits) {
  const count = Math.max(0, Number(visits) || 0);
  return [...STAGES].reverse().find((stage) => count >= stage.min)?.name || STAGES[0].name;
}

export function plantStageData(visits) {
  const name = plantStage(visits);
  const index = STAGES.findIndex((stage) => stage.name === name);
  return { ...STAGES[index], index: index + 1, total: STAGES.length };
}

export function renderPlantCare() {
  return `<section class="closing-plant" aria-labelledby="plant-title">
    <div class="closing-copy closing-copy--plant">
      <p class="closing-eyebrow">Aquilo que cuidamos cresce</p>
      <h3 id="plant-title">Quero regar<br>minha plantinha</h3>
      <p class="closing-intro">Pequenos gestos também<br>transformam o mundo.</p>
    </div>
    <div class="plant-experience" data-plant-stage="Início" data-plant-stage-index="1">
      <p class="plant-poem" aria-hidden="true">Cuidado<br>hoje.<br>Amanhã<br>também.</p>
      <div class="plant-portrait" aria-live="off">
        <span class="plant-aura" aria-hidden="true"></span>
        <img data-plant-image src="media/closing/plant-stage-1.webp" alt="Uma planta jovem em um vaso de pedra" width="760" height="950" decoding="async">
        <span class="plant-droplet" aria-hidden="true"></span>
        <span class="plant-ripple" aria-hidden="true"></span>
      </div>
      <div class="plant-progress" aria-label="Evolução da planta">
        <span data-plant-stage-label>Estágio 1 de 4 · Início</span>
        <span class="plant-progress-track" aria-hidden="true"><i data-plant-progress></i></span>
      </div>
      <button class="plant-water" type="button" data-water-plant>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4s5.2 5.8 5.2 10.5a5.2 5.2 0 1 1-10.4 0C6.8 9.2 12 3.4 12 3.4Z"/><path d="M9.5 14.4c.3 1.3 1.1 2 2.3 2.3"/></svg>
        <span data-water-label>Regar minha plantinha</span>
      </button>
      <p class="plant-status" data-plant-status role="status" aria-live="polite">Uma semente para acompanhar suas visitas.</p>
      <p class="plant-storage" data-plant-storage>Seu cuidado fica guardado neste navegador. Ao entrar, ele acompanha a sua conta.</p>
    </div>
  </section>`;
}

export function paintPlant(footer, state, { animate = false } = {}) {
  const stage = plantStageData(state.visits);
  const today = state.lastDay >= localDay();
  const experience = footer.querySelector("[data-plant-stage]");
  const image = footer.querySelector("[data-plant-image]");
  const water = footer.querySelector("[data-water-plant]");
  const label = footer.querySelector("[data-water-label]");
  const status = footer.querySelector("[data-plant-status]");
  const stageLabel = footer.querySelector("[data-plant-stage-label]");
  const progress = footer.querySelector("[data-plant-progress]");

  experience.dataset.plantStage = stage.name;
  experience.dataset.plantStageIndex = String(stage.index);
  if (animate) experience.dataset.watering = "true";
  if (image.getAttribute?.("src") !== stage.asset) image.setAttribute?.("src", stage.asset);
  image.alt = `Planta no estágio ${stage.name.toLocaleLowerCase("pt-BR")}, em um vaso de pedra`;
  stageLabel.textContent = `Estágio ${stage.index} de ${stage.total} · ${stage.name}`;
  progress.style?.setProperty?.("--plant-progress", `${(stage.index / stage.total) * 100}%`);
  water.disabled = today;
  water.setAttribute?.("aria-label", today ? "Planta regada por hoje" : "Regar minha plantinha hoje");
  label.textContent = today ? "Regada por hoje" : "Regar minha plantinha";
  const streak = state.streak > 1 ? ` ${state.streak} dias de cuidado em sequência.` : "";
  status.textContent = state.visits
    ? `${stage.name}. ${today ? "Seu cuidado de hoje já está aqui." : "Que bom receber você de novo."}${streak}`
    : "Uma semente para acompanhar suas visitas.";
  return stage;
}
