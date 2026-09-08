import { arteDaCapa } from "../blog/blog-arte.js";
import { ehNovidade, temasVisiveis } from "./home-novidades.js";
import { invitationsFor } from "./invitations.js";
import { renderRestrictedMarkdown } from "../shared/markdown.js";
const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const smoothstep = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

export function presenceForDistance(distance, viewportHeight) {
  const height = Math.max(1, viewportHeight);
  const hold = height * .73;
  const release = height * 1.65;
  if (distance <= hold) return 1;
  return clamp(1 - smoothstep((distance - hold) / Math.max(1, release - hold)));
}

export function presenceForRegionBounds({ top, bottom, viewportHeight }) {
  const height = Math.max(1, viewportHeight);
  const entryEnd = height * .08;
  const entryStart = height * .75;
  const exitEnd = height * .22;
  const exitStart = height * .92;
  const entry = 1 - smoothstep((top - entryEnd) / Math.max(1, entryStart - entryEnd));
  const exit = smoothstep((bottom - exitEnd) / Math.max(1, exitStart - exitEnd));
  return clamp(Math.min(entry, exit));
}

// Alturas em svh. O ritmo original somava ~2160svh, quase 22 telas de rolagem,
// e deixava cerca de 2,8 telas de estrada entre uma informação e a seguinte.
// Encurtar o trecho mantém os silêncios da narrativa e faz a travessia caber no
// tempo previsto, além de aproximar as entradas e saídas de cada informação.
// Alturas em svh. O palco de cada região é `sticky` com 100svh, então a
// informação fica parada no centro por exatamente `regionHeight - 100`, e a
// troca entre duas regiões custa sempre 100svh — o tempo de soltar uma e grudar
// a seguinte, que é o tamanho da janela e não se pode encurtar.
//
// Isso amarra as duas coisas numa só: distância entre encontros = parada + 100.
// Não existe travessia curta com parada longa; o silêncio é o único folgado, e
// aqui ele foi reduzido ao mínimo para que quase todo o percurso seja parada.
// O silêncio não é só pausa: é o trecho de rolagem em que a curva inteira passa.
// Com 10svh a estrada virava 90° sete vezes mais rápido do que corria na reta, e
// a virada dava solavanco. O silêncio volta a ser proporcional ao arco.
/*
 * ONZE alturas e DEZ silêncios: uma região nova exige as duas coisas.
 *
 * `journeyRhythmForIndex` prende o índice ao fim da tabela, então uma região a
 * mais não estoura nada — ela herda a altura da anterior e um silêncio zero, e
 * o último trecho encolhe para 192svh contra os 225 mínimos que o ritmo exige.
 * Não quebra: só fica apressado, e apressado é invisível em teste que não meça.
 */
const regionHeights = [198, 194, 192, 195, 202, 192, 195, 202, 196, 192, 196];
/* Um silêncio por altura, e não um a menos: com o ritmo ciclando, o último
   trecho é o que volta da última região para a primeira, e ele existe. */
const silenceHeights = [45, 44, 48, 42, 46, 43, 50, 44, 46, 46, 45];

/** Rolagem da subida final, em svh. Sem informação: só caminho. */
export const ASCENT_HEIGHT = 120;

/*
 * O ritmo CICLA, e antes ele grudava no fim da tabela.
 *
 * Enquanto as regiões eram dez fixas no código, prender o índice à última
 * entrada nunca aparecia. Agora os blocos vêm do painel: quem adicionar o
 * décimo segundo faz todos os seguintes herdarem a mesma altura e silêncio
 * zero — a jornada acelera no fim, e ninguém liga uma coisa à outra.
 *
 * Ciclando, a tabela vira um COMPASSO em vez de uma lista: qualquer quantidade
 * de blocos recebe um ritmo, e a única exigência passa a ser que o compasso
 * feche — que a volta da última para a primeira também respeite a distância
 * mínima entre encontros. É o que o teste do percurso mede.
 */
