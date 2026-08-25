import { clamp, damp } from "../core/math.js";

export const WORLD_ACTORS = [
  {
    id: "sky",
    action: "sun",
    role: "Tempo",
    label: "O céu",
    cue: "A luz muda porque você chegou.",
    x: 0.4,
    y: 0.14,
    radius: 0.16,
  },
  {
    id: "tree",
    action: "wind",
    role: "Presença",
    label: "A árvore antiga",
    cue: "O vento só existe enquanto você está aqui.",
    x: 0.16,
    y: 0.36,
    radius: 0.14,
  },
  {
    id: "stream",
    action: "water",
    role: "Fluxo",
    label: "A água da margem",
    cue: "A correnteza acorda com a sua atenção.",
    x: 0.2,
    y: 0.78,
    radius: 0.09,
  },
  {
    id: "children",
    action: "breathe",
    role: "Pausa",
    label: "Quem brinca na água",
    cue: "Eles convidam a respirar.",
    x: 0.15,
    y: 0.86,
    radius: 0.07,
  },
  {
    id: "overlook",
    action: "mist",
    role: "Horizonte",
    label: "Quem aponta o vale",
    cue: "A névoa abre para quem olha ao longe.",
    x: 0.36,
    y: 0.58,
    radius: 0.07,
  },
  {
    id: "elders",
    action: "path",
    role: "Caminho",
    label: "Quem segue a pedra",
    cue: "Um passo com eles. O resto é o seu.",
    x: 0.5,
    y: 0.74,
    radius: 0.07,
  },
  {
    id: "sitters",
    action: "listen",
    role: "Escuta",
    label: "Quem descansa junto ao templo",
    cue: "Você não precisa conhecer tudo hoje.",
    x: 0.74,
    y: 0.8,
    radius: 0.08,
  },
  {
    id: "steps",
    action: "enter",
    role: "Entrada",
    label: "A porta do templo",
    cue: "Quando quiser, o Potala continua lá dentro.",
    x: 0.8,
    y: 0.56,
    radius: 0.08,
  },
];

const ACTION_ENERGY = {
  sun: { sun: 1 },
  wind: { wind: 1 },
  water: { water: 1 },
  breathe: { water: 0.85, attention: 1 },
  mist: { mist: 1 },
  path: { path: 1 },
  listen: { attention: 0.8 },
  enter: { path: 0.7, sun: 0.4 },
};

export function createWorldState() {
  return {
    energies: {
      wind: 0,
      water: 0,
      sun: 0,
      mist: 0,
      path: 0,
      attention: 0,
    },
    windDir: [0, 0],
    attentionId: null,
    attentionUv: [0.5, 0.5],
    awakened: [],
    lastAction: null,
    prompt: "",
  };
}

export function hitActor(uvX, uvY, actors = WORLD_ACTORS) {
  let best = null;
  let bestDistance = Infinity;
  for (const actor of actors) {
    const distance = Math.hypot(uvX - actor.x, uvY - actor.y);
    if (distance <= actor.radius && distance < bestDistance) {
      best = actor;
      bestDistance = distance;
    }
  }
  return best;
}

export function applyWorldAction(state, actor, now = 0) {
  if (!state || !actor) return state || createWorldState();
  const energies = { ...state.energies };
  const patch = ACTION_ENERGY[actor.action] || {};
  for (const [key, value] of Object.entries(patch)) {
    energies[key] = Math.max(energies[key] || 0, value);
  }
  const awakened = state.awakened.includes(actor.id)
    ? state.awakened
    : [...state.awakened, actor.id];
  return {
    ...state,
    energies,
    attentionId: actor.id,
    attentionUv: [actor.x, actor.y],
    awakened,
    lastAction: { id: actor.id, action: actor.action, at: now },
    prompt: actor.cue,
  };
}

