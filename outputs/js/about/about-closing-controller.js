import { mountClosingTransition } from "../shared/closing-transition-controller.js";

export function mountAboutClosing() {
  return mountClosingTransition({
    triggerSelector: "[data-about-closing-trigger]",
    veilSelector: "[data-about-closing-veil]",
    canvasSelector: "[data-about-closing-canvas]",
    activeClass: "is-about-closing",
  });
}
