/*
 * A travessia: a câmera atravessa a paisagem até encontrar o conteúdo.
 *
 * Uma linha do tempo só, e não várias animações soltas. Cada momento é uma
 * fatia do mesmo total, e é isso que garante o determinismo pedido: a mesma
 * interação termina sempre nas mesmas posições, porque as posições saem de uma
 * conta e não de quem chegou primeiro.
 *
 * Este arquivo não toca no DOM. Os tempos e o deslocamento são conta pura, e
 * conta pura é onde um erro de coordenação aparece num teste em vez de aparecer
 * como um salto na tela que ninguém sabe reproduzir.
 */

/** Duração total, em milissegundos. A referência pede entre 1800 e 2400. */
export const DURACAO = 2000;
export const DURACAO_REDUZIDA = 220;

/*
 * As cinco fatias, em fração do total. Elas se sobrepõem de propósito: o
 * conteúdo começa a subir antes de a câmera parar, que é o que faz a chegada
 * parecer uma coisa só em vez de duas etapas coladas.
 */
export const FASES = {
  confirmacao: { inicio: 0, fim: 0.14 },
  travessia: { inicio: 0.08, fim: 0.7 },
  titulo: { inicio: 0.55, fim: 0.85 },
  categorias: { inicio: 0.7, fim: 1 },
};

/** Quanto cada categoria espera a mais que a anterior, em fração do total. */
export const PASSO_CATEGORIA = 0.05;

const clamp01 = (valor) => Math.min(1, Math.max(0, Number(valor) || 0));

/**
 * Os tempos de uma fase, em milissegundos, prontos para virar CSS.
 *
 * `atraso` e `duracao` saem da mesma `duracaoTotal`, então mudar a duração
 * total move tudo junto e nada descola.
 */
export function faseEmMs(nome, duracaoTotal = DURACAO) {
  const fase = FASES[nome];
  if (!fase) throw new RangeError(`fase desconhecida: ${nome}`);
  const total = Math.max(0, Number(duracaoTotal) || 0);
  return {
    atraso: Math.round(fase.inicio * total),
    duracao: Math.round((fase.fim - fase.inicio) * total),
  };
}

/**
 * O atraso de uma categoria dentro do stagger.
 *
 * O passo é limitado para que a última não caia depois do fim da linha do
 * tempo: com muitas categorias, um passo fixo empurraria a última para fora e
 * ela apareceria depois de o painel já ter liberado os cliques.
 */
export function atrasoDaCategoria(indice, total, duracaoTotal = DURACAO) {
  const quantidade = Math.max(1, Math.trunc(total) || 1);
  const posicao = Math.min(Math.max(0, Math.trunc(indice) || 0), quantidade - 1);
  const fase = FASES.categorias;
  const espaco = fase.fim - fase.inicio;
  const passo = quantidade > 1 ? Math.min(PASSO_CATEGORIA, espaco / quantidade) : 0;
  return Math.round((fase.inicio + posicao * passo) * (Number(duracaoTotal) || 0));
}

/**
 * O deslocamento da câmera, em pixels, para uma largura de tela.
 *
 * É uma fração da largura, e não um número fixo: num telefone, os 320px que
 * dão sensação de câmera num monitor arrastariam a cena inteira para fora.
 *
 * O teto existe porque a paisagem tem largura finita. Passar dele mostra a
 * borda da imagem, e a borda denuncia que a cena acabou — que é exatamente a
 * ilusão que a travessia existe para manter.
 */
export function deslocamentoDaCamera({ viewportWidth = 1440, maximo = 340 } = {}) {
  const largura = Math.max(1, Number(viewportWidth) || 1);
  return Math.round(Math.min(maximo, largura * 0.22));
}

/**
 * Quanto uma camada anda, dado o quanto a câmera andou.
 *
 * Longe anda menos, perto anda mais: é a profundidade. Os fatores são discretos
 * de propósito — parallax largo demais faz a cena parecer desmontada, e é
 * náusea garantida em quem tem sensibilidade a movimento.
 */
export const CAMADAS = { fundo: 0.35, meio: 1, frente: 1.35, interface: 1.6 };

export function deslocamentoDaCamada(camada, deslocamentoBase) {
  const fator = CAMADAS[camada];
  if (fator === undefined) throw new RangeError(`camada desconhecida: ${camada}`);
  return Math.round((Number(deslocamentoBase) || 0) * fator);
}

/**
 * A máquina de estados da travessia.
 *
 * Três estados e uma trava. A trava é o que impede o clique repetido de
 * disparar uma segunda linha do tempo por cima da primeira — sem ela, dois
 * cliques deixam a cena a meio caminho de dois lugares diferentes.
 */
export function createTravessiaState({ onChange } = {}) {
  let estado = "initial";
  let travado = false;
  /*
   * Para ONDE a linha do tempo aponta.
   *
   * Faltava no primeiro modelo, e a falta tinha consequência: durante a
   * travessia o estado já é "transitioning", então fechar tentava entrar no
   * estado em que já estava e era recusado. Sem o destino não há como
   * distinguir "atravessando para abrir" de "atravessando para voltar".
   */
  let destino = "initial";

  function definir(proximo) {
    if (estado === proximo) return false;
    estado = proximo;
    onChange?.(estado);
    return true;
  }

  return {
    get estado() { return estado; },
    get destino() { return destino; },
    get travado() { return travado; },

    /** @returns {boolean} verdadeiro quando a travessia realmente começou. */
    abrir() {
      if (travado || destino === "revealed") return false;
      travado = true;
      destino = "revealed";
      definir("transitioning");
      return true;
    },

    fechar() {
      if (travado || destino === "initial") return false;
      travado = true;
      destino = "initial";
      definir("transitioning");
      return true;
    },

    /*
     * Abandona a linha do tempo em curso para começar outra.
     *
     * A trava existe para recusar o clique repetido no MESMO bloco, e não para
     * prender a jornada inteira: quem clica em outro bloco no meio da travessia
     * está pedindo outra coisa, e ignorá-lo por dois segundos faz o site
     * parecer travado. Reiniciar é determinístico porque a linha do tempo
     * seguinte parte do mesmo lugar que qualquer outra.
     */
    interromper() {
      travado = false;
      return estado;
    },

    /** Chamado quando a linha do tempo termina. Libera os cliques. */
    concluir(alvo) {
      travado = false;
      destino = alvo === "revealed" ? "revealed" : "initial";
      return definir(destino);
    },

    progresso(valor) {
      return clamp01(valor);
    },
  };
}
