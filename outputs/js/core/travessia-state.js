const STORAGE_KEY = "potala.travessia.v1";
const VALID_ENTRIES = new Set(["scroll", "drag", "keyboard"]);

function sanitize(value = {}) {
  const state = {};
  if (typeof value.soundEnabled === "boolean") state.soundEnabled = value.soundEnabled;
  if (VALID_ENTRIES.has(value.entry)) state.entry = value.entry;
  return state;
}

export function readTravessiaState(storage = sessionStorage) {
  try {
    return sanitize(JSON.parse(storage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return {};
  }
}

export function writeTravessiaState(patch, storage = sessionStorage) {
  try {
    const next = sanitize({ ...readTravessiaState(storage), ...patch });
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return sanitize(patch);
  }
}

export function consumeHandoff(storage = sessionStorage) {
  const current = readTravessiaState(storage);
  try {
    if ("entry" in current) {
      const keep = sanitize({ soundEnabled: current.soundEnabled });
      storage.setItem(STORAGE_KEY, JSON.stringify(keep));
    }
  } catch {
    // Storage is optional; navigation must continue when it is unavailable.
  }
  return current;
}
