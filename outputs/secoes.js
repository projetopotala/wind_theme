import { createHomeContentSource } from "./js/home/content-source.js";
import { createLocalContentRepository } from "./js/home/content-repository.js";
import { DEFAULT_HOME_BLOCKS } from "./js/home/journey-data.js";
import { withRequiredDefaultSections } from "./js/home/default-section-bridge.js";
import { createSupabaseContentRepository } from "./js/home/supabase-content-repository.js";
import { getSupabaseClient } from "./js/supabase/client.js";

(() => {
  "use strict";

  const body = document.body;
  /*
   * A BARRA DAS PÁGINAS DE SEÇÃO.
   *
   * Ela já foi um menu com as treze seções, e isso era duplicar a Travessia num
   * lugar pior: a Home tem a roleta, a busca e a ordem editorial: a pastilha
   * flutuante tinha treze rótulos de dez pixels com rolagem horizontal, que
   * ninguém lê e ninguém usa.
   *
   * O que sobra aqui é o que a Travessia NÃO oferece: as portas que não são
   * seções — quem ensina, e os encontros que acontecem fora da grade de aulas.
   * Voltar ao índice é o que a marca faz, à esquerda, como em qualquer site.
   */
  const barLinks = [
    { key: "especialistas", label: "Especialistas", href: "especialistas.html" },
    { key: "workshops", label: "Workshops", href: "workshops.html" },
    { key: "grupos-de-estudo", label: "Grupos de estudo", href: "grupos-de-estudo.html" },
    { key: "mentorias", label: "Mentorias", href: "mentorias.html" },
    { key: "eventos", label: "Eventos futuros", href: "eventos.html" },
  ];

  /*
   * A BARRA SÓ APARECE ONDE ELA É O ASSUNTO.
   *
   * Nas páginas de seção ela era um menu de outro site: quem está lendo a
   * Programação não está a caminho de uma mentoria, e a faixa oferecia cinco
   * destinos que não têm nada a ver com o que a pessoa foi ler ali.
   *
   * Vale nas CINCO páginas da área — e não só em Especialistas — porque estas
   * não têm outra navegação nenhuma. Sem a barra, quem entra em Workshops fica
   * sem caminho para Mentorias, para Especialistas e para a Travessia.
   *
   * Nas seções o caminho de volta é o rodapé, que todas as doze têm.
   */
  const temBarra = (secao) => barLinks.some((item) => item.key === secao);

  function mountLegacyNavigation() {
    const current = body.dataset.section || "inicio";
    if (temBarra(current)) {
      const navigation = document.createElement("nav");
      navigation.className = "site-nav";
      navigation.setAttribute("aria-label", "Instituto Potala");
      navigation.innerHTML = `<a class="site-nav-marca" href="transcendido.html">
          <img src="media/potala-mark-transparent.png" alt="" width="86" height="70" decoding="async">
          <span>Instituto Potala</span>
        </a>
        <ul class="site-nav-list">${barLinks.map((item) => `
        <li class="site-nav-item"><a class="site-nav-link${item.key === current ? " is-active" : ""}"
          href="${item.href}"${item.key === current ? ' aria-current="page"' : ""}>${item.label}</a></li>
      `).join("")}</ul>`;
      body.prepend(navigation);
    }

    if (current === "quem-somos") {
      import("./js/about/about-closing-controller.js")
        .then(({ mountAboutClosing }) => mountAboutClosing())
        .catch((error) => console.warn("Encerramento do Quem Somos indisponível.", error));
    }

    if (document.querySelector("[data-section-closing-trigger]")) {
      import("./js/shared/closing-transition-controller.js")
        .then(({ mountClosingTransition }) => mountClosingTransition())
        .catch((error) => console.warn("Transição de encerramento indisponível.", error));
    }

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
          const remote = withRequiredDefaultSections(createSupabaseContentRepository({
            client: getSupabaseClient(),
            defaults: DEFAULT_HOME_BLOCKS,
          }), DEFAULT_HOME_BLOCKS, ["revista"]);
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
