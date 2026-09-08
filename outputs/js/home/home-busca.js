/*
 * A BUSCA DA JORNADA.
 *
 * Ela não leva a outra página. Encontra o bloco que responde ao que foi digitado,
 * desce até ele e o abre — e para por aí. Quem decide ir ao destino é o
 * visitante, no link que o bloco aberto oferece.
 *
 * Isso é uma escolha, e não uma limitação: buscar "tai chi" e ser jogado para
 * outra página tira da pessoa a chance de ver que o Instituto tem também as
 * práticas orientais ao lado, os cursos adiante e a programação depois. A busca
 * abre uma porta na jornada; ela não atravessa a porta por ninguém.
 */

/*
 * Comparação sem acento e sem caixa.
 *
 * Ninguém digita "oráculo" com acento numa caixa de busca, e "TAI CHI" é tão
 * provável quanto "tai chi". Exigir a forma exata faria a busca falhar
 * justamente para quem tem pressa.
 */
const normalizar = (valor) => String(valor ?? "")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toLowerCase();

/*
 * Palavras curtas e palavras de ligação não contam.
 *
 * "encontra tai chi" tem três palavras e só duas dizem alguma coisa. Sem esta
 * lista, "de" e "com" casariam com quase todo bloco e o primeiro da lista
 * ganharia sempre — a busca pareceria funcionar e sempre daria o mesmo lugar.
 */
const LIGACAO = new Set([
  "encontra", "encontrar", "busca", "buscar", "procuro", "procurar", "quero",
  "onde", "sobre", "para", "com", "dos", "das", "uma", "que", "por", "aos",
]);

export function termosDaBusca(texto) {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((termo) => termo.length >= 3 && !LIGACAO.has(termo));
}

/*
 * Onde o termo aparece importa mais do que quantas vezes.
 *
 * Um bloco cujo TÍTULO é a palavra buscada responde melhor do que outro que a
 * menciona de passagem no corpo do texto. Sem os pesos, um texto longo vencia
 * qualquer título só por ter mais palavras.
 */
const PESOS = [
  { campo: "title", peso: 8 },
  { campo: "category", peso: 5 },
  { campo: "summary", peso: 3 },
  { campo: "body", peso: 1 },
];

/**
 * @param {object} bloco
 * @param {string[]} termos
 * @param {Record<string, string>} [indice] texto das páginas de seção, por arquivo
 * @returns {number} zero quando o bloco não responde ao termo
 */
export function pontuarBloco(bloco, termos, indice) {
  if (!bloco || !termos?.length) return 0;
  const tags = (Array.isArray(bloco.tags) ? bloco.tags : []).join(" ");
  const campos = PESOS.map(({ campo, peso }) => ({ texto: normalizar(bloco[campo]), peso }));
  campos.push({ texto: normalizar(tags), peso: 5 });

  /*
   * O TEXTO DA PÁGINA que o bloco abre, com o menor peso de todos.
   *
   * É o que faz "desenho" achar Atividades: a palavra vive dentro da seção e
   * nunca esteve no resumo do bloco. Mas uma página inteira tem centenas de
   * palavras, e com peso alto qualquer bloco venceria qualquer outro por
   * mencionar o termo de passagem — o peso 1 deixa que ela desempate quando
   * mais nada responde, sem passar na frente de um título.
   */
  const pagina = String(bloco.href || "").split("#")[0];
  if (indice?.[pagina]) campos.push({ texto: normalizar(indice[pagina]), peso: 1 });

  let total = 0;
  for (const termo of termos) {
    for (const { texto, peso } of campos) {
      if (!texto.includes(termo)) continue;
      /*
       * A palavra inteira vale mais que o pedaço.
       *
       * Sem isso, "arte" casaria com "quarteirão" tão bem quanto com "arte", e
       * a busca por uma palavra curta traria o bloco errado com confiança.
       */
      const inteira = new RegExp(`(^|[^a-z0-9])${termo}([^a-z0-9]|$)`).test(texto);
      total += peso * (inteira ? 2 : 1);
    }
  }
  return total;
}

/**
 * O bloco que melhor responde ao que foi digitado.
 *
 * Devolve `null` quando nada responde — e é importante que devolva, em vez de
 * cair no primeiro da lista: mandar a pessoa para um bloco qualquer é pior do
 * que dizer que não achou, porque ela conclui que o site entendeu.
 *
 * Empate fica com o primeiro da jornada: a ordem já foi decidida por quem
 * edita, e desempatar por outro critério inventaria uma preferência.
 */
export function procurarBloco(blocos, texto, indice) {
  const termos = termosDaBusca(texto);
  if (!termos.length) return null;

  let melhor = null;
  let melhorPonto = 0;
  for (const bloco of Array.isArray(blocos) ? blocos : []) {
    const ponto = pontuarBloco(bloco, termos, indice);
    if (ponto > melhorPonto) {
      melhorPonto = ponto;
      melhor = bloco;
    }
  }
  return melhor;
}
