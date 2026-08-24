const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const smoothstep = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

export function presenceForDistance(distance, viewportHeight) {
  const height = Math.max(1, viewportHeight);
  const hold = height * .5;
  const release = height * 1.28;
  if (distance <= hold) return 1;
  return clamp(1 - smoothstep((distance - hold) / Math.max(1, release - hold)));
}

const transitionPhrases = new Map([
  [0, "Conhecer também é uma forma de chegar."],
  [1, "Cuidar também é aprender."],
  [2, "Conhecimento também precisa ser vivido."],
  [6, "Você não precisa conhecer tudo hoje."],
]);

const featuredDiscoveries = [
  "acao-social",
  "recepcao",
  "blog",
  "saude-integrativa",
  "novos-profissionais",
  "eventos",
  "revista",
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
  const lateral = region.lateral ? `
    <div class="lateral-world" aria-label="Explore caminhos relacionados">
      ${renderLateralSide(region.lateral.left, discoveriesById, "left")}
      ${renderLateralSide(region.lateral.right, discoveriesById, "right")}
    </div>
    <p class="lateral-hint"><span aria-hidden="true">↔</span> Explore os arredores</p>
  ` : "";

  return `
    <section class="journey-region region--${region.layoutVariant}" id="${region.id}"
      data-region-id="${region.id}" data-layout-variant="${region.layoutVariant}"
      data-road-side="${side}" data-content-placement="${region.contentPlacement || "side"}"
      style="--region-index:${index}">
      <div class="region-stage"${region.lateral ? ' tabindex="0" role="group" aria-expanded="false" aria-label="Explore caminhos relacionados com as setas ou arrastando para os lados"' : ""}>
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
    const phrase = transitionPhrases.get(index);
    const height = [112, 130, 98, 120, 104, 136, 116][index];
    return `${markup}
      <div class="journey-silence" aria-hidden="true" style="--silence-height:${height}svh">
        ${phrase ? `<p>${phrase}</p>` : ""}
      </div>`;
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
    pathSections: [...root.querySelectorAll(".journey-region, .journey-silence")],
    discoveries: [...root.querySelectorAll(".journey-discovery")],
  };
}
