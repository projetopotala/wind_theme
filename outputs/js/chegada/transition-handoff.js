import { writeTravessiaState } from "../core/travessia-state.js";

export function enterHome({
  entry,
  soundEnabled = false,
  destination = "transcendido.html",
} = {}) {
  if (document.documentElement.dataset.transitioning === "true") return false;
  document.documentElement.dataset.transitioning = "true";
  writeTravessiaState({ entry, soundEnabled });
  document.documentElement.classList.add("is-crossing");
  document.body.classList.add("is-arrival-transitioning");
  document.dispatchEvent(new CustomEvent("potala:prepare-handoff"));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => location.assign(destination), reduced ? 80 : 1080);
  return true;
}
