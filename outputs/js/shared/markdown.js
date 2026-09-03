/*
 * Markdown restrito — o único caminho pelo qual o texto do painel vira HTML.
 *
 * O painel guarda texto no banco, nunca HTML. Este módulo é o que transforma as
 * marcas em tags na hora de exibir, e a lista de tags permitidas é a própria
 * gramática dele: ele só sabe emitir o que reconhece. Não existe um saneador
 * separado que alguém possa esquecer de chamar.
 *
 * Escapar vem SEMPRE antes de marcar. Na ordem contrária, um "<b>" colado pelo
 * editor sobreviveria à marcação e chegaria à tela como tag de verdade.
 */

const ESQUEMAS_PERMITIDOS = new Set(["http:", "https:"]);

/*
 * O endereço aceita parênteses aninhados um nível.
 *
 * Sem isso, "[x](javascript:alert(1))" fecharia no primeiro parêntese e
 * deixaria um ")" solto na tela — e, pior, o endereço lido para conferir o
 * esquema seria só o pedaço até ali.
 */
const LINK = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))*)\)/g;

function escapar(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * O endereço de um link, ou "#" quando o esquema não é aceito.
 *
 * Caminho relativo passa: é como a Home aponta para as próprias páginas. O que
 * não passa é esquema executável — `javascript:` roda código no navegador de
 * quem visita, e `data:` carrega um documento inteiro embutido na URL.
 */
export function safeLinkHref(valor) {
  const cru = String(valor ?? "").trim();
  if (!cru) return "#";
  const esquema = cru.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!esquema) return cru;
  return ESQUEMAS_PERMITIDOS.has(`${esquema[1].toLowerCase()}:`) ? cru : "#";
}

/*
 * As marcas de dentro da linha, aplicadas depois do escape.
 *
 * Os links saem primeiro e deixam um marcador no lugar, porque as regras de
 * ênfase varrem a linha inteira: um asterisco dentro do endereço — comum em
 * parâmetro de busca — virava <em> no meio da URL e quebrava o link.
 *
 * O marcador usa "<", que o escape acabou de eliminar do texto de quem
 * escreve. É por isso que ele não pode ser confundido com conteúdo: neste
 * ponto, todo "<" da linha foi posto aqui.
 *
 * O endereço NÃO é escapado de novo. Ele já passou pelo escape junto com o
 * resto da linha, e uma segunda passagem transformaria "&amp;" em
 * "&amp;amp;" — o link chegaria à tela com o endereço errado.
 */
function marcarLinha(escapado) {
  const links = [];
  const comMarcadores = escapado.replace(LINK, (_, texto, url) => {
    links.push(`<a href="${safeLinkHref(url)}">${texto}</a>`);
    return `<L${links.length - 1}>`;
  });

  return comMarcadores
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/<L(\d+)>/g, (_, indice) => links[Number(indice)]);
}

function tipoDaLinha(linha) {
  if (/^\s*[-*]\s+/.test(linha)) return "ul";
  if (/^\s*\d+\.\s+/.test(linha)) return "ol";
  if (/^\s*>\s?/.test(linha)) return "blockquote";
  return "p";
}

function conteudoDaLinha(linha, tipo) {
  if (tipo === "ul") return linha.replace(/^\s*[-*]\s+/, "");
  if (tipo === "ol") return linha.replace(/^\s*\d+\.\s+/, "");
  if (tipo === "blockquote") return linha.replace(/^\s*>\s?/, "");
  return linha;
}

export function renderRestrictedMarkdown(texto) {
  const linhas = String(texto ?? "").replace(/\r\n/g, "\n").split("\n");
  const saida = [];
  let bloco = null;
  let acumulado = [];

  const fechar = () => {
    if (bloco && acumulado.length > 0) {
      const partes = acumulado.map((linha) => marcarLinha(escapar(linha)));
      if (bloco === "ul" || bloco === "ol") {
        saida.push(`<${bloco}>${partes.map((parte) => `<li>${parte}</li>`).join("")}</${bloco}>`);
      } else {
        saida.push(`<${bloco}>${partes.join(" ")}</${bloco}>`);
      }
    }
    bloco = null;
    acumulado = [];
  };

  for (const linha of linhas) {
    if (!linha.trim()) {
      fechar();
      continue;
    }
    const tipo = tipoDaLinha(linha);
    if (tipo !== bloco) fechar();
    bloco = tipo;
    acumulado.push(conteudoDaLinha(linha, tipo));
  }
  fechar();

  return saida.join("");
}
