const TAKEAWAYS = Object.freeze({
  poema: {
    label: "Um pequeno poema",
    lines: [
      "Há caminhos que começam\nquando a gente permite\nque o passo seja pequeno.",
      "A luz não pede pressa.\nEncontra uma fresta\ne fica.",
    ],
  },
  reflexao: {
    label: "Uma reflexão",
    lines: [
      "Você não precisa levar todas as respostas. Uma boa pergunta também pode fazer companhia.",
      "O cuidado pode começar em um gesto que cabe no seu dia.",
    ],
  },
  silencio: {
    label: "Um minuto de silêncio",
    lines: [
      "Respire sem precisar chegar a lugar algum. Este minuto já é seu.",
      "Por um instante, escute o espaço entre um pensamento e outro.",
    ],
  },
});

const ICONS = Object.freeze({
  poema: '<path d="M12 20V9m0 5c-3.9.2-6-1.7-6.2-5.6 3.9-.2 6 1.6 6.2 5.6Zm0-2.7c3.7.2 5.7-1.6 5.9-5.3-3.7-.2-5.7 1.5-5.9 5.3Z"/>',
  reflexao: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.1M12 19.4v2.1M2.5 12h2.1M19.4 12h2.1M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M18.7 5.3l-1.5 1.5M6.8 17.2l-1.5 1.5"/>',
  silencio: '<path d="M3 9c2.2 0 2.2-2 4.4-2s2.2 2 4.4 2 2.2-2 4.4-2 2.2 2 4.4 2M3 15c2.2 0 2.2-2 4.4-2s2.2 2 4.4 2 2.2-2 4.4-2 2.2 2 4.4 2"/>',
});

function card(kind, index) {
  const item = TAKEAWAYS[kind];
  return `<button class="takeaway-card${index === 0 ? " is-selected" : ""}" type="button" data-takeaway="${kind}" aria-pressed="${index === 0 ? "true" : "false"}">
    <span class="takeaway-number">0${index + 1}</span>
    <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[kind]}</svg>
    <span class="takeaway-label">${item.label.replace(" ", " ")}</span>
    <i aria-hidden="true"></i>
  </button>`;
}

export function renderTakeaway() {
  return `<section class="closing-takeaway" aria-labelledby="gift-title">
    <p class="closing-eyebrow">Antes de partir</p>
    <h3 id="gift-title">Uma lembrança<br>para levar</h3>
    <p class="closing-intro">Ao sair da nossa presença, esperamos apenas uma coisa: que você esteja um pouco melhor do que estava quando chegou.</p>
    <div class="takeaway-cards" role="group" aria-label="Escolha uma lembrança">
      ${Object.keys(TAKEAWAYS).map(card).join("")}
    </div>
    <button class="takeaway-receive" type="button" data-choose-gift>
      <span>Receber uma lembrança</span><span aria-hidden="true">→</span>
    </button>
    <div class="takeaway-result" data-takeaway-result hidden>
      <p class="gift-message" data-gift-message role="status" aria-live="polite"></p>
      <button type="button" class="takeaway-save" data-save-gift>Guardar como texto</button>
    </div>
  </section>`;
}

export function createTakeawayController(footer) {
  let selected = "poema";
  let gift = "";
  let animationTimer;
  let swapTimer;
  const counters = {};

  function select(kind) {
    if (!TAKEAWAYS[kind]) return;
    selected = kind;
    footer.querySelectorAll?.("[data-takeaway]").forEach((item) => {
      const active = item.dataset.takeaway === kind;
      item.classList.toggle("is-selected", active);
      item.setAttribute("aria-pressed", String(active));
    });
  }

  function receive() {
    const options = TAKEAWAYS[selected].lines;
    const index = counters[selected] ?? 0;
    const nextGift = options[index % options.length];
    counters[selected] = index + 1;
    const section = footer.querySelector(".closing-takeaway");
    const button = footer.querySelector("[data-choose-gift]");
    const result = footer.querySelector("[data-takeaway-result]");
    const message = footer.querySelector("[data-gift-message]");
    const changingGift = !result.hidden && Boolean(message.textContent.trim());
    const reduceMotion = globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const swapDelay = reduceMotion ? 0 : 320;
    gift = nextGift;
    clearTimeout(animationTimer);
    clearTimeout(swapTimer);
    section?.classList.remove("is-receiving");
    message.classList.remove("is-entering", "is-leaving");
    void section?.offsetWidth;
    section?.classList.add("is-receiving");
    button.disabled = true;
    button.setAttribute?.("aria-busy", "true");

    if (changingGift) {
      message.classList.add("is-leaving");
      swapTimer = setTimeout(() => {
        message.textContent = gift;
        message.classList.remove("is-leaving");
        void message.offsetWidth;
        message.classList.add("is-entering");
      }, swapDelay);
    } else {
      message.textContent = gift;
      result.hidden = false;
      void message.offsetWidth;
      message.classList.add("is-entering");
    }

    animationTimer = setTimeout(() => {
      section?.classList.remove("is-receiving");
      message.classList.remove("is-entering", "is-leaving");
      button.disabled = false;
      button.removeAttribute?.("aria-busy");
    }, 950);
    return gift;
  }

  function save(documentRef = document, URLRef = URL) {
    if (!gift) return;
    const url = URLRef.createObjectURL(new Blob([`${gift}\n\nUma lembrança da sua visita ao Potala.\n`], { type: "text/plain;charset=utf-8" }));
    const anchor = documentRef.createElement("a");
    anchor.href = url;
    anchor.download = "lembranca-potala.txt";
    anchor.click();
    setTimeout(() => URLRef.revokeObjectURL(url), 1000);
  }

  function destroy() {
    clearTimeout(animationTimer);
    clearTimeout(swapTimer);
  }

  return { select, receive, save, destroy, get selected() { return selected; }, get gift() { return gift; } };
}
