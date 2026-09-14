/*
 * AÇÕES QUE PEDEM CONTA, SEM TIRAR A PESSOA DO LUGAR.
 *
 * Quem está lendo um artigo e toca em "Salvar" sem ter entrado não deve ser
 * levado a uma página de login. O painel abre ali mesmo, dizendo o que vai
 * acontecer ("Entre para salvar “Oráculo de hoje”"). Quando a pessoa entra, o
 * painel fecha, a ação acontece sozinha e a rolagem volta exatamente para onde
 * estava — o teclado do celular costuma empurrar a página, e o artigo não pode
 * reaparecer em outro parágrafo.
 *
 * Se a pessoa desiste e fecha o painel, a ação é descartada. Guardar a
 * intenção para executá-la num login futuro, sem aviso, surpreenderia.
 */

export function criarAcoesComConta({ sessao, painel, janela = window } = {}) {
  if (!sessao || !painel) throw new TypeError("As ações precisam da sessão e do painel.");
  let pendente = null;

  async function executarPendente() {
    if (!pendente) return;
    const acao = pendente;
    pendente = null;
    try {
      await acao.executar();
      acao.resolver(true);
    } catch (erro) {
      acao.rejeitar(erro);
    } finally {
      if (Math.abs((janela.scrollY || 0) - acao.rolagem) > 2) {
        janela.scrollTo?.({ top: acao.rolagem, behavior: "instant" });
      }
    }
  }

  const desligarSessao = sessao.assinar((estado) => {
    if (estado.status === "autenticado" && pendente) executarPendente();
  });

  const desligarPainel = painel.aoFechar((estado) => {
    if (pendente && estado.status !== "autenticado") {
      const acao = pendente;
      pendente = null;
      acao.resolver(false);
    }
  });

  return {
    /**
     * @param {{descricao: string, executar: () => unknown}} acao
     * @returns {Promise<boolean>} true se a ação aconteceu, false se a pessoa desistiu
     */
    exigir({ descricao, executar }) {
      if (sessao.obter().status === "autenticado") {
        return Promise.resolve(executar()).then(() => true);
      }
      return new Promise((resolver, rejeitar) => {
        pendente?.resolver(false);
        pendente = { executar, resolver, rejeitar, rolagem: janela.scrollY || 0 };
        /* Ao fechar, o foco volta para o botão que pediu a conta — e não para o botão da conta. */
        const foco = janela.document?.activeElement;
        const origem = foco && foco !== janela.document.body ? { origem: foco } : {};
        painel.abrir({ estado: "entrar", contexto: `Entre para ${descricao}.`, ...origem });
      });
    },
    temPendente: () => Boolean(pendente),
    destroy() {
      desligarSessao();
      desligarPainel();
    },
  };
}
