/*
 * Busca, abas e contadores — as três leituras da mesma lista.
 *
 * Puro pelo mesmo motivo de admin-draft.js: um filtro que esconde um bloco por
 * engano não parece defeito na tela, parece um bloco que não existe.
 */

/*
 * Dobra acento e caixa.
 *
 * Quem digita "recepcao" tem de achar "Recepção". Sem isto, o resultado da
 * busca passa a depender do teclado de quem procura — e ninguém desconfia de
 * uma busca que devolve menos do que devia.
 */
function dobrar(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function countEntries(entries = []) {
  /* "pendente" está no ar com alterações por publicar, então conta como
     publicado: o visitante vê a versão antiga, mas vê. */
  const publicados = entries.filter((entrada) => entrada.state !== "rascunho").length;
  return { total: entries.length, publicados, rascunhos: entries.length - publicados };
}

export function filterEntries(entries = [], { query = "", tab = "todos" } = {}) {
  const busca = dobrar(query);

  return entries.filter((entrada) => {
    if (tab === "rascunhos" && entrada.state !== "rascunho") return false;
    if (tab === "publicados" && entrada.state === "rascunho") return false;
    if (!busca) return true;
    const campos = [entrada.block?.title, entrada.block?.category, entrada.block?.summary];
    return campos.some((campo) => dobrar(campo).includes(busca));
  });
}
