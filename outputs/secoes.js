(() => {
  "use strict";

  const body = document.body;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const transitionDuration = reducedMotion ? 120 : 620;
  const isStoryPage = body.dataset.storyPage === "true";
  const storySections = [...document.querySelectorAll("[data-story-section]")];
  const chapters = [...document.querySelectorAll(".story-chapter")];
  const journeyRoad = document.getElementById("journey-road");
  const journeyRoadContext = journeyRoad?.getContext("2d", { alpha: true });
  let siteNav = null;
  let navigating = false;
  let navigationTimer = 0;
  let ticking = false;
  let wheelTailFrame = 0;
  let wheelTailTimer = 0;
  let wheelTailStart = 0;
  let wheelTailOrigin = 0;
  let wheelTailDistance = 0;
  let journeyRoadAnchors = [];
  let journeyMilestones = [];
  let journeyRoadWidth = 104;

  const siteSections = [
    { key: "inicio", label: "Início", href: "transcendido.html#inicio" },
    { key: "atendimentos", label: "Atendimentos", href: "atendimentos.html" },
    { key: "atividades", label: "Atividades", href: "atividades.html" },
    { key: "cursos", label: "Cursos", href: "cursos.html" },
    { key: "programacao", label: "Programação", href: "programacao.html" },
    { key: "saude-integrativa", label: "Saúde Integrativa", href: "saude-integrativa.html" },
    { key: "cultura", label: "Cultura", href: "cultura.html" }
  ];

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const smoothstep = (value) => value * value * (3 - 2 * value);

  function documentTopFor(element) {
    return element.getBoundingClientRect().top + body.scrollTop;
  }

  function buildJourneyRoadAnchors() {
    if (!journeyRoadContext) return;

    const verticalStep = innerHeight * (innerWidth <= 720 ? 1.06 : 1.18);
    const turnDrop = innerHeight * (innerWidth <= 720 ? .42 : .54);
    const horizontalStep = innerWidth * (innerWidth <= 720 ? .98 : 1.08);
    const secondTurnWidth = innerWidth * (innerWidth <= 720 ? .28 : .36);
    journeyRoadAnchors = chapters.map((chapter, index) => {
      if (index === 0) return { x: 0, y: 0 };
      if (index === 1) return { x: 0, y: verticalStep };
      if (index === 2) return { x: horizontalStep, y: verticalStep + turnDrop };
      if (index === 3) return { x: horizontalStep * 2, y: verticalStep + turnDrop };
      return {
        x: horizontalStep * 2 + secondTurnWidth,
        y: verticalStep + turnDrop + verticalStep * (index - 3)
      };
    });
    journeyMilestones = chapters.map(documentTopFor);
  }

  function resizeJourneyRoad() {
    if (!journeyRoadContext) return;

    const dpr = Math.min(devicePixelRatio || 1, 1.75);
    journeyRoad.width = Math.max(1, Math.round(innerWidth * dpr));
    journeyRoad.height = Math.max(1, Math.round(innerHeight * dpr));
    journeyRoadContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    journeyRoadWidth = innerWidth <= 720
      ? clamp(innerWidth * .72, 230, 340)
      : clamp(innerWidth * .44, 480, 820);
    buildJourneyRoadAnchors();
  }

  function traceJourneyRoadLine(context, points) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    context.lineTo(points[1].x, points[1].y);
    context.lineTo(points[2].x, points[2].y);

    const turnStart = points[2];
    const turnEnd = points[3];
    const turnWidth = turnEnd.x - turnStart.x;
    const turnHeight = turnEnd.y - turnStart.y;
    context.bezierCurveTo(
      turnStart.x,
      turnStart.y + turnHeight * .72,
      turnEnd.x - turnWidth * .58,
      turnEnd.y,
      turnEnd.x,
      turnEnd.y
    );

    context.lineTo(points[4].x, points[4].y);

    const secondTurnStart = points[4];
    const secondTurnEnd = points[5];
    const secondTurnWidth = secondTurnEnd.x - secondTurnStart.x;
    const secondTurnHeight = secondTurnEnd.y - secondTurnStart.y;
    context.bezierCurveTo(
      secondTurnStart.x + secondTurnWidth * .72,
      secondTurnStart.y,
      secondTurnEnd.x,
      secondTurnEnd.y - secondTurnHeight * .58,
      secondTurnEnd.x,
      secondTurnEnd.y
    );

    points.slice(6).forEach((point) => context.lineTo(point.x, point.y));
  }

  function cubicPoint(from, controlA, controlB, to, progress) {
    const inverse = 1 - progress;
    return {
      x: inverse ** 3 * from.x
        + 3 * inverse ** 2 * progress * controlA.x
        + 3 * inverse * progress ** 2 * controlB.x
        + progress ** 3 * to.x,
      y: inverse ** 3 * from.y
        + 3 * inverse ** 2 * progress * controlA.y
        + 3 * inverse * progress ** 2 * controlB.y
        + progress ** 3 * to.y
    };
  }

  function journeyCameraPosition() {
    if (!journeyRoadAnchors.length || !journeyMilestones.length) return { x: 0, y: 0 };
    if (body.scrollTop <= journeyMilestones[0]) {
      const entryStart = Math.max(0, journeyMilestones[0] - innerHeight * .36);
      const entryProgress = smoothstep(clamp(
        (body.scrollTop - entryStart) / Math.max(1, journeyMilestones[0] - entryStart),
        0,
        1
      ));
      return {
        x: journeyRoadAnchors[0].x,
        y: journeyRoadAnchors[0].y - innerHeight * 1.08 * (1 - entryProgress)
      };
    }

    for (let index = 0; index < journeyMilestones.length - 1; index += 1) {
      const start = journeyMilestones[index];
      const end = journeyMilestones[index + 1];
      if (body.scrollTop > end) continue;

      const progress = smoothstep(clamp((body.scrollTop - start) / Math.max(1, end - start), 0, 1));
      const from = journeyRoadAnchors[index];
      const to = journeyRoadAnchors[index + 1];
      if (index === 1) {
        const turnWidth = to.x - from.x;
        const turnHeight = to.y - from.y;
        return cubicPoint(
          from,
          { x: from.x, y: from.y + turnHeight * .72 },
          { x: to.x - turnWidth * .58, y: to.y },
          to,
          progress
        );
      }
      if (index === 3) {
        const turnWidth = to.x - from.x;
        const turnHeight = to.y - from.y;
        return cubicPoint(
          from,
          { x: from.x + turnWidth * .72, y: from.y },
          { x: to.x, y: to.y - turnHeight * .58 },
          to,
          progress
        );
      }
      return {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress
      };
    }

    return journeyRoadAnchors.at(-1);
  }

  function drawJourneyRoad() {
    if (!journeyRoadContext || journeyRoadAnchors.length < 2) return;

    const context = journeyRoadContext;
    const introFade = clamp((body.scrollTop - innerHeight * .16) / Math.max(1, innerHeight * .68), 0, 1);
    journeyRoad.style.setProperty("--road-opacity", (introFade * .88).toFixed(3));
    context.clearRect(0, 0, innerWidth, innerHeight);
    if (introFade <= .001) return;

    const camera = journeyCameraPosition();
    // Extend the first and last segments well beyond the camera. This keeps the
    // rounded road caps outside the viewport while the visitor enters or exits
    // the journey, rather than showing them as a circular road end.
    const route = [
      { x: journeyRoadAnchors[0].x, y: journeyRoadAnchors[0].y - innerHeight * 2.35 },
      ...journeyRoadAnchors,
      { x: journeyRoadAnchors.at(-1).x, y: journeyRoadAnchors.at(-1).y + innerHeight * 2.35 }
    ];
    const points = route.map((point) => ({
      x: innerWidth * .5 + point.x - camera.x,
      y: innerHeight * .5 + point.y - camera.y
    }));

    const shoulderGradient = context.createLinearGradient(0, 0, innerWidth, 0);
    shoulderGradient.addColorStop(0, "rgba(107, 84, 66, .5)");
    shoulderGradient.addColorStop(.5, "rgba(164, 133, 103, .72)");
    shoulderGradient.addColorStop(1, "rgba(107, 84, 66, .5)");

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.shadowColor = "rgba(75, 62, 52, .16)";
    context.shadowBlur = 24;
    context.lineWidth = journeyRoadWidth + 30;
    context.strokeStyle = shoulderGradient;
    traceJourneyRoadLine(context, points);
    context.stroke();
    context.restore();

    const asphaltGradient = context.createLinearGradient(0, 0, innerWidth, 0);
    asphaltGradient.addColorStop(0, "rgba(73, 86, 88, .84)");
    asphaltGradient.addColorStop(.5, "rgba(63, 75, 76, .92)");
    asphaltGradient.addColorStop(1, "rgba(73, 86, 88, .84)");

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = journeyRoadWidth;
    context.strokeStyle = asphaltGradient;
    traceJourneyRoadLine(context, points);
    context.stroke();

    context.setLineDash(innerWidth <= 720 ? [24, 22] : [32, 28]);
    context.lineDashOffset = reducedMotion ? 0 : -(body.scrollTop * .34);
    context.lineWidth = innerWidth <= 720 ? 2.8 : 3.4;
    context.strokeStyle = "rgba(248, 251, 252, .82)";
    context.shadowColor = "rgba(255, 255, 255, .26)";
    context.shadowBlur = 5;
    traceJourneyRoadLine(context, points);
    context.stroke();
    context.restore();
  }

  function currentFileName() {
    return decodeURIComponent(location.pathname.split("/").pop() || "").toLowerCase();
  }

  function currentNavKey() {
    if (!isStoryPage || !storySections.length) return body.dataset.section || "";

    const viewportCenter = innerHeight * .5;
    const current = storySections.find((section) => {
      const rect = section.getBoundingClientRect();
      return rect.top <= viewportCenter && rect.bottom > viewportCenter;
    });

    return current?.dataset.storySection || storySections.at(-1)?.dataset.storySection || "inicio";
  }

  function scrollToStoryDestination(destination, behavior = reducedMotion ? "auto" : "smooth") {
    if (!destination) return;
    const firstChapterOffset = destination === chapters[0] ? body.clientHeight * .24 : 0;
    body.scrollTo({ top: destination.offsetTop + firstChapterOffset, behavior });
  }

  function updateSiteNavActive() {
    if (!siteNav) return;
    const activeKey = currentNavKey();
    if (siteNav.dataset.active === activeKey) return;
    siteNav.dataset.active = activeKey;

    siteNav.querySelectorAll(".site-nav-link").forEach((link) => {
      const active = link.dataset.navKey === activeKey;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    const list = siteNav.querySelector(".site-nav-list");
    const activeLink = siteNav.querySelector(".site-nav-link.is-active");
    if (!list || !activeLink) return;
    list.scrollTo({
      left: activeLink.offsetLeft - (list.clientWidth - activeLink.offsetWidth) / 2,
      behavior: reducedMotion ? "auto" : "smooth"
    });
  }

  function navigateDirect(destination) {
    if (!destination || navigating) return;
    navigating = true;
    body.classList.add("is-leaving");

    try {
      sessionStorage.setItem("potala-entry-direction", "center");
    } catch {
      // The destination still opens normally when storage is unavailable.
    }

    navigationTimer = setTimeout(() => {
      location.href = destination;
    }, transitionDuration);
  }

  function mountSiteNav() {
    if (["transcender.html", "transcendido.html"].includes(currentFileName())) return null;

    const nav = document.createElement("nav");
    const list = document.createElement("ul");
    nav.className = "site-nav";
    nav.setAttribute("aria-label", "Navegação principal");
    list.className = "site-nav-list";

    siteSections.forEach((section) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      item.className = "site-nav-item";
      link.className = "site-nav-link";
      link.href = section.href;
      link.textContent = section.label;
      link.dataset.navKey = section.key;

      link.addEventListener("click", (event) => {
        if (isStoryPage) {
          const destination = document.getElementById(section.key);
          if (destination) {
            event.preventDefault();
            scrollToStoryDestination(destination);
            return;
          }
        }

        event.preventDefault();
        navigateDirect(section.href);
      });

      item.appendChild(link);
      list.appendChild(item);
    });

    nav.appendChild(list);
    body.appendChild(nav);
    return nav;
  }

  function mountFoldText(root) {
    const text = root.dataset.foldText || root.textContent || "";
    const screenReaderText = document.createElement("span");
    const visualText = document.createElement("span");
    screenReaderText.className = "fold-text-sr-only";
    screenReaderText.textContent = text;
    visualText.className = "fold-text-visual";
    visualText.setAttribute("aria-hidden", "true");

    Array.from(text).forEach((character, index) => {
      const segment = document.createElement("span");
      const piece = document.createElement("span");
      segment.className = "fold-text-segment";
      piece.className = "fold-text-piece";
      piece.style.setProperty("--fold-delay", `${420 + index * 60}ms`);
      piece.textContent = character === " " ? "\u00a0" : character;
      segment.appendChild(piece);
      visualText.appendChild(segment);
    });

    root.replaceChildren(screenReaderText, visualText);
    root.classList.add("is-ready");
  }

  function mountSectionLink(chapter) {
    const section = siteSections.find((item) => item.key === chapter.dataset.storySection);
    const panel = chapter.querySelector(".environment-panel");
    if (!section || !panel) return;

    panel.tabIndex = 0;
    panel.setAttribute("role", "link");
    panel.setAttribute("aria-label", `Abrir ${section.label}`);

    const openSection = () => navigateDirect(section.href);
    panel.addEventListener("click", openSection);
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openSection();
    });
  }

  function maxScrollableDistance() {
    return Math.max(0, body.scrollHeight - body.clientHeight);
  }

  function updateWheelTail(timestamp) {
    const progress = clamp((timestamp - wheelTailStart) / 150, 0, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    body.scrollTop = clamp(wheelTailOrigin + wheelTailDistance * easeOut, 0, maxScrollableDistance());

    if (progress < 1) {
      wheelTailFrame = requestAnimationFrame(updateWheelTail);
    } else {
      wheelTailFrame = 0;
    }
  }

  function startWheelTail() {
    wheelTailTimer = 0;
    wheelTailOrigin = body.scrollTop;
    wheelTailStart = performance.now();
    if (Math.abs(wheelTailDistance) > .5) {
      wheelTailFrame = requestAnimationFrame(updateWheelTail);
    }
  }

  function handleStoryWheel(event) {
    if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX) || event.target.closest(".site-nav")) return;
    event.preventDefault();

    if (wheelTailFrame) cancelAnimationFrame(wheelTailFrame);
    if (wheelTailTimer) clearTimeout(wheelTailTimer);
    wheelTailFrame = 0;

    const modeScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? innerHeight : 1;
    const wheelDelta = event.deltaY * modeScale;
    const maximumStep = Math.min(innerHeight * .12, 115);
    const immediateStep = clamp(wheelDelta * .72, -maximumStep, maximumStep);

    body.scrollTop = clamp(body.scrollTop + immediateStep, 0, maxScrollableDistance());
    wheelTailDistance = clamp(immediateStep * .24, -68, 68);
    wheelTailTimer = setTimeout(startWheelTail, 70);
  }

  function updateStoryMotion() {
    ticking = false;
    const maxScroll = Math.max(1, body.scrollHeight - body.clientHeight);
    body.style.setProperty("--page-progress", (body.scrollTop / maxScroll).toFixed(4));
    drawJourneyRoad();

    const opening = document.querySelector(".story-opening");
    if (opening) {
      const openingProgress = clamp(body.scrollTop / Math.max(1, body.clientHeight), 0, 1);
      const openingExitProgress = clamp(openingProgress / .98, 0, 1);
      const openingExit = openingExitProgress * openingExitProgress * openingExitProgress
        * (openingExitProgress * (openingExitProgress * 6 - 15) + 10);
      opening.style.setProperty("--opening-shift", `${openingExit * 92}px`);
      opening.style.setProperty("--opening-scale", (1 + openingExit * .08).toFixed(3));
      opening.style.setProperty("--opening-scene-x", `${(openingExit * Math.min(innerWidth * .3, 320)).toFixed(1)}px`);
      opening.style.setProperty("--opening-scene-y", `${(-openingExit * Math.min(innerHeight * .2, 150)).toFixed(1)}px`);
      opening.style.setProperty("--opening-scene-scale", (1 - openingExit * .035).toFixed(3));
      opening.style.setProperty("--opening-opacity", (1 - openingExit * .95).toFixed(3));
    }

    const camera = journeyCameraPosition();
    const storyReveal = clamp((body.scrollTop - innerHeight * .52) / Math.max(1, innerHeight * .42), 0, 1);

    chapters.forEach((chapter, index) => {
      const rect = chapter.getBoundingClientRect();
      const travel = Math.max(1, rect.height - innerHeight);
      const progress = clamp(-rect.top / travel, 0, 1);
      const routePoint = journeyRoadAnchors[index] || { x: 0, y: 0 };
      const sceneX = routePoint.x - camera.x;
      const sceneY = routePoint.y - camera.y;
      const normalizedDistance = Math.hypot(
        sceneX / Math.max(1, innerWidth * .9),
        sceneY / Math.max(1, innerHeight * .9)
      );
      const sceneVisibility = clamp(1 - normalizedDistance / 1.08, 0, 1) * storyReveal;
      const motionScale = innerWidth <= 720 ? .46 : innerWidth <= 1000 ? .72 : 1;
      chapter.classList.toggle("is-visible", sceneVisibility > .18);
      chapter.classList.toggle("is-on-route", normalizedDistance < 1.38);
      chapter.classList.toggle("is-clickable", sceneVisibility > .72);
      chapter.style.zIndex = `${Math.max(1, Math.round(sceneVisibility * 100))}`;

      const titleX = clamp(-sceneX * .045, -54, 54) * motionScale;
      const titleY = clamp(-sceneY * .038, -42, 42) * motionScale;
      const proximity = 1 - clamp(normalizedDistance, 0, 1);

      chapter.style.setProperty("--chapter-y", `${(-titleY * .3).toFixed(1)}px`);
      chapter.style.setProperty("--chapter-x", `${(-titleX * .28).toFixed(1)}px`);
      chapter.style.setProperty("--chapter-title-x", `${titleX.toFixed(1)}px`);
      chapter.style.setProperty("--chapter-title-y", `${titleY.toFixed(1)}px`);
      chapter.style.setProperty("--chapter-index-y", `${(-titleY * .2).toFixed(1)}px`);
      chapter.style.setProperty("--chapter-light-x", `${(-12 + proximity * 24).toFixed(1)}%`);
      chapter.style.setProperty("--chapter-scale", (0.96 + proximity * .04).toFixed(3));
      chapter.style.setProperty("--chapter-rotate", `${((progress - .5) * 7).toFixed(1)}deg`);
      chapter.style.setProperty("--scene-x", `${sceneX.toFixed(1)}px`);
      chapter.style.setProperty("--scene-y", `${sceneY.toFixed(1)}px`);
      chapter.style.setProperty("--scene-scale", (1 - Math.min(.055, normalizedDistance * .035)).toFixed(3));
    });

    updateSiteNavActive();
  }

  function requestStoryUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateStoryMotion);
  }

  siteNav = mountSiteNav();
  document.querySelectorAll("[data-fold-text]").forEach(mountFoldText);
  chapters.forEach(mountSectionLink);
  resizeJourneyRoad();

  if (chapters.length && !isStoryPage) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("is-visible", entry.isIntersecting && entry.intersectionRatio >= .12);
      });
    }, { threshold: [0, .12, .32] });
    chapters.forEach((chapter) => observer.observe(chapter));
  }

  document.querySelectorAll("[data-scroll-to]").forEach((control) => {
    control.addEventListener("click", () => {
      scrollToStoryDestination(document.getElementById(control.dataset.scrollTo));
    });
  });

  body.addEventListener("scroll", requestStoryUpdate, { passive: true });
  if (isStoryPage && !reducedMotion) {
    body.addEventListener("wheel", handleStoryWheel, { passive: false });
  }
  addEventListener("resize", () => {
    resizeJourneyRoad();
    requestStoryUpdate();
  }, { passive: true });

  requestAnimationFrame(() => {
    if (isStoryPage && location.hash) {
      const destination = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      scrollToStoryDestination(destination, "auto");
    }
    body.classList.add("is-ready");
    updateStoryMotion();
  });

  addEventListener("pageshow", () => {
    clearTimeout(navigationTimer);
    navigating = false;
    body.classList.remove("is-leaving", "is-leaving-left", "is-leaving-right", "is-leaving-down", "is-leaving-up");
    requestStoryUpdate();
  });
})();
