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
    for (const largura of [390, 1366]) {
      const paginaAntes = await navegador.newPage({ viewport: { width: largura, height: largura === 390 ? 844 : 900 } });
      await paginaAntes.goto(urlAntes, { waitUntil: "networkidle" });
      await paginaAntes.waitForTimeout(1500);
      await paginaAntes.locator(".hero").screenshot({ path: join(evidencia, `antes-${largura}.png`) });
      await paginaAntes.close();
    }
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
    await pagina.waitForTimeout(1500);
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
    const larguraMinima = largura === 390 ? 350 : largura === 1366 ? 750 : 900;
    assert.ok(medidas.cena?.width >= larguraMinima, `cena pequena em ${largura}px`);
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
  const estados = [];
  for (const segundos of [0, 5, 10]) {
    if (segundos) await paginaTempo.waitForTimeout(5000);
    estados.push(await paginaTempo.evaluate((tempo) => {
      const estilo = (seletor) => getComputedStyle(document.querySelector(seletor));
      return {
        segundos: tempo,
        bambu: estilo(".hero-card__cena .cena-viva__bambu").transform,
        ramos: estilo(".hero-card__cena .cena-viva__ramos").transform,
        chama: estilo(".hero-card__cena .cena-viva__chama").opacity,
        halo: estilo(".hero-card__cena .cena-viva__halo").opacity,
      };
    }, segundos));
    if (evidencia) await cenaTempo.screenshot({ path: join(evidencia, `movimento-${segundos}s.png`) });
  }
  assert.ok(new Set(estados.map((item) => item.bambu)).size > 1, "o bambu não se moveu");
  assert.ok(new Set(estados.map((item) => item.ramos)).size > 1, "os ramos não se moveram");
  assert.ok(new Set(estados.map((item) => item.chama)).size > 1, "a chama não tremulou");
  assert.ok(new Set(estados.map((item) => item.halo)).size > 1, "a luz da vela não variou");
  resultados.push({ movimento: estados });
  await paginaTempo.close();

  const contextoReduzido = await navegador.newContext({
    viewport: { width: 1366, height: 900 },
    reducedMotion: "reduce",
  });
  const paginaReduzida = await contextoReduzido.newPage();
  await paginaReduzida.goto(url, { waitUntil: "networkidle" });
  const animacoes = await paginaReduzida.evaluate(() => [
    ".cena-viva__bambu",
    ".cena-viva__ramos",
    ".cena-viva__chama",
  ].map((seletor) => getComputedStyle(document.querySelector(`.hero-card__cena ${seletor}`)).animationName));
  assert.deepEqual(animacoes, ["none", "none", "none"]);
  resultados.push({ movimentoReduzido: animacoes });
  await contextoReduzido.close();

  if (evidencia) await writeFile(join(evidencia, "resultado.json"), JSON.stringify(resultados, null, 2));
  console.log(JSON.stringify(resultados, null, 2));
} finally {
  await navegador.close();
}
