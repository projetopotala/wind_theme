/*
 * A PROGRAMAÇÃO POR CATEGORIA.
 *
 * O Instituto oferece atendimentos, cursos, aulas, eventos culturais, grupos de
 * estudo, oficinas e mentorias, e essas coisas moram em sete páginas
 * diferentes. Quem chega na Programação querendo ver o que tem de curso não
 * quer aprender a topografia do site: quer um índice.
 *
 * A forma é de LISTA, e a pesquisa é por CATEGORIA.
 *
 * As duas coisas resolvem problemas diferentes e por isso convivem. A lista é o
 * formato: cartões davam a cada modalidade o peso visual de uma seção inteira,
 * e dezesseis deles viravam uma parede. A pesquisa é o atalho: quem já sabe que
 * veio atrás de curso não deveria rolar por atendimentos e atividades antes.
 *
 * A pesquisa é por pastilha, e não por campo de texto. Um campo aqui seria a
 * segunda busca do Portal — a primeira, com índice das páginas, vive na Home —
 * e prometeria procurar numa agenda que este site não tem. As categorias
 * prometem só o que entregam.
 *
 * Nada é MONTADO por script: a lista inteira está no HTML e o filtro apenas
 * esconde. Montada por script, a seção nasceria vazia para quem chega sem
 * JavaScript, e a busca da Home, que lê o texto do arquivo, não acharia
 * modalidade nenhuma. Este módulo é a fonte única da lista — o gerador leu
 * daqui, e o teste compara a página com ele, para que não envelheçam separados.
 */

/* A pastilha que não filtra nada. Vem primeiro e começa marcada: o estado
   inicial da seção é a resposta completa, não um recorte que ninguém pediu. */
export const TODAS = { id: "todas", rotulo: "Tudo" };

export const CATEGORIAS = [
  { id: "atendimentos", rotulo: "Atendimentos" },
  { id: "cursos", rotulo: "Cursos" },
  { id: "atividades", rotulo: "Atividades" },
  { id: "culturais", rotulo: "Eventos culturais" },
  { id: "grupos", rotulo: "Grupos de estudo" },
  { id: "oficinas", rotulo: "Oficinas" },
  { id: "mentorias", rotulo: "Mentorias" },
];

/**
 * As modalidades, cada uma na sua categoria e com o seu destino.
 *
 * UMA categoria por item, e não uma lista. Num filtro, aparecer em duas era
 * conveniente; num índice agrupado, o mesmo nome em dois lugares lê como erro
 * de quem montou a página, não como riqueza da casa.
 *
 * Um item sem destino seria uma linha de índice que não leva a lugar nenhum —
 * o pior tipo de resposta, porque parece que respondeu.
 */
export const MODALIDADES = [
  { titulo: "Atendimentos individuais", categoria: "atendimentos", href: "atendimentos.html",
    texto: "Sessões marcadas uma a uma, com hora combinada e sem obrigação de continuidade." },
  { titulo: "Terapias integrativas", categoria: "atendimentos", href: "saude-integrativa.html",
    texto: "Práticas que acompanham o cuidado convencional em vez de substituí-lo." },
  { titulo: "Cursos livres", categoria: "cursos", href: "cursos.html",
    texto: "Um tema, um ciclo com começo e fim, sem pré-requisito de formação." },
  { titulo: "Formações profissionais", categoria: "cursos", href: "cursos.html",
    texto: "Percursos longos, com prática supervisionada, para quem vai atuar na área." },
  { titulo: "Monte seu curso", categoria: "cursos", href: "cursos.html",
    texto: "Turmas que nascem de um grupo que se juntou e pediu — e não do calendário." },
  { titulo: "Corpo e consciência", categoria: "atividades", href: "atividades.html",
    texto: "Yoga, pilates, alongamento e consciência corporal, de segunda a sexta." },
  { titulo: "Práticas orientais", categoria: "atividades", href: "atividades.html",
    texto: "Tai chi chuan, qi gong e artes marciais, em turmas por tempo de prática." },
  { titulo: "Dança e expressão", categoria: "atividades", href: "atividades.html",
    texto: "Dança contemporânea, danças circulares e expressão corporal, à noite." },
  { titulo: "Convivência", categoria: "atividades", href: "atividades.html",
    texto: "Meditação, rodas de conversa e encontros de silêncio, aos sábados." },
  { titulo: "Mente e expressão", categoria: "atividades", href: "atividades.html",
    texto: "Desenho, pintura, violão, violino, canto, xadrez, escrita, teatro e fotografia." },
  { titulo: "Cine Potala", categoria: "culturais", href: "cultura.html",
    texto: "Sessões com conversa depois, abertas a quem não estuda na casa." },
  { titulo: "Biblioteca Potala", categoria: "culturais", href: "cultura.html",
    texto: "Acervo de consulta e o ponto de encontro de boa parte dos grupos." },
  { titulo: "Eventos futuros", categoria: "culturais", href: "eventos.html",
    texto: "Mostras, torneios, saraus e retiros — os marcos maiores do calendário." },
  { titulo: "Grupos de estudo", categoria: "grupos", href: "grupos-de-estudo.html",
    texto: "Permanentes, sem começo de turma: quem entra em março não está atrasado." },
  { titulo: "Workshops de fim de semana", categoria: "oficinas", href: "workshops.html",
    texto: "Encontro único, um assunto, o suficiente para continuar sozinho depois." },
  { titulo: "Mentorias", categoria: "mentorias", href: "mentorias.html",
    texto: "Acompanhamento individual em ciclos declarados, de quatro a doze meses." },
];

