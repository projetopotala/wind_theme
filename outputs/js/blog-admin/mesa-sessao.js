/*
 * Protecao do que ainda nao foi salvo quando a sessao muda (logout, troca de conta em outra aba).
 *
 * Regras:
 * - Nada e gravado com a identidade de outra conta: o texto que estava aberto pertence a quem o abriu.
 * - Gravacao que termina depois da troca nao entra nos dados da conta nova.
 * - Logout voluntario: grava antes de sair (a sessao ainda e a mesma); se nao der, avisa e deixa copiar.
 * - Troca ja concluida: o texto anterior e descartado, nunca recuperado para a conta nova.
 * Sem DOM, para poder ser testado.
 */

export const MENSAGEM_DE_SESSAO = "A conta mudou. Nada foi salvo para evitar gravar em nome de outra pessoa.";

export class ErroDeSessao extends Error {
  constructor(mensagem = MENSAGEM_DE_SESSAO) {
    super(mensagem);
    this.name = "ErroDeSessao";
  }
}

/* A conta do acesso devolvido pelo login (mesma origem usada nas permissoes). */
export const identidadeDaSessao = (acesso) => acesso?.user?.id || acesso?.session?.user?.id || null;

/* So conta como troca quando as duas contas sao conhecidas e diferentes (renovacao do mesmo login nao conta). */
export const identidadeMudou = (atual, nova) => Boolean(atual && nova && atual !== nova);

export function criarGuardaDeSessao() {
  let identidade = null;
  let geracao = 0;
  let congelada = false;
  return {
    get identidade() { return identidade; },
    get geracao() { return geracao; },
    get congelada() { return congelada; },
    /* Passa a valer para a conta informada. Devolve true quando a conta e outra. */
    adotar(id) {
      const mudou = id !== identidade;
      identidade = id;
      if (mudou) geracao += 1;
      congelada = false;
      return mudou;
    },
    /* Bloqueia gravacoes e invalida as que estao em andamento. */
    congelar() {
      congelada = true;
      geracao += 1;
    },
    /*
     * Grava so se a sessao e a mesma de quando comecou. `aplicar` mexe nos dados da tela e so roda se a sessao
     * nao mudou durante a gravacao.
     */
    async gravar(escrever, aplicar) {
      if (congelada) throw new ErroDeSessao();
      const minha = geracao;
      const resultado = await escrever();
      if (minha !== geracao) throw new ErroDeSessao("A conta mudou durante a gravação. O resultado foi descartado.");
      aplicar?.(resultado);
      return resultado;
    },
  };
}

/* Logout voluntario: sai direto se nao ha nada pendente ou se foi salvo; senao pede confirmacao. */
export function decidirSaida({ temMudancas, salvou }) {
  if (!temMudancas) return "sair";
  return salvou ? "sair" : "confirmar";
}

/* Texto simples do que estava sendo escrito, para o escritor guardar por conta propria antes de sair. */
export function textoParaCopia(post) {
  if (!post) return "";
  const partes = [post.title, post.subtitle].filter((valor) => typeof valor === "string" && valor.trim());
  for (const bloco of Array.isArray(post.content) ? post.content : []) {
    if (!bloco || typeof bloco !== "object") continue;
    const itens = Array.isArray(bloco.items) ? bloco.items.filter((item) => typeof item === "string") : [];
    const linhas = [bloco.text, ...itens, bloco.caption, bloco.cite, bloco.type === "video" ? bloco.url : ""];
    const texto = linhas.filter((valor) => typeof valor === "string" && valor.trim()).join("\n");
    if (texto) partes.push(texto);
  }
  return partes.join("\n\n");
}
