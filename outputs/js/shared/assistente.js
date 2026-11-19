/*
 * O CONVITE PARA AGENDAR — o botão que revela os canais.
 * O assistente demonstrativo foi removido; a conversa usa somente IA-01.
 *
 * `hidden` e `aria-expanded` em vez de uma classe: quem usa leitor de tela
 * precisa saber que o botão revela algo e se está revelado, e os dois atributos
 * dizem isso sem nenhum texto a mais.
 */
export function mountAgendamento(root = document) {
  const bloco = root.querySelector?.("[data-agendar]");
  const botao = bloco?.querySelector("[data-agendar-abrir]");
  const canais = bloco?.querySelector("[data-agendar-canais]");
  if (!botao || !canais) return { destroy() {} };

  const alternar = () => {
    const aberto = canais.hidden;
    canais.hidden = !aberto;
    botao.setAttribute("aria-expanded", String(aberto));
    /* O foco vai para o primeiro canal ao abrir: quem chegou pelo teclado
       apertou o botão para alcançar o WhatsApp, não para ouvir que ele existe. */
    if (aberto) canais.querySelector("a")?.focus?.();
  };

  botao.addEventListener("click", alternar);
  return { destroy() { botao.removeEventListener("click", alternar); } };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountAgendamento(document), { once: true });
  } else {
    mountAgendamento(document);
  }
}