/**
 * As modalidades agrupadas, na ordem em que as categorias foram declaradas.
 *
 * Categoria sem item NÃO entra: um título de seção seguido de nada é uma
 * promessa que a página não cumpre, e é o que aconteceria no dia em que alguém
 * previsse uma categoria antes de haver o que pôr nela.
 *
 * @param {Array<{categoria: string}>} [itens]
 * @returns {Array<{id: string, rotulo: string, itens: object[]}>}
 */
export function agruparPorCategoria(itens = MODALIDADES) {
  const lista = Array.isArray(itens) ? itens : [];
  return CATEGORIAS
    .map(({ id, rotulo }) => ({ id, rotulo, itens: lista.filter((item) => item.categoria === id) }))
    .filter((grupo) => grupo.itens.length > 0);
}

/**
 * As modalidades que ficariam de fora do índice.
 *
 * Um item com categoria errada some da página sem quebrar nada: a lista
 * continua bonita, mais curta em um, e ninguém percebe. Esta função existe para
 * o teste ter como perguntar.
 *
 * @param {Array<{categoria: string}>} [itens]
 * @returns {Array<object>}
 */
export function semCategoria(itens = MODALIDADES) {
  const conhecidas = new Set(CATEGORIAS.map((c) => c.id));
  return (Array.isArray(itens) ? itens : []).filter((item) => !conhecidas.has(item.categoria));
}

/**
 * Liga as pastilhas aos grupos da lista.
 *
 * Esconde GRUPOS inteiros, e não linhas soltas: como cada modalidade tem uma
 * categoria só, filtrar por categoria é escolher um grupo. Escondendo linha a
 * linha sobrariam cabeçalhos sem nada embaixo.
 *
 * @param {ParentNode} root
 * @returns {{destroy(): void}}
 */
export function mountCategorias(root = document) {
  const secao = root.querySelector?.("[data-categorias]");
  if (!secao) return { destroy() {} };

  const pastilhas = [...secao.querySelectorAll("[data-categoria]")];
  const grupos = [...secao.querySelectorAll("[data-grupo]")];
  const aviso = secao.querySelector("[data-categorias-aviso]");
  if (!pastilhas.length || !grupos.length) return { destroy() {} };

  const rotuloDe = (id) => [TODAS, ...CATEGORIAS].find((c) => c.id === id)?.rotulo;

  const aplicar = (escolhida) => {
    /*
     * Uma categoria desconhecida cai em "todas".
     *
     * Se alguém trocar o id de uma pastilha e esquecer da lista, a seção
     * continua respondendo a pergunta inteira — em vez de ficar vazia, que
     * parece defeito e não diz o que houve.
     */
    const alvo = rotuloDe(escolhida) ? escolhida : TODAS.id;
    let itens = 0;
    for (const grupo of grupos) {
      const mostra = alvo === TODAS.id || grupo.dataset.grupo === alvo;
      grupo.hidden = !mostra;
      if (mostra) itens += Number(grupo.dataset.grupoItens || 0);
    }
    for (const pastilha of pastilhas) {
      pastilha.setAttribute("aria-pressed", String(pastilha.dataset.categoria === alvo));
    }
    if (aviso) {
      aviso.textContent = alvo === TODAS.id
        ? `${itens} modalidades no Instituto.`
        : `${itens} ${itens === 1 ? "modalidade" : "modalidades"} em ${rotuloDe(alvo)}.`;
    }
  };

  const onClique = (evento) => {
    const pastilha = evento.target?.closest?.("[data-categoria]");
    if (!pastilha) return;
    aplicar(pastilha.dataset.categoria);
  };

  secao.addEventListener("click", onClique);
  aplicar(TODAS.id);

  return { destroy() { secao.removeEventListener("click", onClique); } };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountCategorias(document), { once: true });
  } else {
    mountCategorias(document);
  }
}
