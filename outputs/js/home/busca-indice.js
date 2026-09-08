/*
 * O ÍNDICE DE BUSCA DAS SEÇÕES.
 *
 * A busca da Home enxergava só o texto dos BLOCOS — título, resumo, temas. Quem
 * procurasse "desenho" não achava nada, porque a palavra vive dentro de
 * `atividades.html` e não no resumo do bloco. O Instituto ensina desenho; a
 * busca dizia que não.
 *
 * O índice é gerado por script e servido como um arquivo só. As alternativas
 * eram piores: buscar dentro de doze páginas a cada consulta faria a pessoa
 * esperar doze requisições depois de apertar Enter, e listar palavras-chave à
 * mão em cada bloco é um trabalho que envelhece calado — alguém edita a página
 * e ninguém lembra da lista.
 *
 * O preço é a possibilidade de o índice ficar velho. Um teste regenera e compara
 * a cada execução da suíte, então "velho" vira falha e não surpresa.
 */

/**
 * O texto que um leitor veria na página, sem marcação.
 *
 * Pura e compartilhada entre o script que gera e o teste que confere: se cada
 * lado tivesse a sua, os dois poderiam divergir e o teste passaria a comparar
 * duas coisas erradas do mesmo jeito.
 */
export function extrairTextoDaPagina(html) {
  return String(html ?? "")
    /*
     * Comentários primeiro, e antes das tags.
     *
     * Este projeto explica as decisões nos comentários do HTML, e eles são
     * longos. Indexados, uma busca por "fenda" ou "degrau" acharia a página em
     * que eu expliquei um problema de layout — conteúdo que não existe para o
     * visitante.
     */
    .replace(/<!--[\s\S]*?-->/g, " ")
    /* `script` e `style` têm texto que não é texto: código e seletores. */
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    /* O `alt` das imagens ENTRA: ele descreve o que se vê, e quem procura pelo
       que viu numa foto está procurando conteúdo da página. */
    .replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/gi, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** As páginas que o índice cobre — as mesmas para onde os blocos apontam. */
export const PAGINAS_INDEXADAS = [
  "quem-somos.html",
  "recepcao.html",
  "atendimentos.html",
  "cursos.html",
  "atividades.html",
  "profissionais.html",
  "programacao.html",
  "cultura.html",
  "marketplace.html",
  "inspiracao.html",
  "revista.html",
  "blog.html",
];

/*
 * Um teto por página, em caracteres.
 *
 * Sem ele o índice cresceria com o conteúdo e a Home baixaria um arquivo cada
 * vez maior para responder a uma palavra. O começo de uma página é onde estão
 * título, resumo e as listas de práticas — que é o que alguém digita.
 *
 * Subiu de 6000 para 9000 quando as aulas de Atividades ganharam rotina
 * própria: a página passou a ter 7380 caracteres e o corte caía exatamente em
 * cima da fotografia, a última da lista. Um teto que decapita o fim da página
 * mais longa é pior do que teto nenhum, porque o buraco é silencioso — a busca
 * responde sobre desenho e diz que fotografia não existe.
 */
export const LIMITE_POR_PAGINA = 9000;

export function recortar(texto) {
  const limpo = String(texto ?? "");
  return limpo.length <= LIMITE_POR_PAGINA ? limpo : limpo.slice(0, LIMITE_POR_PAGINA);
}
