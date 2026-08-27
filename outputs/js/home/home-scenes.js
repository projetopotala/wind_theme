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
const regionHeights = [198, 192, 195, 202, 192, 195, 202, 196, 192];
const silenceHeights = [44, 48, 42, 46, 43, 50, 44, 46];

/** Rolagem da subida final, em svh. Sem informação: só caminho. */
export const ASCENT_HEIGHT = 120;

export function journeyRhythmForIndex(index) {
  const safeIndex = Math.max(0, Math.min(regionHeights.length - 1, Math.trunc(index)));
  return {
    regionHeight: regionHeights[safeIndex],
    silenceHeight: silenceHeights[safeIndex] || 0,
  };
}

const featuredDiscoveries = [
  "acao-social",
  "recepcao",
  "blog",
  "saude-integrativa",
  "novos-profissionais",
  "eventos",
  "revista",
  "loja",
  "sono-reflexao",
];

function renderTags(tags = []) {
  return tags.map((tag) => `<li>${tag}</li>`).join("");
}

function renderDiscovery(discovery, index) {
  if (!discovery) return "";
  const visualKinds = ["glow", "phrase", "object", "paper"];
  const kind = visualKinds[index % visualKinds.length];
  return `
    <a class="journey-discovery discovery--${kind}" href="${discovery.href}"
      aria-label="${discovery.category}: ${discovery.title}">
      <span class="discovery-light" aria-hidden="true"></span>
      <span class="discovery-copy">
        <small>${discovery.category}</small>
        <strong>${discovery.title}</strong>
        <span>${discovery.description}</span>
      </span>
    </a>
  `;
}

function renderLateralSide(ids, discoveriesById, side) {
  const items = ids.map((id) => discoveriesById.get(id)).filter(Boolean);
  return `
    <aside class="lateral-reveal lateral-reveal--${side}" data-lateral-side="${side}" aria-hidden="true">
      ${items.map((item) => `
        <a href="${item.href}" tabindex="-1">
          <small>${item.category}</small>
          <strong>${item.title}</strong>
        </a>
      `).join("")}
    </aside>
  `;
}

export function renderRegion(region, index, discovery, discoveriesById) {
  const side = region.roadPlacement === "left" ? "left" : "right";
  const titleScale = Array.from(region.title).length >= 11 ? "compact" : "display";
  const { regionHeight } = journeyRhythmForIndex(index);
  const lateral = region.lateral ? `
    <div class="lateral-world" aria-label="Caminhos relacionados">
      ${renderLateralSide(region.lateral.left, discoveriesById, "left")}
      ${renderLateralSide(region.lateral.right, discoveriesById, "right")}
    </div>
  ` : "";

  return `
    <section class="journey-region region--${region.layoutVariant}" id="${region.id}"
      data-region-id="${region.id}" data-layout-variant="${region.layoutVariant}"
      data-road-side="${side}" data-content-placement="${region.contentPlacement || "side"}"
      data-title-scale="${titleScale}"
      style="--region-index:${index};--region-height:${regionHeight}svh">
      <div class="region-stage"${region.lateral ? ' tabindex="0" role="group" aria-expanded="false" aria-label="Caminhos relacionados; use as setas ou arraste para os lados"' : ""}>
        <a class="region-content" href="${region.href}" aria-label="Conhecer ${region.title}">
          <p class="region-category"><span>${String(index + 1).padStart(2, "0")}</span>${region.category}</p>
          <h2>${region.title}</h2>
          <p class="region-description">${region.description}</p>
          <ul class="region-tags" aria-label="Temas desta região">${renderTags(region.tags)}</ul>
          <span class="region-link" aria-hidden="true">Conhecer este caminho <span>↗</span></span>
        </a>
        ${renderDiscovery(discovery, index)}
        ${lateral}
      </div>
    </section>
  `;
}

export function mountJourney(root, { regions, discoveries }) {
  if (!root) throw new TypeError("root é obrigatório para montar a jornada");
  const discoveriesById = new Map(discoveries.map((item) => [item.id, item]));
  const regionMarkup = regions.map((region, index) => {
    const discovery = discoveriesById.get(featuredDiscoveries[index]);
    const markup = renderRegion(region, index, discovery, discoveriesById);
    if (index === regions.length - 1) return markup;
    // Os silêncios continuam existindo como pausa e como trecho de estrada; só
    // não carregam mais texto.
    const { silenceHeight } = journeyRhythmForIndex(index);
    return `${markup}
      <div class="journey-silence" aria-hidden="true" style="--silence-height:${silenceHeight}svh"></div>`;
  }).join("");

  root.innerHTML = `
    <section class="journey-prologue" id="inicio" aria-labelledby="journey-title">
      <div class="prologue-copy">
        <p>Ecossistema Digital Potala</p>
        <h1 id="journey-title">Bem-vindo.</h1>
        <span>O caminho continua.</span>
      </div>
    </section>
    <div class="journey-regions">${regionMarkup}</div>
    <div class="journey-ascent" aria-hidden="true" style="--ascent-height:${ASCENT_HEIGHT}svh"></div>
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
    silences: [...root.querySelectorAll(".journey-silence")],
    pathSections: [...root.querySelectorAll(".journey-region, .journey-silence, .journey-ascent")],
    discoveries: [...root.querySelectorAll(".journey-discovery")],
  };
}
