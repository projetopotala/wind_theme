/*
 * ABRIR UM AVISO: O LINK SEGUE, E A TELA SÓ MUDA DEPOIS DE O BANCO CONFIRMAR.
 *
 * O título de um aviso é um link. A navegação não pode esperar a gravação — quem
 * toca quer ir para a agenda, não olhar um botão ocupado. Por isso a gravação
 * corre em paralelo, e a cópia que a SPA desenha só muda quando ela termina bem.
 *
 * Antes, a gravação era disparada e esquecida: o aviso ficava lido no banco, e a
 * cópia continuava com ele novo. O contador das abas, a lista de Notificações e
 * o botão da conta passavam a mostrar números diferentes (MP-01).
 *
 * TRÊS CUIDADOS:
 *
 * - FALHOU, NÃO MUDA. Marcar como lido só na tela, sem o banco, faria o aviso
 *   reaparecer novo no próximo acesso — e a pessoa acharia que o Potala esqueceu.
 * - UM PEDIDO POR AVISO. Dois toques rápidos no mesmo título não viram duas
 *   gravações.
 * - A TROCA DE TELA VEM PRIMEIRO. A navegação que o próprio link dispara monta o
 *   HTML da tela nova antes de a transição o aplicar. Se a cópia mudasse nesse
 *   meio-tempo, a transição ainda aplicaria o HTML antigo por cima do redesenho.
 *   A confirmação espera a troca em curso terminar.
 *
 * E UM QUARTO, QUE A PRIMEIRA VERSÃO NÃO TINHA (D1): a confirmação chega depois
 * da navegação, às vezes segundos depois. Redesenhar a tela inteira nessa hora
 * apagava o que a pessoa já tinha começado a escrever na Agenda ou no Perfil.
 * Fora de Notificações, só o miolo do link "Notificações" muda.
 */

import { contarAvisosNovos, conteudoDoLinkDeAvisos } from "./vistas/comum.js";

/* Uma lista nova, com só o aviso pedido marcado. Um aviso já lido guarda a data que tinha. */
export function marcarAvisoNaLista(lista = [], id, quando) {
  return lista.map((item) => (item.id === id && !item.lidaEm ? { ...item, lidaEm: quando } : item));
}

export function criarAberturaDeAvisos({
  acharAviso,
  persistir,
  aoConfirmar,
  esperarTroca = () => Promise.resolve(),
  agora = () => new Date(),
} = {}) {
  if (typeof acharAviso !== "function" || typeof persistir !== "function" || typeof aoConfirmar !== "function") {
    throw new TypeError("A abertura de avisos precisa saber achar, gravar e confirmar.");
  }
  const emCurso = new Set();

  async function gravarEConfirmar(id) {
    const quando = agora().toISOString();
    try {
      await persistir(id, quando);
    } catch {
      /* O aviso continua novo, na tela e no banco: nada a desfazer. */
      emCurso.delete(id);
      return false;
    }
    /* Só sai de "em curso" depois de a cópia mudar: antes disso ela ainda diz "novo". */
    try {
      await esperarTroca();
      aoConfirmar(id, quando);
    } finally {
      emCurso.delete(id);
    }
    return true;
  }

  return {
    /*
     * Devolve `null` quando não há o que gravar — aviso já lido, inexistente ou
     * com uma gravação em curso — e, nos outros casos, a promessa do resultado:
     * `true` se o banco confirmou, `false` se recusou.
     */
    abrir(id) {
      const aviso = acharAviso(id);
      if (!aviso || aviso.lidaEm || emCurso.has(id)) return null;
      emCurso.add(id);
      return gravarEConfirmar(id);
    },
    pendente: (id) => emCurso.has(id),
  };
}

/*
 * MOSTRAR NA TELA ATUAL QUE O AVISO FOI LIDO, MEXENDO O MÍNIMO.
 *
 * - Em Notificações a própria lista muda, e a tela é redesenhada: ali não há
 *   texto a perder, só os interruptores de aviso, que já são redesenhados assim
 *   quando mudam.
 * - Em qualquer outra tela, só o miolo do link "Notificações" do cabeçalho é
 *   trocado. O link continua o mesmo elemento (o foco nele não se perde), e o
 *   resto — formulários, foco, cursor, rolagem — fica intocado.
 *
 * `palco` é consultado na hora: o que existir agora é o que está na tela, e um
 * elemento de uma tela que já saiu não é atualizado. Devolve o que foi feito.
 */
export function refletirAvisoLido({ palco, rota, dados, redesenhar }) {
  if (!palco || !rota || !dados) return "nada";
  if (rota.nome === "notificacoes" && palco.querySelector("[data-vista='notificacoes']")) {
    redesenhar();
    return "lista";
  }
  const link = palco.querySelector(".mp-nav-avisos");
  if (!link) return "nada";
  link.innerHTML = conteudoDoLinkDeAvisos(contarAvisosNovos(dados));
  return "cabecalho";
}