export function journeyRhythmForIndex(index) {
  const total = regionHeights.length;
  const inteiro = Math.trunc(Number(index) || 0);
  const passo = ((inteiro % total) + total) % total;
  return {
    regionHeight: regionHeights[passo],
    silenceHeight: silenceHeights[passo] || 0,
  };
}

/* Indexada por POSIÇÃO da região, não por id: uma região nova no meio empurra
   todas as seguintes, e sem acompanhar aqui cada seção passa a receber a
   descoberta da vizinha. Cicla pelo mesmo motivo que o ritmo: a contagem de
   blocos é editável, e uma lista de tamanho fixo deixaria os últimos sem nada. */
const featuredDiscoveries = [
  "acao-social",
  "atendimento-online",
  "recepcao",
  /* Era "blog" aqui. O Blog virou REGIÃO, e uma região não se apresenta como
     descoberta de outra — Cursos passaria a oferecer, como novidade lateral, um
     bloco que a própria jornada mostra inteiro poucos rolares adiante. */
  "empresas",
  "saude-integrativa",
  "novos-profissionais",
  "eventos",
  "revista",
  "loja",
  "sono-reflexao",
  /* A décima primeira, do Blog: a Revista é a vizinha editorial dele. */
  "revista",
];

/*
 * Os temas do bloco, como pastilhas.
 *
 * São rótulos, não filtros. A referência mostra a primeira pastilha acesa, como
 * se estivesse selecionada — desenhar isso aqui prometeria um filtro que não
 * existe, e um controle que aceita o clique sem fazer nada é pior que a
 * ausência dele. Ficam calmas e legíveis, sem estado.
 */
function renderTags(tags = []) {
  return tags
    .map((tag) => `<li class="region-chip">${escapeHtml(tag)}</li>`)
    .join("");
}

/*
 * Os caminhos relacionados, um por linha.
 *
 * Saem de `relatedContent`, resolvido no mapa das descobertas: cada linha é um
 * destino de verdade, com endereço próprio. Inventar itens aqui daria à
 * referência uma fidelidade que o conteúdo não sustenta.
 */
