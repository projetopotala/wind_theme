/*
 * O estado do editor de uma página: o que está publicado, o que está no rascunho e o que a pessoa acabou de mexer.
 *
 * Puro (sem DOM e sem rede) de propósito: é a lógica que decide o que o editor acredita estar no ar e o que
 * "Publicar" leva. Errar aqui não aparece na tela — aparece depois, com alguém publicando o que não queria.
 *
 * O conteúdo é um mapa chave -> campos que DIFEREM do original da página. "Atual" é o que a prévia mostra;
 * "salvo" é o último rascunho gravado no banco (ou o publicado, quando não há rascunho).
 */

const LIMITE_DESFAZER = 60;

const copiar = (conteudo) => JSON.parse(JSON.stringify(conteudo || {}));
const igual = (a, b) => JSON.stringify(ordenar(a)) === JSON.stringify(ordenar(b));
function ordenar(valor) {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === "object") return Object.fromEntries(Object.keys(valor).sort().map((k) => [k, ordenar(valor[k])]));
  return valor;
}

/** Remove os campos iguais ao original: "alterar" para o mesmo valor não é alteração. */
export function limparConteudo(manifesto, conteudo) {
  const limpo = {};
  const porChave = new Map((manifesto?.elementos || []).map((item) => [item.chave, item]));
  for (const [chave, campos] of Object.entries(conteudo || {})) {
    const item = porChave.get(chave);
    if (!item) continue; // chave que a página não tem mais: não segue adiante
    const restante = {};
    for (const [campo, valor] of Object.entries(campos || {})) {
      if (campo === "alt" && item.tipo === "imagem") {
        if (valor !== (item.original.alt ?? "")) restante[campo] = valor;
      } else if (campo === "pos") {
        if (valor) restante[campo] = valor;
      } else if (valor !== item.original[campo]) restante[campo] = valor;
    }
    if (Object.keys(restante).length) limpo[chave] = restante;
  }
  return limpo;
}

/**
 * @param {{ manifesto: object, publicado?: {version:number, content:object}, rascunho?: {revision:number, base_version:number, content:object}|null }} entrada
 */
export function criarEstadoEditor({ manifesto, publicado = { version: 0, content: {} }, rascunho = null } = {}) {
  let versaoPublicada = publicado.version || 0;
  let conteudoPublicado = copiar(publicado.content);
  let revisao = rascunho ? rascunho.revision : 0;
  let salvo = copiar(rascunho ? rascunho.content : publicado.content);
  let atual = copiar(salvo);
  let temRascunho = Boolean(rascunho);
  const pilha = [];
  const refazer = [];

  const guardar = () => { pilha.push(copiar(atual)); if (pilha.length > LIMITE_DESFAZER) pilha.shift(); refazer.length = 0; };

  return {
    get conteudo() { return copiar(atual); },
    get publicado() { return copiar(conteudoPublicado); },
    get versaoPublicada() { return versaoPublicada; },
    get revisao() { return revisao; },
    get temRascunho() { return temRascunho; },
    get podeDesfazer() { return pilha.length > 0; },
    get podeRefazer() { return refazer.length > 0; },
    /** Há mudanças que ainda não foram gravadas no banco. */
    get naoSalvo() { return !igual(limparConteudo(manifesto, atual), limparConteudo(manifesto, salvo)); },
    /** O que o rascunho (ou a prévia atual) muda em relação ao que está no ar. */
    get diferencasComPublicado() {
      const a = limparConteudo(manifesto, atual);
      const p = limparConteudo(manifesto, conteudoPublicado);
      return [...new Set([...Object.keys(a), ...Object.keys(p)])].filter((chave) => !igual(a[chave] || {}, p[chave] || {}));
    },
    /** publicado | rascunho (salvo, ainda não público) | alterado (não salvo) */
    get situacao() {
      if (this.naoSalvo) return "alterado";
      if (this.diferencasComPublicado.length) return "rascunho";
      return "publicado";
    },
    valorDe(chave) {
      const item = manifesto.elementos.find((e) => e.chave === chave);
      return { ...(item?.original || {}), ...(atual[chave] || {}) };
    },
    alterado(chave) { return Boolean(limparConteudo(manifesto, { [chave]: atual[chave] || {} })[chave]); },
    definir(chave, campos) {
      const antes = JSON.stringify(ordenar(atual));
      const proximo = { ...(atual[chave] || {}), ...campos };
      const copia = { ...atual, [chave]: proximo };
      const limpo = limparConteudo(manifesto, copia);
      const novo = { ...atual };
      if (limpo[chave]) novo[chave] = limpo[chave]; else delete novo[chave];
      if (JSON.stringify(ordenar(novo)) === antes) return false;
      guardar();
      atual = novo;
      return true;
    },
    restaurarOriginal(chave) {
      if (!atual[chave]) return false;
      guardar();
      const novo = { ...atual };
      delete novo[chave];
      atual = novo;
      return true;
    },
    desfazer() {
      if (!pilha.length) return false;
      refazer.push(copiar(atual));
      atual = pilha.pop();
      return true;
    },
    refazer() {
      if (!refazer.length) return false;
      pilha.push(copiar(atual));
      atual = refazer.pop();
      return true;
    },
    /** O banco confirmou o rascunho. */
    marcarSalvo({ revision }) {
      salvo = limparConteudo(manifesto, atual);
      atual = copiar(salvo);
      revisao = revision;
      temRascunho = true;
    },
    marcarPublicado({ version }) {
      versaoPublicada = version;
      conteudoPublicado = limparConteudo(manifesto, atual);
      salvo = copiar(conteudoPublicado);
      atual = copiar(conteudoPublicado);
      revisao = 0;
      temRascunho = false;
      pilha.length = 0; refazer.length = 0;
    },
    marcarDescartado() {
      salvo = copiar(conteudoPublicado);
      atual = copiar(conteudoPublicado);
      revisao = 0;
      temRascunho = false;
      pilha.length = 0; refazer.length = 0;
    },
    /** Substitui o estado pelo que veio do banco (outra aba, restauração). */
    recarregar({ publicado: pub, rascunho: rasc }) {
      versaoPublicada = pub.version || 0;
      conteudoPublicado = copiar(pub.content);
      revisao = rasc ? rasc.revision : 0;
      salvo = copiar(rasc ? rasc.content : pub.content);
      atual = copiar(salvo);
      temRascunho = Boolean(rasc);
      pilha.length = 0; refazer.length = 0;
    },
    /** Alterações recuperadas do navegador (queda de rede, aba fechada): entram como não salvas. */
    carregarNaoSalvo(conteudo) {
      guardar();
      atual = copiar(conteudo);
    },
  };
}
