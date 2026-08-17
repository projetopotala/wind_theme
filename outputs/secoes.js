(() => {
  "use strict";

  const body = document.body;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const transitionDuration = reducedMotion ? 120 : 620;
  const isStoryPage = body.dataset.storyPage === "true";
  const storySections = [...document.querySelectorAll("[data-story-section]")];
  const chapters = [...document.querySelectorAll(".story-chapter")];
  let siteNav = null;
  let navigating = false;
  let navigationTimer = 0;
  let ticking = false;
  let pointerTargetX = 0;
  let pointerTargetY = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerFrame = 0;
  let rotationFrame = 0;
  let rotationLastTime = 0;
  const rotationStates = new WeakMap();
  let wheelTailFrame = 0;
  let wheelTailTimer = 0;
  let wheelTailStart = 0;
  let wheelTailOrigin = 0;
  let wheelTailDistance = 0;

  const siteSections = [
    { key: "inicio", label: "Início", href: "transcendido.html#inicio" },
    { key: "atendimentos", label: "Atendimentos", href: "transcendido.html#atendimentos" },
    { key: "atividades", label: "Atividades", href: "transcendido.html#atividades" },
    { key: "cursos", label: "Cursos", href: "transcendido.html#cursos" },
    { key: "programacao", label: "Programação", href: "transcendido.html#programacao" },
    { key: "saude-integrativa", label: "Saúde Integrativa", href: "transcendido.html#saude-integrativa" },
    { key: "cultura", label: "Cultura", href: "transcendido.html#cultura" }
  ];

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

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
    if (currentFileName() === "transcender.html") return null;

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

  function mountParallaxLayers(chapter) {
    const stage = chapter.querySelector(".environment-panel") || chapter.querySelector(".chapter-stage");
    if (!stage || stage.querySelector(".parallax-layer")) return;

    const farLayer = document.createElement("span");
    const nearLayer = document.createElement("span");
    farLayer.className = "parallax-layer parallax-layer--far";
    nearLayer.className = "parallax-layer parallax-layer--near";
    farLayer.setAttribute("aria-hidden", "true");
    nearLayer.setAttribute("aria-hidden", "true");
    stage.prepend(farLayer);
    stage.appendChild(nearLayer);
  }

  function updatePointerParallax() {
    pointerFrame = 0;
    pointerX += (pointerTargetX - pointerX) * .085;
    pointerY += (pointerTargetY - pointerY) * .085;

    body.style.setProperty("--mouse-bg-x", `${(-pointerX * 8).toFixed(2)}px`);
    body.style.setProperty("--mouse-bg-y", `${(-pointerY * 6).toFixed(2)}px`);
    body.style.setProperty("--mouse-far-x", `${(-pointerX * 11).toFixed(2)}px`);
    body.style.setProperty("--mouse-far-y", `${(-pointerY * 9).toFixed(2)}px`);
    body.style.setProperty("--mouse-orbit-x", `${(pointerX * 18).toFixed(2)}px`);
    body.style.setProperty("--mouse-orbit-y", `${(pointerY * 14).toFixed(2)}px`);
    body.style.setProperty("--mouse-title-x", `${(pointerX * 8).toFixed(2)}px`);
    body.style.setProperty("--mouse-title-y", `${(pointerY * 6).toFixed(2)}px`);
    body.style.setProperty("--mouse-near-x", `${(pointerX * 38).toFixed(2)}px`);
    body.style.setProperty("--mouse-near-y", `${(pointerY * 30).toFixed(2)}px`);
    body.style.setProperty("--mouse-near-rotate", `${(pointerX * 2.4).toFixed(2)}deg`);
    body.style.setProperty("--mouse-opening-x", `${(pointerX * 20).toFixed(2)}px`);
    body.style.setProperty("--mouse-opening-y", `${(pointerY * 15).toFixed(2)}px`);

    if (Math.abs(pointerTargetX - pointerX) > .001 || Math.abs(pointerTargetY - pointerY) > .001) {
      pointerFrame = requestAnimationFrame(updatePointerParallax);
    }
  }

  function requestPointerUpdate() {
    if (!pointerFrame) pointerFrame = requestAnimationFrame(updatePointerParallax);
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

  function entryVectorFor(path) {
    switch (path) {
      case "diagonal-up-right": return { x: -1, y: 1 };
      case "down": return { x: 0, y: 1 };
      case "left": return { x: 1, y: 0 };
      case "diagonal-down-right": return { x: -1, y: -1 };
      case "up-left": return { x: 1, y: 1 };
      case "arc-right": return { x: -1, y: 0 };
      default: return { x: 0, y: 1 };
    }
  }

  function rotationStateFor(chapter, index = 0) {
    let state = rotationStates.get(chapter);
    if (state) return state;

    state = {
      active: false,
      angle: index * 43,
      direction: index % 2 === 0 ? 1 : -1,
      speed: 1,
      slowUntil: 0,
      wasCentered: false
    };
    rotationStates.set(chapter, state);
    return state;
  }

  function updateAmbientRotation(timestamp) {
    const delta = rotationLastTime ? clamp(timestamp - rotationLastTime, 0, 48) : 16.67;
    rotationLastTime = timestamp;
    let hasActiveChapter = false;

    chapters.forEach((chapter, index) => {
      const state = rotationStateFor(chapter, index);
      if (!state.active) return;

      hasActiveChapter = true;
      const targetSpeed = timestamp < state.slowUntil ? .14 : 1;
      const responseTime = targetSpeed < state.speed ? 260 : 520;
      const blend = 1 - Math.exp(-delta / responseTime);
      state.speed += (targetSpeed - state.speed) * blend;
      state.angle = (state.angle + delta * .0085 * state.speed * state.direction + 360) % 360;

      chapter.style.setProperty("--ambient-rotate", `${state.angle.toFixed(2)}deg`);
      chapter.style.setProperty("--ambient-counter-rotate", `${(-state.angle * .42).toFixed(2)}deg`);
    });

    if (hasActiveChapter) {
      rotationFrame = requestAnimationFrame(updateAmbientRotation);
    } else {
      rotationFrame = 0;
      rotationLastTime = 0;
    }
  }

  function requestRotationUpdate() {
    if (!reducedMotion && !rotationFrame) {
      rotationFrame = requestAnimationFrame(updateAmbientRotation);
    }
  }

  function updateStoryMotion() {
    ticking = false;
    const maxScroll = Math.max(1, body.scrollHeight - body.clientHeight);
    body.style.setProperty("--page-progress", (body.scrollTop / maxScroll).toFixed(4));

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

    chapters.forEach((chapter, index) => {
      const rect = chapter.getBoundingClientRect();
      const travel = Math.max(1, rect.height - innerHeight);
      const progress = clamp(-rect.top / travel, 0, 1);
      const direction = index % 2 === 0 ? 1 : -1;
      const centered = progress - .5;
      const motionScale = innerWidth <= 720 ? .46 : innerWidth <= 1000 ? .72 : 1;
      const sceneScale = innerWidth <= 720 ? .72 : 1;
      const entryVector = entryVectorFor(chapter.dataset.scrollPath);
      const nextChapter = chapters[index + 1];
      const nextEntryVector = nextChapter ? entryVectorFor(nextChapter.dataset.scrollPath) : { x: 0, y: 0 };
      const approach = index === 0
        ? clamp(-rect.top / Math.max(1, innerHeight * .24), 0, 1)
        : clamp((innerHeight - rect.top) / Math.max(1, innerHeight * .86), 0, 1);
      const entryEase = 1 - Math.pow(1 - approach, 3);
      const exitProgress = nextChapter ? clamp((progress - .5) / .5, 0, 1) : 0;
      const exitEase = exitProgress * exitProgress * exitProgress
        * (exitProgress * (exitProgress * 6 - 15) + 10);
      const rotationState = rotationStateFor(chapter, index);
      const reachedCenter = index === 0 ? entryEase >= .985 : rect.top <= innerHeight * .015;
      const isCentered = reachedCenter && exitProgress <= .08;
      rotationState.active = entryEase > .015 && exitEase < .995;
      if (isCentered && !rotationState.wasCentered) {
        rotationState.slowUntil = performance.now() + 1500;
      }
      rotationState.wasCentered = isCentered;
      const sceneDistanceX = innerWidth * .72 * sceneScale;
      const sceneDistanceY = innerHeight * .82 * sceneScale;
      const stageScrollCompensationY = index === 0 ? 0 : Math.max(rect.top, 0) * entryEase;
      const sceneX = (1 - entryEase) * entryVector.x * sceneDistanceX - exitEase * nextEntryVector.x * sceneDistanceX;
      const sceneY = (1 - entryEase) * entryVector.y * sceneDistanceY
        - stageScrollCompensationY
        - exitEase * nextEntryVector.y * sceneDistanceY;
      let titleX = 0;
      let titleY = 0;

      switch (chapter.dataset.scrollPath) {
        case "diagonal-up-right":
          titleX = centered * 190;
          titleY = -centered * 130;
          break;
        case "down":
          titleX = Math.sin(progress * Math.PI) * 22;
          titleY = centered * 170;
          break;
        case "left":
          titleX = -centered * 220;
          titleY = Math.sin(progress * Math.PI) * -24;
          break;
        case "diagonal-down-right":
          titleX = centered * 180;
          titleY = centered * 125;
          break;
        case "up-left":
          titleX = -centered * 155;
          titleY = -centered * 165;
          break;
        case "arc-right":
          titleX = centered * 200;
          titleY = (.5 - Math.sin(progress * Math.PI)) * 92;
          break;
        default:
          titleY = centered * 80;
      }

      titleX *= motionScale;
      titleY *= motionScale;

      chapter.style.setProperty("--chapter-y", `${(-titleY * .3).toFixed(1)}px`);
      chapter.style.setProperty("--chapter-x", `${(-titleX * .28).toFixed(1)}px`);
      chapter.style.setProperty("--chapter-orbit-x", `${(-titleX * .72 + centered * 38 * direction).toFixed(1)}px`);
      chapter.style.setProperty("--chapter-orbit-y", `${(-titleY * .54).toFixed(1)}px`);
      chapter.style.setProperty("--chapter-title-x", `${titleX.toFixed(1)}px`);
      chapter.style.setProperty("--chapter-title-y", `${titleY.toFixed(1)}px`);
      chapter.style.setProperty("--chapter-index-y", `${(-titleY * .2).toFixed(1)}px`);
      chapter.style.setProperty("--chapter-light-x", `${(-18 + progress * 36).toFixed(1)}%`);
      chapter.style.setProperty("--chapter-scale", (0.95 + progress * .1).toFixed(3));
      chapter.style.setProperty("--chapter-rotate", `${(-7 + progress * 14).toFixed(1)}deg`);
      chapter.style.setProperty("--parallax-far-x", `${(-titleX * .2 + centered * 34 * direction * motionScale).toFixed(1)}px`);
      chapter.style.setProperty("--parallax-far-y", `${(-titleY * .22).toFixed(1)}px`);
      chapter.style.setProperty("--parallax-near-x", `${(titleX * 1.42 + centered * 62 * direction * motionScale).toFixed(1)}px`);
      chapter.style.setProperty("--parallax-near-y", `${(titleY * 1.3).toFixed(1)}px`);
      chapter.style.setProperty("--parallax-far-scale", (0.96 + progress * .08).toFixed(3));
      chapter.style.setProperty("--parallax-near-scale", (0.92 + progress * .16).toFixed(3));
      chapter.style.setProperty("--parallax-near-rotate", `${(-8 + progress * 16).toFixed(1)}deg`);
      chapter.style.setProperty("--scene-x", `${sceneX.toFixed(1)}px`);
      chapter.style.setProperty("--scene-y", `${sceneY.toFixed(1)}px`);
      chapter.style.setProperty("--scene-scale", (0.965 + entryEase * .035 - exitEase * .04).toFixed(3));
      chapter.style.setProperty("--scene-opacity", Math.max(.08, entryEase * (1 - exitEase * .9)).toFixed(3));
    });

    requestRotationUpdate();
    updateSiteNavActive();
  }

  function requestStoryUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateStoryMotion);
  }

  siteNav = mountSiteNav();
  document.querySelectorAll("[data-fold-text]").forEach(mountFoldText);
  chapters.forEach(mountParallaxLayers);

  if (chapters.length) {
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

  if (!reducedMotion && matchMedia("(pointer: fine)").matches) {
    body.addEventListener("pointermove", (event) => {
      pointerTargetX = clamp((event.clientX / Math.max(1, innerWidth) - .5) * 2, -1, 1);
      pointerTargetY = clamp((event.clientY / Math.max(1, innerHeight) - .5) * 2, -1, 1);
      requestPointerUpdate();
    }, { passive: true });

    body.addEventListener("pointerleave", () => {
      pointerTargetX = 0;
      pointerTargetY = 0;
      requestPointerUpdate();
    }, { passive: true });
  }

  body.addEventListener("scroll", requestStoryUpdate, { passive: true });
  if (isStoryPage && !reducedMotion) {
    body.addEventListener("wheel", handleStoryWheel, { passive: false });
  }
  addEventListener("resize", requestStoryUpdate, { passive: true });

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
