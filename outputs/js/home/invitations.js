/**
 * Convites para conhecer cada parte do instituto.
 *
 * O texto é escrito por bloco, e não montado com "Conheça " + título: em
 * português o artigo muda com o gênero e o número, e a fórmula automática
 * produziria "Conheça Atendimentos" ou "Conheça Programação" — frases que
 * ninguém diria. Escrever as nove custa nove linhas e devolve nove frases
 * inteiras.
 *
 * O fallback existe porque o conteúdo é editável: um bloco criado no painel
 * não estará nesta lista, e "Conheça" mais o título é feio mas não quebra —
 * melhor uma frase torta do que um convite vazio.
 */
const CONVITES = {
  "quem-somos": "Conheça quem somos",
  recepcao: "Comece com uma conversa",
  atendimentos: "Conheça nossos atendimentos",
  cursos: "Conheça nossos cursos",
  atividades: "Conheça nossas atividades",
  profissionais: "Conheça nossos profissionais",
  programacao: "Veja o que está acontecendo",
  "arte-cultura": "Conheça nossa arte e cultura",
  marketplace: "Visite nossa loja",
  inspiracao: "Faça uma pausa com a gente",
};

/**
 * Os convites dos blocos publicados, na ordem da jornada.
 *
 * Só entram blocos que tenham para onde levar: um convite que não leva a lugar
 * nenhum é uma promessa quebrada no canto da tela.
 */
export function invitationsFor(blocks = []) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block && block.id && block.title)
    .map((block) => ({
      id: String(block.id),
      text: CONVITES[block.id] || `Conheça ${block.title}`,
    }));
}

/**
 * O próximo convite da roda.
 *
 * Separado do relógio de propósito: assim o giro pode ser conferido sem
 * esperar o tempo passar, e o laço que o chama não precisa saber contar.
 */
export function nextInvitationIndex(current, total) {
  const quantos = Math.max(0, Math.trunc(Number(total) || 0));
  if (quantos === 0) return 0;
  const atual = Math.trunc(Number(current) || 0);
  return ((atual + 1) % quantos + quantos) % quantos;
}
