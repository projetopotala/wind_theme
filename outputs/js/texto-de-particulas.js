/*
 * TEXTO DE PARTÍCULAS.
 *
 * ParticleText — React Bits (https://reactbits.dev), por David Haz, portado
 * para JavaScript puro: esta página não usa React. A lógica é a do original —
 * amostrar o texto num canvas fora da tela, espalhar uma partícula por ponto e
 * reuni-las ao carregar, com deriva lenta em repouso, brilho e o cursor
 * afastando as partículas. Adaptações para o Potala:
 *
 * - `alinhamento: "left"`: o título pode ficar alinhado à esquerda, como o resto
 *   da abertura (o original sempre centraliza).
 * - `sangria`: a área de desenho passa das bordas do título, para as partículas
 *   espalhadas não serem cortadas. Ela não recebe cliques (pointer-events:
 *   none) — o cursor é lido na janela, e o que está por baixo continua
 *   clicável.
 * - Fora da tela ou com a aba escondida, o laço de desenho descansa.
 * - O texto fica no HTML: sem JavaScript, é ele que aparece; com JavaScript,
 *   continua lá para leitores de tela.
 *
 * Com prefers-reduced-motion: reduce, as partículas já nascem no lugar, sem
 * espalhar, sem deriva e sem fugir do cursor — como no original.
 *
 * ---------------------------------------------------------------------------
 * MIT + Commons Clause License Condition v1.0 — Copyright (c) 2026 David Haz
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, and distribute the Software as part of
 * an application, website, or product, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * Commons Clause Restriction: you may use this Software, including for any
 * commercial purpose, so long as you do not sell, sublicense, or redistribute
 * the components themselves — whether alone, in a bundle, or as a ported
 * version.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED.
 * ---------------------------------------------------------------------------
 */

export const hexToRgb = (hex) => {
  const clean = String(hex).replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
};

export const mixRgb = (from, to, amount) => ({
  r: Math.round(from.r + (to.r - from.r) * amount),
  g: Math.round(from.g + (to.g - from.g) * amount),
  b: Math.round(from.b + (to.b - from.b) * amount),
});

