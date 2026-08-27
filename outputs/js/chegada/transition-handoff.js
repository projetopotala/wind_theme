import { writeTravessiaState } from "../core/travessia-state.js";

export function handoffDelayForMotion({ reducedMotion = false } = {}) {
  return reducedMotion ? 80 : 850;
}

/**
 * Fecha o véu e troca de documento.
 *
 * A travessia tem três passagens — Chegada para Home, Home para o palácio, e o
 * palácio de volta para a Chegada — e todas escondem a troca no escuro do véu.
 * O destino é o único parâmetro que muda entre elas.
 */
export function crossTo({
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
  window.setTimeout(
    () => location.assign(destination),
    handoffDelayForMotion({ reducedMotion: reduced }),
  );
  return true;
}

/** A passagem da Chegada. Mantida por nome porque é a que o controlador chama. */
export function enterHome(options = {}) {
  return crossTo({ destination: "transcendido.html", ...options });
}
