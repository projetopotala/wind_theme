import { clamp, damp } from "../core/math.js";
import { DESKTOP_V2_ACTORS } from "./arrival-scene-profile.js";

export const WORLD_ACTORS = DESKTOP_V2_ACTORS;

const ACTION_ENERGY = {
  sun: { sun: 1 },
  wind: { wind: 1 },
  water: { water: 1 },
  breathe: { water: 0.85, attention: 1 },
  mist: { mist: 1 },
  path: { path: 1 },
  listen: { attention: 0.8 },
  enter: { path: 0.7, sun: 0.4, mist: 0.55 },
};

export const AMBIENT_ENERGY = {
  wind: 0.28,
  water: 0.65,
  sun: 0.24,
  mist: 0.14,
  path: 0.08,
  attention: 0,
};

export function createWorldState() {
  return {
    energies: { ...AMBIENT_ENERGY },
    windDir: [0.32, 0.08],
    attentionId: null,
    attentionUv: [0.5, 0.5],
    awakened: [],
    lastAction: null,
    prompt: "",
    mistReveal: 0.14,
  };
}

export function hitActor(uvX, uvY, actors = WORLD_ACTORS, { previousId = null } = {}) {
  let best = null;
  let bestDistance = Infinity;
  for (const actor of actors) {
    const radius = actor.id === previousId ? actor.radius * 1.1 : actor.radius;
    const distance = Math.hypot(uvX - actor.x, uvY - actor.y);
    if (distance <= radius && distance < bestDistance) {
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
    mistReveal: energies.mist,
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
  next.mistReveal = energies.mist;
  next.prompt = actor.label;
  return next;
}

export function stepWorld(state, { elapsedMs = 16, reducedMotion = false } = {}) {
  const current = state || createWorldState();
  if (reducedMotion) {
    return {
      ...current,
      energies: {
        wind: 0, water: 0, sun: 0, mist: 0, path: 0, attention: 0,
      },
      mistReveal: 0,
      windDir: [0, 0],
    };
  }
  const energies = {};
  for (const [key, value] of Object.entries(current.energies)) {
    const rest = AMBIENT_ENERGY[key] ?? 0;
    const response = key === "mist" ? 1600 : key === "attention" ? 420 : 680;
    const next = damp(value, rest, elapsedMs, response);
    energies[key] = Math.abs(next - rest) < 0.012 ? rest : next;
  }
  const windDir = [
    damp(current.windDir?.[0] || 0, 0.32, elapsedMs, 220),
    damp(current.windDir?.[1] || 0, 0.08, elapsedMs, 220),
  ];
  return { ...current, energies, mistReveal: energies.mist, windDir };
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
  let lastNear = null;
  let lastPrompt = "";
  let lastAwakened = "";

  const onClick = (event) => {
    const button = event.target.closest("[data-actor-id]");
    if (!button) return;
    const actor = actors.find((item) => item.id === button.dataset.actorId);
    if (actor) onActivate?.(actor, "click");
  };

  root.addEventListener("click", onClick);
  root.hidden = false;

  const layout = (viewport, image) => {
    for (const button of root.querySelectorAll("[data-actor-id]")) {
      const actor = actors.find((item) => item.id === button.dataset.actorId);
      if (!actor) continue;
      const point = actorScreenPosition(actor, viewport, image);
      button.style.left = `${point.left}px`;
      button.style.top = `${point.top}px`;
    }
  };

  const syncState = (state) => {
    const near = state.attentionId || "";
    const awakened = (state.awakened || []).join(",");
    if (near !== lastNear || awakened !== lastAwakened) {
      for (const button of root.querySelectorAll("[data-actor-id]")) {
        const actor = actors.find((item) => item.id === button.dataset.actorId);
        if (!actor) continue;
        button.classList.toggle("is-near", state.attentionId === actor.id);
        button.classList.toggle("is-awakened", state.awakened.includes(actor.id));
      }
      lastNear = near;
      lastAwakened = awakened;
    }
    if (prompt && state.prompt !== lastPrompt) {
      prompt.textContent = state.prompt || "";
      lastPrompt = state.prompt || "";
    }
  };

  return {
    prompt,
    layout,
    syncState,
    sync(state, viewport, image) {
      layout(viewport, image);
      syncState(state);
    },
    destroy() {
      root.removeEventListener("click", onClick);
      root.innerHTML = "";
      root.hidden = true;
    },
  };
}