const rgbToCss = (rgb) => `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

const waitForFonts = async (font) => {
  if (!("fonts" in document)) return;
  try {
    await document.fonts.load(font);
  } catch {
    /* sem a fonte, desenha com a que houver */
  }
  await document.fonts.ready;
};

export function montarTextoDeParticulas(container, opcoes = {}) {
  const {
    text = container.textContent.trim(),
    particleSize = 2,
    density = 4,
    color = "#ffffff",
    highlightColor = "#8b5cf6",
    scatter = 180,
    gatherDuration = 1600,
    stagger = 420,
    pointerRepel = 40,
    repelRadius = 120,
    idleDrift = 0.7,
    trigger = "mount",
    fontWeight = 800,
    fontFamily = "inherit",
    glow = true,
    alinhamento = "center",
    sangria = 0,
  } = opcoes;

  const canvas = document.createElement("canvas");
  canvas.className = "particle-text__canvas";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    left: `${-sangria}px`,
    top: `${-sangria}px`,
    width: `calc(100% + ${sangria * 2}px)`,
    height: `calc(100% + ${sangria * 2}px)`,
  });
  const leitura = document.createElement("span");
  leitura.className = "particle-text__sr";
  leitura.textContent = text;
  container.replaceChildren(canvas, leitura);
  container.classList.add("particle-text");

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    container.replaceChildren(text);
    return () => {};
  }

  let particles = [];
  let animationFrame = null;
  let resizeFrame = null;
  let buildId = 0;
  let gathering = false;
  let gatherStart = 0;
  let visivel = true;
  const reduceMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let reducedMotion = reduceMotionQuery?.matches ?? false;
  let width = 0;
  let height = 0;

  const pointer = { active: false, x: 0, y: 0, smoothX: 0, smoothY: 0 };

  const startGather = (fromScatter = true) => {
    if (!particles.length) return;
    const spread = reducedMotion ? 0 : scatter;
    particles.forEach((particle) => {
      if (fromScatter) {
        const angle = particle.seed * Math.PI * 2;
        const distance = spread * (0.35 + particle.depth * 0.75);
        particle.x = particle.targetX + Math.cos(angle) * distance + (particle.depth - 0.5) * spread * 0.55;
        particle.y = particle.targetY + Math.sin(angle) * distance + (particle.seed - 0.5) * spread * 0.55;
      }
      particle.startX = particle.x;
      particle.startY = particle.y;
      particle.delay = reducedMotion ? 0 : particle.seed * stagger;
    });
    gatherStart = performance.now();
    gathering = true;
  };

  const drawParticle = (particle) => {
    const size = particle.size;
    ctx.fillStyle = particle.color;
    if (size <= 2.1) {
      ctx.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
      return;
    }
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const render = (now) => {
    animationFrame = null;
    ctx.clearRect(0, 0, width, height);
    if (glow && !reducedMotion) {
      ctx.shadowBlur = particleSize * 3;
      ctx.shadowColor = highlightColor;
    } else {
      ctx.shadowBlur = 0;
    }

    pointer.smoothX += (pointer.x - pointer.smoothX) * 0.18;
    pointer.smoothY += (pointer.y - pointer.smoothY) * 0.18;

    let complete = true;
    particles.forEach((particle) => {
      let baseX = particle.targetX;
      let baseY = particle.targetY;
      let progress = 1;

      if (gathering) {
        const local = (now - gatherStart - particle.delay) / Math.max(1, reducedMotion ? 1 : gatherDuration);
        progress = clamp(local, 0, 1);
        const eased = easeOutCubic(progress);
        baseX = particle.startX + (particle.targetX - particle.startX) * eased;
        baseY = particle.startY + (particle.targetY - particle.startY) * eased;
        if (progress < 1) complete = false;
      } else if (!reducedMotion && idleDrift > 0) {
        const driftTime = now * 0.001;
        baseX += Math.sin(driftTime * 0.9 + particle.seed * 10) * idleDrift * particle.depth;
        baseY += Math.cos(driftTime * 0.75 + particle.depth * 10) * idleDrift * particle.depth;
      }

      if (pointer.active && !reducedMotion && pointerRepel > 0 && repelRadius > 0) {
        const dx = baseX - pointer.smoothX;
        const dy = baseY - pointer.smoothY;
        const distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < repelRadius) {
          const force = Math.pow(1 - distance / repelRadius, 2) * pointerRepel;
          baseX += (dx / distance) * force;
          baseY += (dy / distance) * force;
        }
      }

      const follow = reducedMotion ? 1 : 0.22;
      particle.x += (baseX - particle.x) * follow;
      particle.y += (baseY - particle.y) * follow;
      ctx.globalAlpha = clamp(0.35 + progress * 0.65, 0, 1);
      drawParticle(particle);
    });

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    if (gathering && complete) gathering = false;

    /* Com movimento reduzido e nada acontecendo, um quadro basta. */
    const parado = reducedMotion && !gathering;
    if (visivel && !document.hidden && !parado) animationFrame = window.requestAnimationFrame(render);
  };

  const ensureRenderLoop = () => {
    if (animationFrame === null && visivel && !document.hidden) {
      animationFrame = window.requestAnimationFrame(render);
    }
  };

  const sampleText = async () => {
    const currentBuild = ++buildId;
    const caixa = container.getBoundingClientRect();
    const caixaLargura = Math.floor(caixa.width);
    const caixaAltura = Math.floor(caixa.height);
    width = caixaLargura + sangria * 2;
    height = caixaAltura + sangria * 2;
    if (caixaLargura <= 0 || caixaAltura <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const computed = window.getComputedStyle(container);
    const resolvedFamily = fontFamily === "inherit" ? computed.fontFamily || "serif" : fontFamily;
    let resolvedSize = parseFloat(computed.fontSize) || 96;
    let font = `${fontWeight} ${resolvedSize}px ${resolvedFamily}`;

    await waitForFonts(font);
    if (currentBuild !== buildId) return;

    const offscreen = document.createElement("canvas");
    const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
    if (!offCtx) return;

    const content = String(text || " ");
    const maxTextWidth = caixaLargura * 0.98;
    offCtx.font = font;
    let metrics = offCtx.measureText(content);
    const measuredWidth = Math.max(1, metrics.width);
    if (measuredWidth > maxTextWidth) {
      resolvedSize = Math.max(18, resolvedSize * (maxTextWidth / measuredWidth));
      font = `${fontWeight} ${resolvedSize}px ${resolvedFamily}`;
      await waitForFonts(font);
      if (currentBuild !== buildId) return;
      offCtx.font = font;
      metrics = offCtx.measureText(content);
    }

    const left = Math.ceil(metrics.actualBoundingBoxLeft || 0);
    const right = Math.ceil(metrics.actualBoundingBoxRight || metrics.width);
    const ascent = Math.ceil(metrics.actualBoundingBoxAscent || resolvedSize * 0.78);
    const descent = Math.ceil(metrics.actualBoundingBoxDescent || resolvedSize * 0.22);
    const padding = Math.max(12, Math.ceil(resolvedSize * 0.08));
    const textWidth = Math.max(1, left + right);
    const textHeight = Math.max(1, ascent + descent);

    offscreen.width = textWidth + padding * 2;
    offscreen.height = textHeight + padding * 2;
    offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
    offCtx.font = font;
    offCtx.textAlign = "left";
    offCtx.textBaseline = "alphabetic";
    offCtx.fillStyle = "#ffffff";
    offCtx.fillText(content, padding - left, padding + ascent);

    /* Onde o texto fica dentro da área de desenho (que sangra `sangria` px). */
    const origemX = alinhamento === "left" ? sangria - padding : width / 2 - offscreen.width / 2;
    const origemY = sangria + caixaAltura / 2 - offscreen.height / 2;

    const imageData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
    const targets = [];
    const step = Math.max(2, Math.floor(density));
    for (let y = 0; y < offscreen.height; y += step) {
      for (let x = 0; x < offscreen.width; x += step) {
        const alpha = imageData.data[(y * offscreen.width + x) * 4 + 3];
        if (alpha > 40) targets.push({ x: origemX + x, y: origemY + y, alpha: alpha / 255 });
      }
    }

    const maxParticles = Math.max(900, Math.min(5200, Math.floor((width * height) / 90)));
    const stride = Math.max(1, Math.ceil(targets.length / maxParticles));
    const baseRgb = hexToRgb(color);
    const highlightRgb = hexToRgb(highlightColor);
    const selected = targets.filter((_, index) => index % stride === 0);

    particles = selected.map((target, index) => {
      const seed = ((index * 9301 + 49297) % 233280) / 233280;
      const depth = 0.45 + (((index * 233 + 97) % 1000) / 1000) * 0.9;
      const blend = baseRgb && highlightRgb ? clamp(target.x / Math.max(1, width) + (seed - 0.5) * 0.35, 0, 1) : 0;
      const particleColor = baseRgb && highlightRgb ? rgbToCss(mixRgb(baseRgb, highlightRgb, blend)) : color;
      const angle = seed * Math.PI * 2;
      const distance = (reducedMotion ? 0 : scatter) * (0.35 + depth * 0.75);
      const startX = target.x + Math.cos(angle) * distance + (seed - 0.5) * scatter * 0.45;
      const startY = target.y + Math.sin(angle) * distance + (depth - 0.9) * scatter * 0.45;
      return {
        x: reducedMotion ? target.x : startX,
        y: reducedMotion ? target.y : startY,
        startX,
        startY,
        targetX: target.x,
        targetY: target.y,
        size: Math.max(0.6, particleSize * (0.75 + target.alpha * 0.45)),
        color: particleColor,
        seed,
        depth,
        delay: seed * stagger,
      };
    });

    pointer.x = width / 2;
    pointer.y = height / 2;
    pointer.smoothX = pointer.x;
    pointer.smoothY = pointer.y;

    if (reducedMotion) {
      particles.forEach((particle) => {
        particle.x = particle.targetX;
        particle.y = particle.targetY;
        particle.startX = particle.targetX;
        particle.startY = particle.targetY;
        particle.delay = 0;
      });
      gathering = false;
    } else {
      startGather(false);
    }

    container.classList.add("particle-text--pronto");
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
    ensureRenderLoop();
  };

  const queueSample = () => {
    if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(sampleText);
  };

  /* O cursor é lido na janela: a área de desenho não recebe eventos, para não
     tapar os elementos vizinhos que ela sobrepõe. */
  const dentro = (event) => {
    const rect = canvas.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  };
  const handlePointerMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    const estava = pointer.active;
    pointer.active = dentro(event);
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    if (pointer.active && !estava && trigger === "hover") startGather(true);
  };
  const handleClick = (event) => {
    if (trigger === "click" && dentro(event)) startGather(true);
  };
  const handleReduceMotionChange = (event) => {
    reducedMotion = event.matches;
    sampleText();
  };
  const handleVisibility = () => ensureRenderLoop();

  reduceMotionQuery?.addEventListener("change", handleReduceMotionChange);
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("click", handleClick);
  document.addEventListener("visibilitychange", handleVisibility);

  const resizeObserver = new ResizeObserver(queueSample);
  resizeObserver.observe(container);
  const observadorVisao = new IntersectionObserver(([entrada]) => {
    visivel = entrada.isIntersecting;
    ensureRenderLoop();
  });
  observadorVisao.observe(canvas);
  sampleText();

  return () => {
    buildId += 1;
    resizeObserver.disconnect();
    observadorVisao.disconnect();
    reduceMotionQuery?.removeEventListener("change", handleReduceMotionChange);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("click", handleClick);
    document.removeEventListener("visibilitychange", handleVisibility);
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    container.classList.remove("particle-text", "particle-text--pronto");
    container.replaceChildren(text);
  };
}

/* Na página: cada [data-texto-particulas] ganha o efeito, com as cores do Potala
   (tinta que caminha para o dourado) no lugar do branco e roxo do original. */
if (typeof document !== "undefined") {
  document.querySelectorAll("[data-texto-particulas]").forEach((titulo) => {
    montarTextoDeParticulas(titulo, {
      color: "#18362f",
      highlightColor: "#a78855",
      fontWeight: 500,
      particleSize: titulo.dataset.textoParticulas === "centro" ? 2.3 : 2,
      density: 3,
      scatter: 180,
      alinhamento: titulo.dataset.textoParticulas === "centro" ? "center" : "left",
      sangria: 90,
    });
  });
}
