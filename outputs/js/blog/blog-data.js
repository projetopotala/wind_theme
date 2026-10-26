/*
 * O QUE O BLOG PÚBLICO PRECISA SABER SEM PERGUNTAR AO BANCO.
 *
 * Categorias padrão, a carta do dia e utilitários de data e contagem. Nenhum
 * texto do Blog mora aqui: a fonte editorial é o banco, e um texto empacotado
 * neste arquivo chegaria a todo visitante — inclusive depois de a equipe
 * tirá-lo do ar. O acervo inicial que semeou o banco vive fora dos arquivos
 * publicados, em scripts/dados/blog-acervo-inicial.mjs.
 */

/*
 * As categorias saem do que o Instituto REALMENTE faz — o site no ar fala em
 * terapias, oráculos, cursos, cultura e práticas corporais — e não de uma lista
 * genérica de blog. "Oráculos" é a que mais destoa de qualquer outro portal, e
 * é exatamente por isso que ela fica.
 */
export const CATEGORIAS = [
  { id: "todos", rotulo: "tudo" },
  { id: "artigos", rotulo: "artigos" },
  { id: "oraculos", rotulo: "oráculos" },
  { id: "terapias", rotulo: "terapias" },
  { id: "cursos", rotulo: "cursos" },
  { id: "cultura", rotulo: "cultura" },
  { id: "praticas", rotulo: "práticas" },
];

/*
 * O ORÁCULO DO DIA.
 *
 * A mesma carta para todo mundo, no mesmo dia, e mudando à meia-noite. Um
 * sorteio a cada carregamento transformaria o oráculo num gerador aleatório:
 * quem recarregasse duas vezes veria a mecânica em vez da leitura, e a segunda
 * carta desmentiria a primeira.
 */
export const CARTAS = [
  { nome: "A Ponte", motivo: "ponte", verso: "As duas margens já são conhecidas. O que falta é atravessar." },
  { nome: "A Semente", motivo: "semente", verso: "O que foi plantado não pede pressa. Pede constância." },
  { nome: "O Espelho", motivo: "circulo", verso: "O que incomoda no outro costuma ter endereço mais perto." },
  { nome: "A Montanha", motivo: "montanha", verso: "Subir devagar ainda é subir. Parar no meio também é caminho." },
  { nome: "A Fumaça", motivo: "fumaca", verso: "Nem tudo que sobe precisa ser retido. Deixe passar." },
  { nome: "O Cristal", motivo: "cristal", verso: "A mesma luz, vista por outra face, conta outra coisa." },
  { nome: "O Lótus", motivo: "lotus", verso: "Ele nasce na água parada, e não apesar dela." },
];

/**
 * Escolhe a carta do dia a partir da DATA, e não do relógio nem do acaso.
 *
 * Recebe a data por parâmetro para poder ser testada: uma função que lesse
 * `new Date()` por dentro só poderia ser verificada no dia em que o teste roda.
 *
 * @param {Date} quando
 * @returns {{nome: string, motivo: string, verso: string}}
 */
export function cartaDoDia(quando = new Date()) {
  const data = quando instanceof Date && !Number.isNaN(quando.getTime()) ? quando : new Date(0);
  /* Dias inteiros desde a época, no fuso de quem lê: `getTime()` puro viraria
     de carta às 21h no horário de Brasília, que é meia-noite em Londres. */
  const dia = Math.floor(
    Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()) / 86400000,
  );
  const indice = ((dia % CARTAS.length) + CARTAS.length) % CARTAS.length;
  return CARTAS[indice];
}

/**
 * Filtra por categoria. "todos" devolve tudo, e é o estado inicial.
 *
 * @param {Array} posts
 * @param {string} categoria
 */
export function filtrarPorCategoria(posts, categoria) {
  const lista = Array.isArray(posts) ? posts : [];
  if (!categoria || categoria === "todos") return [...lista];
  return lista.filter((post) => post.categoria === categoria);
}

/**
 * Quantos posts cada categoria tem, para a navegação poder desligar as vazias.
 *
 * Uma aba que abre uma lista vazia é pior do que uma aba ausente: quem clica
 * conclui que o blog quebrou, e não que ainda não há texto ali.
 */
export function contarPorCategoria(posts) {
  const contas = { todos: Array.isArray(posts) ? posts.length : 0 };
  for (const post of Array.isArray(posts) ? posts : []) {
    contas[post.categoria] = (contas[post.categoria] || 0) + 1;
  }
  return contas;
}

/**
 * A data como se lê em voz alta, e o valor legível por máquina junto.
 *
 * Devolve os dois porque o `<time>` precisa dos dois: `datetime` para quem
 * indexa e o texto para quem lê.
 */
export function dataLegivel(iso) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!partes) return { iso: "", texto: "" };
  const [, ano, mes, dia] = partes;
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return { iso, texto: `${Number(dia)} de ${MESES[Number(mes) - 1]} de ${ano}` };
}
