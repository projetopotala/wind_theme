export function selectGuidedChoice(group, selectedButton) {
  if (!group || !selectedButton) return;

  group.querySelectorAll("[data-guided-choice]").forEach((item) => {
    const selected = item === selectedButton;
    item.classList.toggle("is-selected", selected);
    item.setAttribute("aria-pressed", String(selected));
  });

  const response = group.querySelector("[data-guided-response]");
  if (response && selectedButton.dataset.response) {
    response.textContent = selectedButton.dataset.response;
  }
}

export function createSectionFrontDemo(root = document) {
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const reveal = [...root.querySelectorAll("[data-reveal]")];
  const Observer = globalThis.IntersectionObserver;
  const observer = !reducedMotion && Observer
    ? new Observer((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.14 })
    : null;

  reveal.forEach((element) => {
    if (observer) observer.observe(element);
    else element.classList.add("is-visible");
  });

  const listeners = [];
  root.querySelectorAll("[data-guided-choice]").forEach((button) => {
    const onClick = () => {
      const group = button.closest("[data-guided-group]");
      selectGuidedChoice(group, button);
    };
    button.addEventListener("click", onClick);
    listeners.push(() => button.removeEventListener("click", onClick));
  });

  return {
    destroy() {
      observer?.disconnect();
      listeners.forEach((remove) => remove());
    },
  };
}

if (typeof document !== "undefined") createSectionFrontDemo();
