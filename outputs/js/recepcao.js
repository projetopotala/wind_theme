(() => {
  "use strict";

  const assistant = document.querySelector("[data-assistant-preview]");
  const feedback = document.querySelector("[data-feedback-preview]");

  if (assistant) {
    const input = assistant.querySelector("input");
    const status = assistant.querySelector("[data-assistant-status]");

    assistant.querySelectorAll("[data-suggestion]").forEach((button) => {
      button.addEventListener("click", () => {
        input.value = button.dataset.suggestion || "";
        input.focus();
      });
    });

    assistant.addEventListener("submit", (event) => {
      event.preventDefault();
      status.textContent = input.value.trim()
        ? "A interface está pronta. A conversa inteligente será conectada na próxima etapa."
        : "Escreva uma pergunta ou escolha uma das sugestões para visualizar o fluxo.";
    });
  }

  if (feedback) {
    const status = feedback.querySelector("[data-feedback-status]");
    feedback.querySelectorAll("[data-feedback]").forEach((button) => {
      button.addEventListener("click", () => {
        feedback.querySelectorAll("[data-feedback]").forEach((item) => item.classList.remove("is-selected"));
        button.classList.add("is-selected");
        status.textContent = "Obrigado. Nesta prévia, a resposta permanece apenas no seu navegador.";
      });
    });
  }
})();
