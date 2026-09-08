/*
 * O PAINEL DA BUSCA: abrir, fechar e devolver o foco.
 *
 * Isto morava dentro do controlador da jornada, e lá faltava metade: a busca
 * abria e só se fechava sozinha quando encontrava alguma coisa. Quem abrisse
 * por curiosidade, ou procurasse algo que a jornada não tem, ficava com o campo
 * na tela sem nenhum jeito de dispensá-lo — no telefone, onde não há Escape
 * nem clique fora, era um beco.
 *
 * O comentário no HTML já dizia que ela sai "quando alguém a fecha". A frase
 * descrevia uma intenção que nunca virou código.
 *
 * Está num módulo à parte porque é a única forma de haver teste: montar o
 * controlador inteiro exige uma jornada, um palco e uma paisagem, e um
 * comportamento que ninguém consegue exercitar é um comportamento que volta a
 * quebrar.
 */

/**
 * @param {object} pecas
 * @param {HTMLElement} pecas.forma o formulário da busca
 * @param {HTMLInputElement} [pecas.campo] o campo de texto
 * @param {HTMLElement} [pecas.aviso] onde a resposta da busca é escrita
 * @param {HTMLElement} [pecas.fechar] o botão de fechar
 * @param {HTMLElement} [pecas.foco] o controle que abre a busca, para onde o foco volta
 * @returns {{mostrar(): void, esconder(opcoes?: object): void, alternar(): void, aberta(): boolean, destroy(): void}}
 */
export function criarPainelDeBusca({ forma, campo, aviso, fechar, foco } = {}) {
  const nada = {
    mostrar() {}, esconder() {}, alternar() {}, aberta: () => false, destroy() {},
  };
  if (!forma) return nada;

  const aberta = () => forma.hidden === false;

  function mostrar() {
    forma.hidden = false;
    campo?.focus?.();
  }

  /**
   * @param {{devolverFoco?: boolean}} [opcoes] `devolverFoco` falso quando quem
   *   fecha é a própria busca ao encontrar algo: ali o foco e a rolagem vão para
   *   o bloco, e puxá-los de volta para a barra desfaria a viagem.
   */
  function esconder({ devolverFoco = true } = {}) {
    forma.hidden = true;
    /*
     * O aviso é limpo, e o campo NÃO é.
     *
     * "Nada na jornada responde a isso" é resposta de uma pergunta que já
     * passou; reaparecer na próxima abertura faria a busca começar dizendo não
     * a quem ainda não perguntou. O termo digitado fica: quem reabre costuma
     * estar corrigindo um erro de digitação, e apagar cobraria tudo de novo.
     */
    if (aviso) aviso.textContent = "";
    /*
     * O foco volta para a LUPA, que é o controle que abriu a busca.
     *
     * Ele já foi para o `summary` de um menu recolhível, porque a lupa morava
     * dentro dele e um elemento dentro de `details` fechado não recebe foco.
     * Esse menu saiu junto com a barra lateral, e o parâmetro ficou apontando
     * para nada: fechar a busca deixava o foco no corpo da página, e quem
     * navega por teclado recomeçaria do topo.
     */
    if (devolverFoco) foco?.focus?.();
  }

  function alternar() {
    if (aberta()) esconder();
    else mostrar();
  }

  /* Escape fecha, como em qualquer painel sobreposto. É o gesto que quem usa
     teclado tenta primeiro, e não custa nada atender. */
  const onTecla = (evento) => {
    if (evento.key !== "Escape") return;
    evento.stopPropagation?.();
    esconder();
  };

  const onFechar = () => esconder();

  forma.addEventListener("keydown", onTecla);
  fechar?.addEventListener?.("click", onFechar);

  return {
    mostrar,
    esconder,
    alternar,
    aberta,
    destroy() {
      forma.removeEventListener("keydown", onTecla);
      fechar?.removeEventListener?.("click", onFechar);
    },
  };
}
