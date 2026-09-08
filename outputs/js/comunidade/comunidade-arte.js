/*
 * OS SELOS DE QUEM ENSINA.
 *
 * Cada especialista precisa de uma imagem, e a saída óbvia seria o retrato.
 * Retrato de gente que não existe, porém, é uma promessa falsa: quem chega na
 * primeira aula procura aquele rosto. E foto de banco de imagens é pior ainda —
 * são as mesmas pessoas que já ilustram mil outros institutos.
 *
 * Então cada um recebe um SELO: um desenho geométrico do que a pessoa ensina.
 * A espiral de quem trabalha o movimento interno, o tabuleiro de quem ensina
 * xadrez, o diafragma de quem ensina fotografia. Somem-se as iniciais, e o
 * quadro cumpre o que um retrato cumpriria numa lista — dar rosto, ritmo e um
 * jeito de reconhecer quem é quem — sem inventar uma pessoa.
 *
 * SVG desenhado aqui em vez de arquivo: dezesseis selos somam poucos
 * quilobytes, seguem a paleta por currentColor e ficam nítidos em qualquer
 * densidade de tela. É a mesma decisão das capas do blog, pelo mesmo motivo.
 *
 * CUIDADO ao editar: tudo aqui mora dentro de template literals. Uma crase
 * solta num comentário derruba o módulo inteiro, e o erro aparece longe daqui.
 */

const LADO = 160;
const C = LADO / 2;
const T = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

/* Respiração: arcos concêntricos que abrem para cima. */
const respiracao = () => [3, 2, 1].map((i) => {
  const r = 26 + i * 17;
  return `<path ${T} stroke-width="${3.4 - i * 0.4}" opacity="${1 - i * 0.18}"
    d="M${C - r} ${C + 14} A ${r} ${r} 0 0 1 ${C + r} ${C + 14}"/>`;
}).join("") + `<circle ${T} stroke-width="3" cx="${C}" cy="${C + 14}" r="5"/>`;

/* Mola: o corpo que se comprime e devolve. */
const mola = () => {
  const voltas = Array.from({ length: 7 }, (_, i) => {
    const y = 38 + i * 14;
    return `M${C - 34} ${y} C ${C - 10} ${y - 11}, ${C + 10} ${y + 11}, ${C + 34} ${y}`;
  }).join(" ");
  return `<path ${T} stroke-width="3.1" d="${voltas}"/>`;
};

/* Espiral dupla: o movimento interno que vai e volta pelo mesmo caminho. */
const espiral = () => {
  const braco = (giro) => {
    const pontos = Array.from({ length: 46 }, (_, i) => {
      const t = i / 45;
      const ang = giro + t * Math.PI * 2.4;
      const raio = 8 + t * 54;
      return `${(C + Math.cos(ang) * raio).toFixed(1)} ${(C + Math.sin(ang) * raio).toFixed(1)}`;
    });
    return `<path ${T} stroke-width="3.1" d="M${pontos.join(" L")}"/>`;
  };
  return braco(0) + braco(Math.PI);
};

/* Losangos encaixados: a guarda que sustenta e cede. */
const guarda = () => [58, 40, 22].map((r, i) => `<path ${T} stroke-width="${3.3 - i * 0.35}"
  opacity="${1 - i * 0.16}" d="M${C} ${C - r} L${C + r * 0.74} ${C} L${C} ${C + r} L${C - r * 0.74} ${C} Z"/>`).join("");

/* Fita: a linha que o corpo desenha no ar e desfaz. */
const fita = () => `<path ${T} stroke-width="3.4"
    d="M32 ${C + 40} C 46 ${C - 30}, 74 ${C - 46}, ${C} ${C - 8}
       C ${C + 26} ${C + 30}, ${C + 44} ${C + 12}, ${LADO - 30} ${C - 42}"/>
  <circle ${T} stroke-width="2.8" opacity=".7" cx="32" cy="${C + 40}" r="4.5"/>`;

/* Roda de pontos: a dança em que ninguém está na frente. */
const roda = () => Array.from({ length: 12 }, (_, i) => {
  const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
  return `<circle fill="currentColor" opacity="${i % 3 === 0 ? 1 : 0.62}"
    cx="${(C + Math.cos(ang) * 50).toFixed(1)}" cy="${(C + Math.sin(ang) * 50).toFixed(1)}"
    r="${i % 3 === 0 ? 5.4 : 3.8}"/>`;
}).join("") + `<circle ${T} stroke-width="2.4" opacity=".45" cx="${C}" cy="${C}" r="50"/>`;

/* Horizonte: um círculo, uma linha e nada mais. */
const horizonte = () => `<circle ${T} stroke-width="3.1" cx="${C}" cy="${C}" r="52"/>
  <path ${T} stroke-width="3.1" d="M22 ${C + 6} L${LADO - 22} ${C + 6}"/>`;

/* Escuta: três círculos que se atravessam sem se cobrir. */
const escuta = () => [[-26, 8], [26, 8], [0, -22]].map(([dx, dy], i) =>
  `<circle ${T} stroke-width="3" opacity="${0.95 - i * 0.12}" cx="${C + dx}" cy="${C + dy}" r="34"/>`).join("");

/* Hachura: o desenho antes de ser desenho. */
const hachura = () => Array.from({ length: 9 }, (_, i) => {
  const x = 26 + i * 13.5;
  return `<path ${T} stroke-width="${2.4 + (i % 3) * 0.5}" opacity="${0.5 + (i % 4) * 0.15}"
    d="M${x} ${34 + (i % 3) * 8} L${x + 24} ${LADO - 32 - (i % 2) * 10}"/>`;
}).join("");