export function feedProximity(state, actor, { pointerDelta = 0, pointer = [0, 0] } = {}) {
  const next = {
    ...(state || createWorldState()),
    energies: { ...(state?.energies || createWorldState().energies) },
  };
  if (!actor) {
    next.attentionId = null;
    return next;
  }
  const pulse = 0.2 + Math.min(0.55, Math.abs(pointerDelta) * 2.2);
  const energies = next.energies;
  if (actor.action === "wind") {
    energies.wind = Math.max(energies.wind, pulse);
    next.windDir = [clamp(pointer[0], -1, 1), clamp(pointer[1], -1, 1)];
  }
  if (actor.action === "water" || actor.action === "breathe") {
    energies.water = Math.max(energies.water, pulse * 0.9);
  }
  if (actor.action === "sun") energies.sun = Math.max(energies.sun, pulse);
  if (actor.action === "mist") energies.mist = Math.max(energies.mist, pulse * 0.65);
  if (actor.action === "path") energies.path = Math.max(energies.path, pulse * 0.4);
  energies.attention = Math.max(energies.attention, 0.32);
  next.attentionId = actor.id;
  next.attentionUv = [actor.x, actor.y];
  next.prompt = actor.label;
  return next;
}

export function stepWorld(state, { elapsedMs = 16, reducedMotion = false } = {}) {
  const current = state || createWorldState();
  if (reducedMotion) {
    return {
      ...current,
      energies: createWorldState().energies,
      windDir: [0, 0],
    };
  }
  const energies = {};
  for (const [key, value] of Object.entries(current.energies)) {
    const rest = damp(value, 0, elapsedMs, key === "mist" ? 1600 : 680);
    energies[key] = rest < 0.012 ? 0 : rest;
  }
  return { ...current, energies };
}

export function imageUvFromPointer({ clientX = 0, clientY = 0, viewport, image }) {
  const view = viewport || { width: 1, height: 1 };
  const plate = image || { width: 16, height: 9 };
  const scale = Math.max(view.width / plate.width, view.height / plate.height);
  const drawnWidth = plate.width * scale;
  const drawnHeight = plate.height * scale;
  const offsetX = (view.width - drawnWidth) / 2;
  const offsetY = (view.height - drawnHeight) / 2;
  return {
    u: clamp((clientX - offsetX) / Math.max(1, drawnWidth)),
    v: clamp((clientY - offsetY) / Math.max(1, drawnHeight)),
  };
}

export function actorScreenPosition(actor, viewport, image) {
  const view = viewport || { width: 1, height: 1 };
  const plate = image || { width: 16, height: 9 };
  const scale = Math.max(view.width / plate.width, view.height / plate.height);
  return {
    left: (view.width - plate.width * scale) / 2 + actor.x * plate.width * scale,
    top: (view.height - plate.height * scale) / 2 + actor.y * plate.height * scale,
  };
}

export function mountArrivalWorld(root, { actors = WORLD_ACTORS, onActivate } = {}) {
  if (!root) throw new TypeError("root é obrigatório para o mundo da Chegada");
  root.innerHTML = actors.map((actor) => `
    <button class="world-actor" type="button" data-actor-id="${actor.id}"
      style="--actor-radius:${Math.round(actor.radius * 100)}%"
      aria-label="${actor.role}: ${actor.label}">
      <span>${actor.role}</span>
    </button>
  `).join("");
  const prompt = document.getElementById("world-prompt");

  const activate = (actor, source = "pointer") => {
    onActivate?.(actor, source);
  };

  const onClick = (event) => {
    const button = event.target.closest("[data-actor-id]");
    if (!button) return;
    const actor = actors.find((item) => item.id === button.dataset.actorId);
    if (actor) activate(actor, "click");
  };

  root.addEventListener("click", onClick);
  root.hidden = false;

  return {
    prompt,
    sync(state, viewport, image) {
      for (const button of root.querySelectorAll("[data-actor-id]")) {
        const actor = actors.find((item) => item.id === button.dataset.actorId);
        if (!actor) continue;
        const point = actorScreenPosition(actor, viewport, image);
        button.style.left = `${point.left}px`;
        button.style.top = `${point.top}px`;
        button.classList.toggle("is-near", state.attentionId === actor.id);
        button.classList.toggle("is-awakened", state.awakened.includes(actor.id));
      }
      if (prompt) prompt.textContent = state.prompt || "";
    },
    destroy() {
      root.removeEventListener("click", onClick);
      root.innerHTML = "";
      root.hidden = true;
    },
  };
}
