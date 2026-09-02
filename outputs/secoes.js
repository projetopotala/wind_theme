import { createHomeContentSource } from "./js/home/content-source.js";
import { createLocalContentRepository } from "./js/home/content-repository.js";
import { DEFAULT_HOME_BLOCKS } from "./js/home/journey-data.js";
import { createSupabaseContentRepository } from "./js/home/supabase-content-repository.js";
import { getSupabaseClient } from "./js/supabase/client.js";

(() => {
  "use strict";

  const body = document.body;
  const siteSections = [
    { key: "inicio", label: "Início", href: "transcendido.html" },
    { key: "quem-somos", label: "Quem somos", href: "quem-somos.html" },
    { key: "atendimentos", label: "Atendimentos", href: "atendimentos.html" },
    { key: "recepcao", label: "Recepção", href: "recepcao.html" },
    { key: "atividades", label: "Atividades", href: "atividades.html" },
    { key: "cursos", label: "Cursos", href: "cursos.html" },
    { key: "programacao", label: "Programação", href: "programacao.html" },
    { key: "saude-integrativa", label: "Saúde Integrativa", href: "saude-integrativa.html" },
    { key: "cultura", label: "Cultura", href: "cultura.html" },
    { key: "marketplace", label: "Marketplace", href: "marketplace.html" },
    { key: "profissionais", label: "Profissionais", href: "profissionais.html" },
    { key: "inspiracao", label: "Inspiração", href: "inspiracao.html" },
  ];

  function mountLegacyNavigation() {
    const current = body.dataset.section || "inicio";
    const navigation = document.createElement("nav");
    navigation.className = "site-nav";
    navigation.setAttribute("aria-label", "Seções do Instituto Potala");
    navigation.innerHTML = `<ul class="site-nav-list">${siteSections.map((item) => `
      <li class="site-nav-item"><a class="site-nav-link${item.key === current ? " is-active" : ""}"
        href="${item.href}"${item.key === current ? ' aria-current="page"' : ""}>${item.label}</a></li>
    `).join("")}</ul>`;
    body.prepend(navigation);

    requestAnimationFrame(() => body.classList.add("is-ready"));
  }

  if (body.dataset.storyPage === "true") {
    import("./js/home/home-controller.js")
      .then(async ({ mountHomeJourney }) => {
        const snapshot = createLocalContentRepository({
          defaults: DEFAULT_HOME_BLOCKS,
          storage: null,
        });
        let repository = snapshot;
        try {
          const remote = createSupabaseContentRepository({
            client: getSupabaseClient(),
            defaults: DEFAULT_HOME_BLOCKS,
          });
          repository = createHomeContentSource({
            remote,
            fallback: snapshot,
            onRemoteError(error) {
              console.warn("Conteúdo remoto indisponível; usando snapshot empacotado.", error);
            },
          });
        } catch (error) {
          console.warn("Supabase indisponível; usando snapshot empacotado.", error);
        }
        return mountHomeJourney({ repository });
      })
      .catch((error) => {
        console.error("Não foi possível iniciar a Travessia.", error);
        body.classList.add("is-ready", "is-home-fallback");
      });
  } else {
    mountLegacyNavigation();
  }
})();