/* Manchas: a cor que só existe misturada com a vizinha. */
const manchas = () => [[-20, -12, 34], [22, -2, 30], [-2, 24, 27]].map(([dx, dy, r], i) =>
  `<circle fill="currentColor" opacity="${0.2 + i * 0.09}" cx="${C + dx}" cy="${C + dy}" r="${r}"/>
   <circle ${T} stroke-width="2.4" opacity=".8" cx="${C + dx}" cy="${C + dy}" r="${r}"/>`).join("");

/* Cordas: as linhas paralelas e o dedo que as tira do lugar. */
const cordas = () => Array.from({ length: 6 }, (_, i) => {
  const y = 34 + i * 18;
  const desvio = i === 2 || i === 3 ? 14 - Math.abs(i - 2.5) * 6 : 0;
  return `<path ${T} stroke-width="${2.2 + i * 0.24}" opacity="${0.55 + i * 0.08}"
    d="M26 ${y} Q ${C} ${y + desvio}, ${LADO - 26} ${y}"/>`;
}).join("");

/* Onda e arco: o som que sai contínuo e o gesto que o sustenta. */
const onda = () => {
  const pontos = Array.from({ length: 60 }, (_, i) => {
    const x = 24 + (i / 59) * (LADO - 48);
    const envelope = Math.sin((i / 59) * Math.PI);
    return `${x.toFixed(1)} ${(C + Math.sin((i / 59) * Math.PI * 4) * 32 * envelope).toFixed(1)}`;
  });
  return `<path ${T} stroke-width="3.2" d="M${pontos.join(" L")}"/>`
    + `<path ${T} stroke-width="2.6" opacity=".55" d="M${C + 26} 26 L${C - 26} ${LADO - 26}"/>`;
};

/* Tabuleiro: a grade em que cada casa vale uma decisão. */
const tabuleiro = () => {
  const casas = [];
  for (let l = 0; l < 5; l += 1) {
    for (let c = 0; c < 5; c += 1) {
      if ((l + c) % 2) continue;
      casas.push(`<rect fill="currentColor" opacity="${0.16 + ((l + c) % 4) * 0.07}"
        x="${26 + c * 21.6}" y="${26 + l * 21.6}" width="21.6" height="21.6"/>`);
    }
  }
  return `${casas.join("")}<rect ${T} stroke-width="2.8" x="26" y="26" width="108" height="108"/>`;
};

/* Linhas de texto: o parágrafo visto de longe, quando ainda é forma. */
const paragrafo = () => Array.from({ length: 7 }, (_, i) => {
  const largura = [86, 104, 72, 96, 58, 100, 44][i];
  return `<path ${T} stroke-width="3.4" opacity="${0.9 - i * 0.06}"
    d="M30 ${36 + i * 15} L${30 + largura} ${36 + i * 15}"/>`;
}).join("");

/* Arco de cena: a boca do palco e a luz que a atravessa. */
const cena = () => `<path ${T} stroke-width="3.2"
    d="M28 ${LADO - 26} L28 ${C - 6} A 52 52 0 0 1 ${LADO - 28} ${C - 6} L${LADO - 28} ${LADO - 26}"/>
  <path ${T} stroke-width="2.6" opacity=".6" d="M${C} ${C - 58} L${C} ${LADO - 26}"/>
  <path ${T} stroke-width="2.6" opacity=".45" d="M52 ${LADO - 26} L${C} ${C - 10} L${LADO - 52} ${LADO - 26}"/>`;

/* Diafragma: a luz medida em lâminas. */
const diafragma = () => {
  const laminas = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    const b = ((i + 2) / 6) * Math.PI * 2;
    return `<path ${T} stroke-width="2.7" opacity="${0.55 + (i % 2) * 0.3}"
      d="M${(C + Math.cos(a) * 50).toFixed(1)} ${(C + Math.sin(a) * 50).toFixed(1)}
         L${(C + Math.cos(b) * 50).toFixed(1)} ${(C + Math.sin(b) * 50).toFixed(1)}"/>`;
  }).join("");
  return `<circle ${T} stroke-width="3" cx="${C}" cy="${C}" r="50"/>${laminas}`;
};

const MOTIVOS = {
  respiracao, mola, espiral, guarda, fita, roda, horizonte, escuta,
  hachura, manchas, cordas, onda, tabuleiro, paragrafo, cena, diafragma,
};

export const MOTIVOS_DISPONIVEIS = Object.keys(MOTIVOS);

/**
 * O selo de um especialista, como SVG pronto para embutir.
 *
 * currentColor em tudo: o selo herda a cor de quem o contém, então a mesma
 * marcação serve o cartão claro da lista e o cabeçalho escuro da ficha sem uma
 * segunda versão.
 *
 * @param {string} motivo uma das chaves de MOTIVOS_DISPONIVEIS
 * @param {string} iniciais duas letras, mostradas no canto
 * @returns {string}
 */
export function seloDoEspecialista(motivo, iniciais = "") {
  const desenho = MOTIVOS[motivo];
  if (!desenho) throw new Error(`motivo desconhecido: ${motivo}`);
  const letras = String(iniciais).slice(0, 2).toUpperCase();
  return `<svg class="selo" viewBox="0 0 ${LADO} ${LADO}" role="img" aria-hidden="true" focusable="false">`
    + `<rect fill="currentColor" opacity=".05" width="${LADO}" height="${LADO}" rx="10"/>`
    + desenho()
    + (letras
      ? `<text x="${LADO - 13}" y="${LADO - 11}" text-anchor="end" fill="currentColor" opacity=".55"
          font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700"
          letter-spacing="1.5">${letras}</text>`
      : "")
    + "</svg>";
}
