import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const modulo = process.env.POTALA_PLAYWRIGHT_MODULE || "playwright";
const { chromium } = createRequire(import.meta.url)(modulo);
const url = process.env.POTALA_HERO_URL || "http://127.0.0.1:4173/transcendido.html";
const urlAntes = process.env.POTALA_HERO_BEFORE_URL;
const evidencia = process.env.POTALA_HERO_EVIDENCE_DIR;
const executavel = process.env.POTALA_CHROME_PATH;
const larguras = [390, 1366, 1920];

if (evidencia) await mkdir(evidencia, { recursive: true });

const navegador = await chromium.launch({
  headless: true,
  ...(executavel ? { executablePath: executavel } : {}),
});

const resultados = [];

try {
  if (urlAntes && evidencia) {
    const paginaAntes = await navegador.newPage({ viewport: { width: 1366, height: 768 } });
    await paginaAntes.goto(urlAntes, { waitUntil: "networkidle" });
    await paginaAntes.locator(".hero").screenshot({ path: join(evidencia, "antes-1366.png") });
    await paginaAntes.close();
  }

  for (const largura of larguras) {
    const pagina = await navegador.newPage({ viewport: { width: largura, height: largura === 390 ? 844 : 900 } });
    const erros = [];
    const recursosComErro = [];
    pagina.on("console", (mensagem) => {
      if (mensagem.type() === "error") erros.push(mensagem.text());
    });
    pagina.on("pageerror", (erro) => erros.push(erro.message));
    pagina.on("response", (resposta) => {
      if (resposta.status() >= 400) recursosComErro.push({ status: resposta.status(), url: resposta.url() });
    });

    await pagina.goto(url, { waitUntil: "networkidle" });
    const cena = pagina.locator(".hero-card__cena.cena-viva");
    await cena.waitFor({ state: "visible" });
    await cena.scrollIntoViewIfNeeded();

    const medidas = await pagina.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      cena: document.querySelector(".hero-card__cena")?.getBoundingClientRect().toJSON(),
      foto: document.querySelector(".hero-card__cena .cena-viva__foto")?.getAttribute("src"),
      titulo: document.querySelector(".hero h1")?.textContent?.trim(),
    }));
    assert.equal(medidas.scrollWidth, medidas.clientWidth, `overflow horizontal em ${largura}px`);
    assert.equal(medidas.foto, "media/atendimentos-sala-viva.webp");
    assert.equal(medidas.titulo, "Atendimentos");
    assert.ok(medidas.cena?.width > 300, `cena pequena em ${largura}px`);
    const errosInesperados = erros.filter((erro) => (
      !erro.includes("Ambiente LOCAL sem os dados de configuração")
      && !erro.startsWith("Failed to load resource:")
    ));
    const recursosInesperados = recursosComErro.filter(({ url: recurso }) => !/ambiente-local\.js|favicon\.ico/.test(recurso));
    assert.deepEqual(errosInesperados, [], `erros JavaScript inesperados em ${largura}px`);
    assert.deepEqual(recursosInesperados, [], `recursos inesperadamente indisponíveis em ${largura}px`);

    if (evidencia) await pagina.locator(".hero").screenshot({ path: join(evidencia, `depois-${largura}.png`) });
    resultados.push({ largura, ...medidas, errosEsperados: erros, recursosEsperados: recursosComErro });
    await pagina.close();
  }

  const paginaTempo = await navegador.newPage({ viewport: { width: 1366, height: 900 } });
  await paginaTempo.goto(url, { waitUntil: "networkidle" });
  const cenaTempo = paginaTempo.locator(".hero-card__cena.cena-viva");
  await cenaTempo.scrollIntoViewIfNeeded();
  const caixaCena = await cenaTempo.boundingBox();
  assert.ok(caixaCena, "a cena precisa ter geometria para as evidências ampliadas");
  const midia = await paginaTempo.evaluate(() => {
    const video = document.querySelector(".hero-card__cena .cena-viva__video");
    const fluxo = video.captureStream();
    return {
      audioTracks: fluxo.getAudioTracks().length,
      videoTracks: fluxo.getVideoTracks().length,
      muted: video.muted,
      loop: video.loop,
      autoplay: video.autoplay,
      playsInline: video.playsInline,
    };
  });
  assert.deepEqual(midia, { audioTracks: 0, videoTracks: 1, muted: true, loop: true, autoplay: true, playsInline: true });
  const estados = [];
  let segundoAnterior = 0;
  for (const segundos of [0, 2, 5, 10]) {
    if (segundos) await paginaTempo.waitForTimeout((segundos - segundoAnterior) * 1000);
    estados.push(await paginaTempo.evaluate((tempo) => {
      const video = document.querySelector(".hero-card__cena .cena-viva__video");
      return {
        segundos: tempo,
        currentTime: video.currentTime,
        duration: video.duration,
        paused: video.paused,
        readyState: video.readyState,
        active: video.closest(".cena-viva").classList.contains("cena-viva--video-ativo"),
      };
    }, segundos));
    if (evidencia) await cenaTempo.screenshot({ path: join(evidencia, `movimento-${segundos}s.png`) });
    if (evidencia) {
      await paginaTempo.screenshot({
        path: join(evidencia, `chama-${segundos}s.png`),
        clip: {
          x: caixaCena.x + caixaCena.width * .19,
          y: caixaCena.y + caixaCena.height * .27,
          width: caixaCena.width * .23,
          height: caixaCena.height * .3,
        },
      });
      await paginaTempo.screenshot({
        path: join(evidencia, `folhas-${segundos}s.png`),
        clip: {
          x: caixaCena.x + caixaCena.width * .5,
          y: caixaCena.y,
          width: caixaCena.width * .47,
          height: caixaCena.height * .55,
        },
      });
    }
    segundoAnterior = segundos;
  }
  assert.ok(estados.every((item) => item.active && item.readyState >= 2), "o vídeo não ficou pronto");
  assert.ok(new Set(estados.map((item) => item.currentTime.toFixed(2))).size > 1, "o vídeo não avançou");
  assert.ok(estados.every((item) => item.duration > 4 && item.duration < 11), "duração inesperada");
  if (evidencia) {
    for (const [tempo, nome] of [[.05, "inicio"], [4.95, "fim"]]) {
      await paginaTempo.locator(".cena-viva__video").evaluate((video, atual) => { video.currentTime = atual; }, tempo);
      await paginaTempo.waitForTimeout(250);
      await cenaTempo.screenshot({ path: join(evidencia, `loop-${nome}.png`) });
    }
  }
  await paginaTempo.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await paginaTempo.waitForTimeout(250);
  assert.equal(await paginaTempo.locator(".cena-viva__video").evaluate((video) => video.paused), true, "o vídeo deve pausar fora da tela");
  await cenaTempo.scrollIntoViewIfNeeded();
  await paginaTempo.waitForTimeout(250);
  assert.equal(await paginaTempo.locator(".cena-viva__video").evaluate((video) => video.paused), false, "o vídeo deve retomar ao voltar à tela");
  resultados.push({ midia, movimento: estados });
  await paginaTempo.close();

  const contextoReduzido = await navegador.newContext({
    viewport: { width: 1366, height: 900 },
    reducedMotion: "reduce",
  });
  const paginaReduzida = await contextoReduzido.newPage();
  await paginaReduzida.goto(url, { waitUntil: "networkidle" });
  const movimentoReduzido = await paginaReduzida.evaluate(() => {
    const video = document.querySelector(".hero-card__cena .cena-viva__video");
    return { src: video.getAttribute("src"), currentSrc: video.currentSrc, display: getComputedStyle(video).display };
  });
  assert.deepEqual(movimentoReduzido, { src: null, currentSrc: "", display: "none" });
  resultados.push({ movimentoReduzido });
  await contextoReduzido.close();

  if (evidencia) await writeFile(join(evidencia, "resultado.json"), JSON.stringify(resultados, null, 2));
  console.log(JSON.stringify(resultados, null, 2));
} finally {
  await navegador.close();
}
