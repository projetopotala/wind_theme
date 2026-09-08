/*
 * NOVIDADES NA ABERTURA DA JORNADA.
 *
 * O visitante que chega precisa ver primeiro o que MUDOU no Instituto — novos
 * profissionais, o oráculo do dia, o ciclo de cinema que volta — e só depois as
 * seções permanentes. Sem isso a Home conta sempre a mesma história, e quem
 * volta na semana seguinte não tem como saber que algo aconteceu.
 *
 * O MARCADOR É UMA TAG, e não uma coluna nova.
 *
 * Um campo `kind` no banco pediria migração em `home_blocks`, e a última que
 * este projeto precisou — a dos rascunhos — segue sem ser aplicada. `tags` já
 * existe, já é `text[]`, já é editável pelo painel e já viaja em todas as
 * leituras. O bloco marcado é o bloco que carrega a tag.
 *
 * O preço é que a tag também é um TEMA na tela, e "recente" não é tema de
 * nada — daí `temasVisiveis`, que a esconde das pastilhas.
 */

/** A tag que promove um bloco a novidade. Minúscula e sem acento, de propósito:
 *  ela é digitada à mão no painel, e comparar sem normalizar transformaria
 *  "Recente" e "recentes" em blocos que não aparecem sem ninguém entender. */
export const TAG_NOVIDADE = "recente";

const semAcento = (valor) => String(valor ?? "")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .trim()
  .toLowerCase();

/*
 * Aceita o singular e o plural, e o acento é indiferente.
 *
 * Quem digita a tag no painel escreve "Recentes" tanto quanto "recente" — o
 * rótulo que aparece na tela é o plural, e é ele que fica na cabeça. Recusar
 * uma das formas produziria um bloco que a pessoa marcou, salvou e publicou, e
 * que mesmo assim não sobe para o topo: um silêncio impossível de depurar pela
 * tela.
 */
const FORMAS = new Set(["recente", "recentes", "novidade", "novidades"]);

/** @param {{tags?: string[]}} bloco */
export function ehNovidade(bloco) {
  const tags = Array.isArray(bloco?.tags) ? bloco.tags : [];
  return tags.some((tag) => FORMAS.has(semAcento(tag)));
}

/**
 * O rótulo do canto do cartão.
 *
 * TODO cartão recebe um: é o contraste entre os dois que informa. Só as
 * novidades marcadas deixaria o visitante sem saber se um cartão sem etiqueta é
 * permanente ou se alguém esqueceu de marcá-lo.
 */
export function rotuloDoCartao(bloco) {
  return ehNovidade(bloco) ? "Recentes" : "Destacado";
}

/**
 * As novidades primeiro, o resto depois, cada grupo na ordem que já tinha.
 *
 * Estável de propósito: dentro de cada grupo a ordem continua sendo a que o
 * editor arrastou no painel. Reordenar por data exigiria uma data confiável em
 * cada bloco — e uma jornada que se reordena sozinha tira do editor o controle
 * sobre a própria narrativa.
 *
 * `position` é reescrito, porque é ele que a Home usa para o ritmo, a direção
 * da estrada e o lado do bloco. Sem reescrever, os quatro primeiros cartões
 * herdariam a geometria do lugar de onde vieram.
 */
export function novidadesPrimeiro(blocos) {
  const lista = Array.isArray(blocos) ? blocos : [];
  const novidades = lista.filter(ehNovidade);
  const fixos = lista.filter((bloco) => !ehNovidade(bloco));
  return [...novidades, ...fixos].map((bloco, position) => ({ ...bloco, position }));
}

/**
 * Os temas que aparecem como pastilha — sem a tag que só serve de marcador.
 *
 * "recente" numa lista chamada "Temas desta região" seria uma mentira pequena e
 * visível: não é assunto do bloco, é instrução para o layout.
 */
export function temasVisiveis(tags) {
  return (Array.isArray(tags) ? tags : []).filter((tag) => !FORMAS.has(semAcento(tag)));
}

/**
 * Liga ou desliga a marcação, devolvendo a lista de tags nova.
 *
 * É o painel que chama: a caixa "Novidade recente" não edita o campo de temas
 * diretamente, para não apagar o que a pessoa escreveu ali.
 */
export function comMarcacao(tags, marcado) {
  const atuais = (Array.isArray(tags) ? tags : []).filter((tag) => String(tag).trim());
  const semMarcador = atuais.filter((tag) => !FORMAS.has(semAcento(tag)));
  /* O marcador entra no FIM: entrando no começo, ele empurraria os temas e
     mudaria a ordem das pastilhas a cada vez que alguém marcasse e desmarcasse. */
  return marcado ? [...semMarcador, TAG_NOVIDADE] : semMarcador;
}

/**
 * Junta as novidades definidas em CÓDIGO com os blocos que vieram do banco.
 *
 * O PROBLEMA QUE ISTO RESOLVE: a Home e a prévia do painel leem `home_blocks` no
 * Supabase, e o snapshot local só entra em cena quando essa leitura FALHA. As
 * novidades foram escritas no código, então não apareciam em lugar nenhum —
 * nem na Home, nem na prévia — enquanto o banco respondesse normalmente.
 *
 * E elas não podem simplesmente virar linhas do banco. Cada uma carrega o
 * `motivo`, que é o desenho da capa, e o painel não tem campo para isso: criadas
 * pela tela, sairiam sem figura, que é justamente o que as distingue.
 *
 * Por id, e sem sobrescrever: um bloco que já existe no banco ganhou lá uma
 * versão editada, e a edição de quem mantém o site vale mais que o padrão do
 * código.
 *
 * A consequência a saber: apagar uma novidade exige apagá-la do código. Pelo
 * painel ela voltaria no carregamento seguinte. É o preço de a capa morar num
 * campo que o banco não tem — e some no dia em que o acervo do Blog for dados.
 */
export function comNovidadesDoCodigo(blocos, novidades) {
  const lista = Array.isArray(blocos) ? blocos : [];
  const doCodigo = Array.isArray(novidades) ? novidades : [];
  const jaExistem = new Set(lista.map((bloco) => bloco?.id).filter(Boolean));
  const faltando = doCodigo.filter((bloco) => bloco?.id && !jaExistem.has(bloco.id));
  return [...faltando, ...lista];
}
