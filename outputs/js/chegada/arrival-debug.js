import { isArrivalDebugEnabled } from "./arrival-scene-profile.js";

const VIEWS = [
  { id: 0, label: "FINAL" },
  { id: 6, label: "MASTER" },
  { id: 1, label: "DEPTH" },
  { id: 2, label: "WATER MASK" },
  { id: 3, label: "WATERFALL MASK" },
  { id: 4, label: "CANOPY MASK" },
  { id: 5, label: "MIST MASK" },
  { id: 7, label: "SKY MASK" },
  { id: 8, label: "QUEDA · PÉ/CORPO/LÁBIO" },
];

export function mountArrivalDebug({
  search = "",
  scene,
  getMetrics,
} = {}) {
  if (!isArrivalDebugEnabled(search) || typeof document === "undefined") {
    return {
      enabled: false,
      setActor() {},
      update() {},
      destroy() {},
    };
  }

  const panel = document.createElement("aside");
  panel.className = "arrival-debug";
  panel.innerHTML = `
    <p class="arrival-debug-title">Chegada V2</p>
    <label>Vista
      <select data-debug="view">
        ${VIEWS.map((view) => `<option value="${view.id}">${view.label}</option>`).join("")}
      </select>
    </label>
    <label><input type="checkbox" data-debug="maskMix"> Master + mask 50%</label>
    <p data-debug="metrics">FPS —</p>
  `;
  document.body.append(panel);

  let view = 0;
  let maskMix = 0;
  let actorId = "";
  let frames = 0;
  let fps = 0;
  let lastSample = performance.now();

  const apply = () => {
    scene?.setDebug({ view, maskMix });
  };

  panel.querySelector("[data-debug=view]").addEventListener("change", (event) => {
    view = Number(event.target.value) || 0;
    apply();
  });
  panel.querySelector("[data-debug=maskMix]").addEventListener("change", (event) => {
    maskMix = event.target.checked ? 0.5 : 0;
    apply();
  });
  apply();

  return {
    enabled: true,
    setActor(id = "") {
      actorId = id || "";
    },
    update(now = performance.now()) {
      frames += 1;
      if (now - lastSample < 160) return;
      fps = Math.round((frames * 1000) / (now - lastSample));
      frames = 0;
      lastSample = now;
      const metrics = getMetrics?.() || scene?.getMetrics?.() || {};
      const node = panel.querySelector("[data-debug=metrics]");
      if (!node) return;
      node.textContent = [
        `FPS ${fps}`,
        `DPR ${Number(metrics.dpr || 0).toFixed(2)}`,
        `canvas ${metrics.canvasWidth || 0}×${metrics.canvasHeight || 0}`,
        `image ${metrics.imageWidth || 0}×${metrics.imageHeight || 0}`,
        `UV ${Number(metrics.pointer?.[0] || 0).toFixed(2)},${Number(metrics.pointer?.[1] || 0).toFixed(2)}`,
        `actor ${actorId || "—"}`,
        `scroll ${Number(metrics.scrollProgress || 0).toFixed(2)}`,
        `tex ${metrics.textureCount || 0}`,
      ].join(" · ");
    },
    destroy() {
      panel.remove();
    },
  };
}