function renderRelated(region, discoveriesById, destaque) {
  /*
   * Relacionados E laterais, na mesma lista.
   *
   * Os laterais eram desenhados soltos sobre a paisagem, fora de qualquer
   * painel — e sem uma linha de estilo, porque nunca tinham chegado à tela: o
   * mapa de descobertas nascia vazio e eles não apareciam. Ligado o mapa, eles
   * surgiram como texto cru boiando ao lado do bloco.
   *
   * Trazê-los para cá resolve as duas coisas de uma vez: some o texto solto e
   * nada de conteúdo se perde.
   */
  const ids = [
    ...(Array.isArray(region.relatedContent) ? region.relatedContent : []),
    ...(region.lateral?.left || []),
    ...(region.lateral?.right || []),
    /* A descoberta em destaque também. Ela era desenhada como um cartão solto
       na paisagem, e esse cartão nunca teve estilo — apareceu como texto cru
       assim que o mapa de descobertas foi ligado. */
    ...(destaque?.id ? [destaque.id] : []),
  ];
  const vistos = new Set();
  const itens = ids
    .filter((id) => !vistos.has(id) && vistos.add(id))
    .map((id) => discoveriesById?.get?.(id))
    .filter(Boolean)
    .slice(0, 3);
  if (!itens.length) return "";

  const linhas = itens.map((item) => `
    <li>
      <a class="region-related-item" href="${safeHref(item.href)}" tabindex="-1">
        <span class="region-related-mark" aria-hidden="true">${escapeHtml((item.category || item.title || "•").slice(0, 1))}</span>
        <span class="region-related-text">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.description ?? item.summary ?? "")}</small>
        </span>
        <span class="region-related-go" aria-hidden="true">›</span>
      </a>
    </li>`).join("");

  return `<ul class="region-related" aria-label="Caminhos a partir daqui">${linhas}</ul>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function safeToken(value, fallback) {
  return String(value || fallback)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function safeHref(value) {
  const href = String(value || "").trim();
  if (/^https:\/\//i.test(href)) return escapeHtml(href);
  if (/^(?:[a-z0-9][a-z0-9._/-]*\.html(?:[?#].*)?|#[a-z0-9_-]*)$/i.test(href)) return escapeHtml(href);
  return "#";
}

function safeMediaSource(value) {
  const source = String(value || "").trim();
  if (/^https:\/\/[^\s"<>]+$/i.test(source)) return escapeHtml(source);
  if (/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-z0-9][a-z0-9._/-]*\.(?:avif|jpe?g|png|webp)$/i.test(source)) {
    return escapeHtml(source);
  }
  return "";
}

function renderRegionMedia(region) {
  const image = safeMediaSource(region.image || region.media);
  const icon = String(region.icon || "").trim();
  if (!image && !icon) return "";

  return `
            <figure class="region-media">
              ${image ? `<img src="${image}" alt="" loading="lazy" decoding="async">` : ""}
              ${icon ? `<span class="region-icon" aria-hidden="true">${escapeHtml(icon)}</span>` : ""}
            </figure>`;
}

/**
 * O mapa que resolve um id de relação em algo exibível.
 *
 * Conhece descobertas E blocos, porque as relações apontam para os dois:
 * "recepcao" leva a uma descoberta, "atendimentos" a outro bloco da jornada.
 * Um mapa só de descobertas deixava metade das linhas sem resolver, e elas
 * simplesmente não apareciam — sem erro e sem espaço vazio.
 *
 * As descobertas entram por último para vencerem em caso de id repetido: são
 * elas que trazem a descrição curta escrita para esta lista.
 *
 * Exportada para ser conferida sem DOM: montada dentro de `mountJourney`, esta
 * regra só podia ser testada com uma página inteira em pé.
 */
export function buildLookup(regions = [], discoveries = []) {
  return new Map([
    ...regions.map((item) => [item.id, item]),
    ...discoveries.map((item) => [item.id, item]),
  ]);
}

export function renderRegion(region, index, discovery, discoveriesById) {
  const side = region.side === "left" || region.side === "right"
    ? region.side
    : region.roadPlacement === "right" ? "left"
      : region.roadPlacement === "left" ? "right"
        : index % 2 === 0 ? "left" : "right";
  const roadSide = region.roadPlacement === "left" || region.roadPlacement === "right"
    ? region.roadPlacement
    : side === "left" ? "right" : "left";
  const title = String(region.title || "");
  const summary = region.summary ?? region.description ?? "";
  const body = region.body ?? summary;
  const media = renderRegionMedia(region);
  const id = safeToken(region.slug || region.id, `regiao-${index + 1}`);
  const layoutVariant = safeToken(region.layoutVariant, "editorial");
  const titleScale = Array.from(title).length >= 11 ? "compact" : "display";
  const titleFlow = title.trim().split(/\s+/u).filter(Boolean).length === 1 ? "single" : "phrase";
  const { regionHeight } = journeyRhythmForIndex(index);

  /*
   * A CAPA APARECE COM O CARTÃO FECHADO — só nas novidades.
   *
   * Nas seções permanentes a imagem vive dentro do bloco expandido, porque ali
   * ela ilustra um texto que já se está lendo. Uma novidade é outra coisa: ela
   * precisa se anunciar antes de qualquer clique, e a figura é o que a
   * distingue das vizinhas num relance.
   *
   * A fotografia do artigo tem prioridade porque liga visualmente a Home ao
   * Caderno de Travessia. O motivo abstrato continua como fallback para blocos
   * antigos que ainda não tenham capa.
   */
  const novidade = ehNovidade(region);
  const coverSource = safeMediaSource(region.image || region.media);
  const capaFechada = novidade
    ? (coverSource
      ? `<span class="region-capa" aria-hidden="true"><img src="${coverSource}" alt="" loading="lazy" decoding="async"></span>`
      : (region.motivo
        ? `<span class="region-capa" aria-hidden="true">${arteDaCapa(region.motivo)}</span>`
        : ""))
    : "";
  const newsMeta = novidade
    ? `<span class="region-news-meta" aria-hidden="true"><small>${escapeHtml(region.category || "Caderno")}</small><span>${escapeHtml(title)}</span></span>`
    : "";


  return `
    <div class="journey-region region--${layoutVariant}" id="${id}"
      data-region-id="${id}" data-layout-variant="${layoutVariant}"
      data-side="${side}" data-road-side="${roadSide}" data-content-placement="${safeToken(region.contentPlacement, "side")}"
      data-title-scale="${titleScale}" data-title-flow="${titleFlow}" data-card-kind="${novidade ? "novidade" : "fixo"}"
      style="--region-index:${index};--region-height:${regionHeight}svh">
        <article class="region-content" aria-labelledby="${id}-title">
          <!--
            A flecha é um botão de verdade, e não um enfeite no canto.
            Voltar por Escape já existia, mas Escape não existe no toque: sem
            este botão, quem abrisse um bloco no telefone só sairia tocando
            fora dele, o que ninguém adivinha.

            Era um × até o bloco aberto passar a ocupar a página. Um × fecha uma
            janela que está POR CIMA de alguma coisa, e enquanto o bloco era um
            cartão sobre a paisagem era isso mesmo. Ocupando a página não há
            janela para fechar: há um lugar de onde se veio. A flecha diz para
            onde leva, e o rótulo diz o destino em vez da operação — quem ouve o
            botão precisa saber para onde vai, e "Fechar" não conta isso.
          -->
          <button class="region-close" type="button" data-region-close tabindex="-1"
            aria-label="Voltar para a jornada"><span aria-hidden="true">←</span></button>
          <button class="region-summary" type="button" aria-expanded="false" aria-controls="${id}-details">
            ${capaFechada}
            ${newsMeta}
            <span class="region-category">
              <span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(region.category)}
              <span class="region-rule" aria-hidden="true"></span>
            </span>
            <span class="region-title" id="${id}-title">${escapeHtml(title)}</span>
            <span class="region-description">${escapeHtml(summary)}</span>
            <span class="region-expand-label" aria-hidden="true">Descobrir <span>＋</span></span>
          </button>
          <div class="region-details" id="${id}-details" aria-hidden="true" inert>
            <section class="region-details-main">
              <span class="region-divider" aria-hidden="true"></span>
              <p class="region-lead-label">Encontre o que faz sentido para você</p>
              ${renderRestrictedMarkdown(body)}
              <ul class="region-tags" aria-label="Temas desta região">${renderTags(temasVisiveis(region.tags))}</ul>
            </section>
            <aside class="region-details-aside">
              ${renderRelated(region, discoveriesById, discovery)}
              ${media}
              <div class="region-actions">
                <a class="region-link" href="${safeHref(region.href)}" tabindex="-1"${
                  region.metaDescription ? ` aria-description="${escapeHtml(region.metaDescription)}"` : ""
                }>${novidade ? "Ler a notícia completa" : `Explorar ${escapeHtml(title.toLowerCase())}`} <span aria-hidden="true">→</span></a>
              </div>
            </aside>
          </div>
        </article>
    </div>
  `;
}

/**
 * Duas seções lado a lado, uma de cada lado do trajeto.
 *
 * O par — e não o bloco — passa a ser a unidade de rolagem: é ele que tem
 * altura, palco fixo e presença. Antes cada seção ocupava uma tela inteira com
 * o lado oposto vazio; agora as duas dividem a mesma passagem, e a travessia
 * encurta pela metade sem perder nenhuma delas.
 *
 * O palco sobe para cá justamente porque é ele que reserva o vão do meio: com
 * um palco por bloco, os dois vãos se sobreporiam e cada bloco reservaria um
 * espaço que o outro já estava usando.
 */
export function renderPair(markups, pairIndex, pairHeight, rotulo = "") {
  return `
    <section class="journey-pair" data-pair-index="${pairIndex}"
      style="--pair-height:${pairHeight}svh">
      <div class="region-stage">${rotulo}${markups.join("")}</div>
    </section>
  `;
}

/**
 * Menu das seções, fixo no rodapé.
 *
 * São botões, e não links de âncora: as regiões passaram a ser `display:
 * contents` dentro do palco do par, e um elemento sem caixa própria não é
 * destino de âncora — o navegador não teria para onde rolar. Quem sabe a
 * geometria é o controlador, que rola até o PAR e abre o bloco pedido.
 *
 * A ordem e os números repetem os da jornada de propósito: o menu é um índice
 * do mesmo caminho, não uma segunda organização do conteúdo.
 */
/**
 * O convite que gira no canto superior direito.
 *
 * Nasce com o primeiro convite já escrito no HTML, e não vazio à espera do
 * script: um retângulo em branco no canto é pior que retângulo nenhum, e quem
 * abrir a página com o JavaScript lento vê o convite mesmo assim.
 */
export function renderInvitation(invitations = []) {
  const primeiro = invitations[0];
  if (!primeiro) return "";

  return `
    <button class="journey-invite" type="button" data-invite
      data-invite-target="${primeiro.id}" data-keeps-expansion>
      <span class="journey-invite-mark" aria-hidden="true"></span>
      <span class="journey-invite-text" data-invite-text>${escapeHtml(primeiro.text)}</span>
    </button>`;
}

/*
 * A ROLETA SEPARA NOVIDADES DE SEÇÕES.
 *
 * Numa lista só, as quatro notícias tomavam as posições 01 a 04 e empurravam
 * "Quem somos" para a quinta. A roleta é o MAPA do portal, e ali isso lia como
 * se o Instituto tivesse quinze seções — quatro delas com nome de manchete.
 *
 * Cada grupo se numera por conta própria: a numeração de um índice conta
 * quantos itens daquele tipo existem, e uma contagem contínua entre coisas de
 * naturezas diferentes não conta nada.
 *
 * Os títulos de grupo são `<li>` sem `data-menu-target`. O controlador coleta
 * os itens da roleta por esse atributo, então eles não entram na conta de qual
 * bloco está ativo — e o leitor de tela recebe a divisão junto com a lista.
 */
export function renderJourneyMenu(regions = []) {
  const novidades = regions.filter(ehNovidade);
  const secoes = regions.filter((region) => !ehNovidade(region));

  /*
   * As novidades ocupam UMA linha, e não uma cada.
   *
   * Listadas uma a uma, as manchetes tomavam as primeiras posições e a roleta
   * lia como se o Instituto tivesse quinze seções — quatro delas com nome de
   * notícia. A roleta é o mapa do portal, e o que ela precisa dizer sobre as
   * novidades é só que existem e que você está nelas.
   *
   * O marcador circular é o que informa: ele acende enquanto o visitante
   * percorre qualquer um dos cartões de novidade, como acende nas seções.
   */
  const linhaRecentes = novidades.length
    ? `<li class="journey-menu-marco" data-menu-recentes>Recentes</li>`
    : "";

  /*
   * "DESTACADO" existe porque "Recentes" sozinho contaminava a lista inteira.
   *
   * Com um único rótulo no topo, tudo que vinha abaixo dele parecia pertencer a
   * ele: "Quem somos" e "Recepção" liam como notícias recentes. Um marco só
   * marca um começo — são precisos dois para marcar uma fronteira.
   */
  const linhaDestacado = secoes.length
    ? `<li class="journey-menu-marco" data-menu-destacado>Destacado</li>`
    : "";

  /* As seções continuam numeradas de 01 em diante. */
  const itens = linhaRecentes + linhaDestacado + secoes.map((region, index) => {
    const id = safeToken(region.slug || region.id, `regiao-${index + 1}`);
    const href = escapeHtml(String(region.href || "#"));
    const current = index === 0 && !novidades.length ? ' aria-current="true"' : "";
    return `
      <li>
        <a href="${href}" data-menu-target="${id}"${current}>
          <span aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
          ${escapeHtml(String(region.title || ""))}
        </a>
      </li>`;
  }).join("");
  const total = String(Math.max(1, regions.length)).padStart(2, "0");

  return `
    <button class="journey-menu-toggle" type="button" data-menu-toggle
      aria-expanded="false" aria-controls="journey-menu" aria-label="Abrir navegação"
      data-keeps-expansion>
      <img src="media/potala-mark-transparent.png" alt="" aria-hidden="true">
    </button>
    <nav class="journey-menu" id="journey-menu" aria-label="Seções da travessia"
      data-keeps-expansion data-journey-sidebar inert>
      <a class="journey-sidebar-brand" href="transcendido.html" aria-label="Início da Travessia">
        <img src="media/potala-mark-transparent.png" alt="Instituto Potala">
        <span>Instituto <strong>Potala</strong></span>
      </a>
      <div class="journey-sidebar-heading">
        <p>Travessia</p>
        <span>Ecossistema Digital</span>
      </div>
      <div class="journey-sidebar-progress" aria-label="Progresso na jornada">
        <span><strong data-journey-current>01</strong> / <span data-journey-total>${total}</span></span>
        <i aria-hidden="true"></i>
      </div>
      <a class="journey-sidebar-back" href="transcender.html" aria-label="Voltar à Chegada">
        <span aria-hidden="true">←</span>
      </a>
      <div class="journey-menu-viewport">
        <ul>${itens}</ul>
      </div>
      <!--
        O rodapé da barra virou um BOTÃO REDONDO que abre duas opções.

        Era uma pílula larga escrita "Painel editorial" — o item mais destacado
        do rodapé, e o único que o visitante nunca vai usar: o painel é de quem
        mantém o site. Reduzido a um ícone, ele deixa de disputar espaço com o
        que interessa a quem chega, e abre espaço para o "Contate-nos", que é o
        que um visitante de fato procura ali embaixo.

        Elemento details com summary, em vez de um botão com JavaScript: abrir e
        fechar já é comportamento nativo dele, e vem com teclado e leitor de
        tela prontos. Um botão nosso precisaria reimplementar os três — e este
        comentário não usa crase porque está DENTRO de um template literal, onde
        uma crase fecha a string e derruba o arquivo inteiro.
      -->
      <!--
        A BUSCA MORA FORA DO MENU, e é o menu que a revela.

        Dentro do elemento details, ela fecharia junto com ele no primeiro clique fora
        — e clicar fora é exatamente o que se faz para alcançar o teclado no
        telefone. Aqui ela abre acima do botão e só sai quando encontra algo ou
        quando alguém a fecha.
      -->
      <form class="journey-busca" data-journey-busca role="search" hidden>
        <label class="journey-sr" for="journey-busca-campo">Buscar na jornada</label>
        <input id="journey-busca-campo" data-journey-busca-campo type="search"
          placeholder="tai chi, oráculo, cursos…" autocomplete="off">
        <button type="submit" aria-label="Buscar">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14Z"/>
          </svg>
        </button>
        <p class="journey-busca-aviso" data-journey-busca-aviso role="status" aria-live="polite"></p>
      </form>

      <details class="journey-sidebar-mais">
        <summary aria-label="Mais opções">
          <span aria-hidden="true"></span>
        </summary>
        <div class="journey-sidebar-opcoes">
          <button type="button" data-journey-abrir-busca>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14Z"/>
            </svg>
            <span>Pesquisar</span>
          </button>
          <a href="recepcao.html">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5-8-5V6l8 5 8-5v2Z"/>
            </svg>
            <span>Contate-nos</span>
          </a>
          <a href="admin.html">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 17.25V20h2.75L17.8 8.95l-2.75-2.75L4 17.25Zm15.7-10.4a.73.73 0 0 0 0-1.03l-1.52-1.52a.73.73 0 0 0-1.03 0l-1.19 1.19 2.75 2.75 1.19-1.19Z"/>
            </svg>
            <span>Painel editorial</span>
          </a>
          <!--
            AS PORTAS QUE NÃO SÃO SEÇÃO.

            Especialistas, workshops, grupos, mentorias e eventos moram na barra
            do topo das páginas de seção. A Home não tem essa barra — ela tem a
            roleta — e sem estes cinco links a única forma de chegar lá a partir
            do começo seria entrar numa seção qualquer primeiro.
          -->
          <a href="especialistas.html">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3Zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z"/>
            </svg>
            <span>Especialistas</span>
          </a>
          <a href="workshops.html">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2 2 7l10 5 10-5-10-5Zm0 7.2L5.6 6 12 2.8 18.4 6 12 9.2ZM2 17l10 5 10-5-2.2-1.1L12 19.6l-7.8-3.7L2 17Zm0-5 10 5 10-5-2.2-1.1L12 14.6l-7.8-3.7L2 12Z"/>
            </svg>
            <span>Workshops</span>
          </a>
          <a href="grupos-de-estudo.html">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 5c-1.9-.6-3.9-1-6-1-1.8 0-3.5.3-5 .8v14.4c1.5-.5 3.2-.8 5-.8 2.1 0 4.1.4 6 1V5ZM9 4.8C7.5 4.3 5.8 4 4 4c-.7 0-1.4 0-2 .1v14.4c.6-.1 1.3-.1 2-.1 1.8 0 3.5.3 5 .8V4.8Z"/>
            </svg>
            <span>Grupos de estudo</span>
          </a>
          <a href="mentorias.html">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3 1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3Zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9ZM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72Z"/>
            </svg>
            <span>Mentorias</span>
          </a>
          <a href="eventos.html">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 16H5V10h14v10Zm0-12H5V6h14v2Zm-8 4H7v4h4v-4Z"/>
            </svg>
            <span>Eventos futuros</span>
          </a>
        </div>
      </details>
    </nav>`;
}

export function mountJourney(root, { regions = [], discoveries = [] } = {}) {
  if (!root) throw new TypeError("root é obrigatório para montar a jornada");
  const discoveriesById = buildLookup(regions, discoveries);
  const blocos = regions.map((region, index) => renderRegion(
    region,
    index,
    discoveriesById.get(featuredDiscoveries[index % featuredDiscoveries.length]),
    discoveriesById,
  ));

  const pares = [];
  /*
   * O RÓTULO DO GRUPO ENTRA NO FLUXO, no começo dos cartões a que se refere.
   *
   * Ele já morou fixo no alto da tela. Ali estava sempre visível e sempre longe
   * do que descrevia: quem olhava os cartões não olhava o canto, e a palavra
   * mudava sem que ninguém visse.
   *
   * No começo do grupo ele é lido uma vez, no lugar certo — e `sticky` o mantém
   * à vista enquanto aquele grupo passa, de modo que a resposta continua
   * disponível sem precisar voltar.
   */
  let grupoAnterior = null;
  for (let inicio = 0; inicio < blocos.length; inicio += 2) {
    const grupo = ehNovidade(regions[inicio] || {}) ? "novidade" : "fixo";
    /*
     * O rótulo entra DENTRO do palco do primeiro par do grupo.
     *
     * Fora dele, como irmão do par, ele ficava a quase quatrocentos pixels
     * acima dos cartões: o palco é `sticky` com a altura da tela e os cartões
     * ficam centrados nele, então quando eles param no meio da tela o rótulo já
     * saiu por cima havia muito tempo. Ele nomeava o grupo de um lugar em que
     * não dava para vê-lo junto do que nomeava.
     *
     * Dentro do palco ele acompanha os cartões: chega com eles, para com eles
     * e sai com eles.
     */
    let rotulo = "";
    if (grupo !== grupoAnterior) {
      grupoAnterior = grupo;
      const editorial = grupo === "novidade"
        ? { eyebrow:"Caderno de Travessia", title:"Acontece no Potala" }
        : { eyebrow:"Ecossistema Potala", title:"Caminhos para conhecer" };
      rotulo = `<header class="journey-trecho" data-grupo="${grupo}">
        <span>${editorial.eyebrow}</span>
        <strong>${editorial.title}</strong>
        <i aria-hidden="true"></i>
      </header>`;
    }
    const pairIndex = pares.length;
    // A altura do par vem do ritmo do primeiro dos dois: é a mesma passagem
    // que uma seção sozinha ocupava, agora carregando duas.
    const { regionHeight, silenceHeight } = journeyRhythmForIndex(inicio);
    pares.push(renderPair(blocos.slice(inicio, inicio + 2), pairIndex, regionHeight, rotulo));
    if (inicio + 2 < blocos.length) {
      /*
       * A FRONTEIRA ENTRE NOVIDADES E SEÇÕES ganha uma marca no silêncio.
       *
       * O rótulo lá no alto troca de palavra, mas ele está no canto e a troca é
       * discreta de propósito — quem estiver olhando os cartões não vê. Sem
       * nada no caminho, a jornada passa de notícia para seção sem que nada
       * aconteça, e a divisão só existe para quem reparou no canto da tela.
       *
       * A marca vai no silêncio porque o silêncio JÁ É a passagem: o trecho de
       * estrada sem conteúdo entre dois encontros. Marcar o cartão seria pôr a
       * fronteira dentro de um dos lados; marcar o vão a põe entre os dois.
       */
      const fronteira = ehNovidade(regions[inicio + 1] || {}) !== ehNovidade(regions[inicio + 2] || {});
      /*
       * O SILÊNCIO DA FRONTEIRA É MAIS CURTO que os outros.
       *
       * Um silêncio comum é pausa: estrada sem informação, para o encontro
       * seguinte não colar no anterior. O da fronteira não está vazio — ele tem
       * a linha, o losango e, logo abaixo, o rótulo do grupo novo. Com a
       * duração cheia, essas três coisas ficavam espalhadas por quase meia tela
       * cada uma, e o que devia ser uma passagem virava um intervalo.
       *
       * 45% da duração normal: continua havendo pausa, mas curta o bastante
       * para a marca, o rótulo e o primeiro cartão serem lidos como uma coisa
       * só — a virada de assunto.
       */
      const alturaDoSilencio = fronteira ? Math.round(silenceHeight * 0.45) : silenceHeight;
      pares.push(`<div class="journey-silence"${fronteira ? ' data-fronteira="true"' : ""} aria-hidden="true" style="--silence-height:${alturaDoSilencio}svh"></div>`);
    }
  }

  const regionMarkup = pares.join("");

  root.innerHTML = `
    <section class="journey-prologue" id="inicio" aria-labelledby="journey-title">
      <div class="prologue-copy">
        <p>Ecossistema Digital Potala</p>
        <h1 id="journey-title">Bem-vindo.</h1>
        <span>O caminho continua.</span>
      </div>
    </section>
    <div class="journey-regions">${regionMarkup}</div>
    ${renderInvitation(invitationsFor(regions))}
    ${renderJourneyMenu(regions)}
    <section class="journey-continuation" aria-labelledby="continuation-title">
      <div>
        <p>Uma jornada não precisa terminar aqui.</p>
        <h2 id="continuation-title">Há sempre outro caminho para descobrir.</h2>
        <a href="https://www.institutopotala.com/">Continuar no Instituto Potala <span aria-hidden="true">↗</span></a>
      </div>
    </section>
    <footer class="journey-footer">
      <p>Instituto Cultural Potala · Indaiatuba, SP</p>
      <a href="transcender.html">Voltar à Chegada</a>
    </footer>
  `;

  return {
    regions: [...root.querySelectorAll(".journey-region")],
    pairs: [...root.querySelectorAll(".journey-pair")],
    menuItems: [...root.querySelectorAll("[data-menu-target]")],
    invite: root.querySelector?.("[data-invite]") ?? null,
    silences: [...root.querySelectorAll(".journey-silence")],
    pathSections: [...root.querySelectorAll(".journey-pair, .journey-silence")],
    discoveries: [...root.querySelectorAll(".journey-discovery")],
  };
}
