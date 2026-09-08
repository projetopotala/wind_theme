/*
 * A PRÉVIA DO ASSISTENTE.
 *
 * A conversa inteligente do Portal ainda não existe; esta é a interface dela.
 * Nada é enviado nem guardado, e a tela diz isso em voz alta — um campo que
 * aceita a pergunta de alguém e a descarta em silêncio é pior do que campo
 * nenhum, porque a pessoa vai embora achando que perguntou.
 *
 * Genérico de propósito: a Recepção tem a versão dela, escrita antes e presa ao
 * CSS daquela página. Este módulo é o que qualquer outra seção usa, e é para cá
 * que a da Recepção deve migrar quando alguém for mexer nela.
 */

const RESPOSTA_COM_PERGUNTA = "A interface está pronta. A conversa inteligente será conectada na próxima etapa.";
const RESPOSTA_SEM_PERGUNTA = "Escreva uma pergunta ou escolha uma das sugestões para ver o fluxo.";

/**
 * @param {ParentNode} root
 * @returns {{destroy(): void}}
 */
export function mountAssistant(root = document) {
  const forma = root.querySelector?.("[data-assistente]");
  if (!forma) return { destroy() {} };

  const campo = forma.querySelector("input");
  const aviso = forma.querySelector("[data-assistente-aviso]");

  /*
   * As sugestões PREENCHEM o campo em vez de enviar.
   *
   * Enviando direto, o clique numa sugestão viraria a pergunta inteira de
   * alguém que só queria um ponto de partida. Preenchendo, ela vira rascunho: a
   * pessoa lê, ajusta e manda o que de fato quer perguntar.
   */
  const onSugestao = (evento) => {
    const botao = evento.target?.closest?.("[data-sugestao]");
    if (!botao || !campo) return;
    campo.value = botao.dataset.sugestao || "";
    campo.focus();
  };

  const onEnviar = (evento) => {
    evento.preventDefault?.();
    if (!aviso) return;
    aviso.textContent = campo?.value.trim() ? RESPOSTA_COM_PERGUNTA : RESPOSTA_SEM_PERGUNTA;
  };

  forma.addEventListener("click", onSugestao);
  forma.addEventListener("submit", onEnviar);

  return {
    destroy() {
      forma.removeEventListener("click", onSugestao);
      forma.removeEventListener("submit", onEnviar);
    },
  };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountAssistant(document), { once: true });
  } else {
    mountAssistant(document);
  }
}

/*
 * O CONVITE PARA AGENDAR — o botão que revela os canais.
 *
 * Mora neste arquivo por proximidade de propósito: os dois são prévias de algo
 * que o Portal ainda vai fazer sozinho, e os dois precisam ser honestos sobre
 * isso. Separá-los em dois módulos criaria um segundo `<script>` na página para
 * ganhar nada.
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
