import { enviarInteresse } from "./shared/participacao.js";

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

/*
 * "Você encontrou o que procurava?" chega ao Instituto como retorno anônimo.
 * Um clique por visita: trocar de resposta depois de enviada gravaria duas
 * opiniões da mesma pessoa.
 */
if (feedback) {
  const status = feedback.querySelector("[data-feedback-status]");
  const buttons = [...feedback.querySelectorAll("[data-feedback]")];
  let sent = false;
  const labels = { yes: "Sim, encontrei", partial: "Em parte", no: "Ainda não" };

  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      if (sent) return;
      buttons.forEach((item) => item.classList.toggle("is-selected", item === button));
      buttons.forEach((item) => { item.disabled = true; });
      status.textContent = "Enviando…";
      try {
        await enviarInteresse({
          kind: "retorno-recepcao",
          subject: labels[button.dataset.feedback] || button.dataset.feedback,
          details: { answer: button.dataset.feedback },
        });
        sent = true;
        status.textContent = "Obrigado. Sua resposta chegou à equipe do Instituto.";
      } catch (error) {
        buttons.forEach((item) => { item.disabled = false; item.classList.remove("is-selected"); });
        status.textContent = `Não foi possível enviar agora: ${error.message}`;
      }
    });
  });
}
