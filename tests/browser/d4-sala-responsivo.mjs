// Fluxo e responsividade da página da sala com SDK de vídeo FALSO (layout e lógica, não mídia real).
// Uso (fora do repo, numa pasta com playwright-core e o Edge/Chrome instalado):
//   node d4-sala-responsivo.mjs <caminho-de-outputs> <caminho-do-navegador> [pasta-de-capturas]
// Não entra em npm run test:portal.
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [OUTPUTS, NAVEGADOR, CAPTURAS] = process.argv.slice(2);
const SERVIDOR = path.join(path.dirname(fileURLToPath(import.meta.url)), "d4-sala-servidor-de-teste.mjs");
const ID = "10000000-0000-4000-8000-000000000001";
const BASE = "http://127.0.0.1:4173/sala-atendimento.html";
const srv = spawn(process.execPath, [SERVIDOR, OUTPUTS], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

const R = [];
const t = (id, d, ok, det = "") => { R.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${d}${ok ? "" : " :: " + det}`); };
const browser = await chromium.launch({ executablePath: NAVEGADOR, headless: true });
const pausa = (p, ms = 400) => p.waitForTimeout(ms);
const abrir = async (cenario, w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(`${BASE}?pedido=${ID}&cenario=${cenario}`, { waitUntil: "load" });
  await p.waitForSelector("[data-sala-entrar]:not([hidden]), [data-sala-titulo]");
  return { ctx, p, erros };
};

const TAMANHOS = [[320, 640], [375, 667], [390, 844], [768, 1024], [1366, 768], [1920, 1080]];
for (const [w, h] of TAMANHOS) {
  const { ctx, p, erros } = await abrir("open", w, h);
  await p.click("[data-sala-entrar]"); await p.waitForSelector("[data-sala-palco]:not([hidden])"); await pausa(p, 600);
  const m = await p.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const botoes = [...document.querySelectorAll(".sala-video-botao, [data-sala-sair], [data-sala-encerrar]:not([hidden]), [data-sala-form] button")].map((b) => b.getBoundingClientRect());
    return { sw: document.documentElement.scrollWidth, iw: innerWidth, video: r("[data-sala-video]"), remoto: r(".sala-video-remoto video"), local: r(".sala-video-local video"),
      controles: r(".sala-video-controles"), chat: r(".sala-chat"), alturas: botoes.map((b) => Math.round(b.height)), larguraBotoes: botoes.map((b) => b.right <= innerWidth + 0.5 && b.left >= -0.5),
      rotulos: [...document.querySelectorAll(".sala-video-botao")].map((b) => b.textContent) };
  });
  t(`R${w}a`, `${w}px: sem rolagem horizontal`, m.sw <= m.iw, JSON.stringify(m));
  t(`R${w}b`, `${w}px: vídeo remoto, miniatura local e controles visíveis dentro da tela`, m.remoto?.width > 50 && m.local?.width > 20 && m.controles && m.controles.right <= m.iw + 0.5 && m.video.right <= m.iw + 0.5, JSON.stringify(m));
  t(`R${w}c`, `${w}px: botões com alvo >= 44 px e dentro da tela`, m.alturas.every((a) => a >= 44) && m.larguraBotoes.every(Boolean), JSON.stringify(m.alturas));
  t(`R${w}d`, `${w}px: chat presente e rótulos de câmera/microfone em português`, m.chat?.width > 0 && m.rotulos.length === 2 && m.rotulos.every((x) => /(Ligar|Desligar)/.test(x)), JSON.stringify(m.rotulos));
  t(`R${w}e`, `${w}px: sem erro de script`, erros.length === 0, erros.join(";"));
  if (CAPTURAS && [320, 768, 1366].includes(w)) await p.screenshot({ path: path.join(CAPTURAS, `sala-lk-${w}.png`) });
  await ctx.close();
}

{ // estado inicial: só aparece o que deve (atributo hidden respeitado pelos botões)
  const { ctx, p } = await abrir("open", 390, 844);
  t("F0", "ao abrir: 'Entrar na sala' visível; 'Tentar de novo', 'Encerrar' e o palco ocultos", await p.isVisible("[data-sala-entrar]") && !(await p.isVisible("[data-sala-tentar]")) && !(await p.isVisible("[data-sala-encerrar]")) && !(await p.isVisible("[data-sala-palco]")));
  await ctx.close();
}
// Fluxos (390x844).
{ // microfone / câmera
  const { ctx, p } = await abrir("open", 390, 844);
  await p.click("[data-sala-entrar]"); await p.waitForSelector("[data-sala-palco]:not([hidden])"); await pausa(p);
  const antes = await p.textContent(".sala-video-botao");
  await p.click(".sala-video-botao"); await pausa(p, 200);
  t("F1", "alternar microfone muda o rótulo", antes !== (await p.textContent(".sala-video-botao")), antes);
  t("F2", "conectou com wss do LiveKit e token curto vindo da função", await p.evaluate(() => window.__lk.conectou?.url === "wss://teste.livekit.cloud" && window.__lk.conectou.token === "tok-falso"));
  await p.click("[data-sala-sair]"); await pausa(p, 200);
  t("F3", "sair desconecta do LiveKit e mostra a tela de saída", await p.evaluate(() => window.__lk.desconectou === 1) && /saiu/i.test(await p.textContent("[data-sala-titulo]")));
  await ctx.close();
}
{ // queda de rede: pede token novo
  const { ctx, p } = await abrir("open", 390, 844);
  await p.click("[data-sala-entrar]"); await p.waitForSelector("[data-sala-palco]:not([hidden])"); await pausa(p);
  await p.evaluate(() => window.__lk.emite("dc", 3)); await pausa(p, 2500);
  const emissoes = await p.evaluate(() => window.__sala.chamadas.filter((c) => String(c.url || "").includes("issue-appointment-room-token")).length);
  t("F4", "desconexão de rede pede um token NOVO e reconecta", emissoes === 2 && await p.evaluate(() => window.__lk.conectou.token === "tok-falso"), String(emissoes));
  await ctx.close();
}
{ // identidade duplicada
  const { ctx, p } = await abrir("open", 390, 844);
  await p.click("[data-sala-entrar]"); await p.waitForSelector("[data-sala-palco]:not([hidden])"); await pausa(p);
  await p.evaluate(() => window.__lk.emite("dc", 2)); await pausa(p, 300);
  const emissoes = await p.evaluate(() => window.__sala.chamadas.filter((c) => String(c.url || "").includes("issue-appointment-room-token")).length);
  t("F5", "entrar em outro dispositivo sai sem pedir token", emissoes === 1 && /saiu/i.test(await p.textContent("[data-sala-titulo]")));
  await ctx.close();
}
{ // profissional encerra
  const { ctx, p } = await abrir("pro", 390, 844);
  await p.click("[data-sala-entrar]"); await p.waitForSelector("[data-sala-palco]:not([hidden])"); await pausa(p);
  t("F6", "profissional vê 'Encerrar para todos'", await p.isVisible("[data-sala-encerrar]"));
  await p.click("[data-sala-encerrar]"); await pausa(p, 400);
  const fechou = await p.evaluate(() => window.__sala.chamadas.some((c) => String(c.url || "").includes("close-appointment-room")));
  t("F7", "encerrar chama a função de borda e desconecta o vídeo", fechou && await p.evaluate(() => window.__lk.desconectou >= 1) && /encerrado/i.test(await p.textContent("[data-sala-titulo]")));
  await ctx.close();
}
{ // cliente não encerra; falha de emissão não monta vídeo
  const { ctx, p } = await abrir("open", 390, 844);
  await p.click("[data-sala-entrar]"); await p.waitForSelector("[data-sala-palco]:not([hidden])");
  t("F8", "cliente não vê 'Encerrar para todos'", !(await p.isVisible("[data-sala-encerrar]")));
  await ctx.close();
  const f = await abrir("tokenfail", 390, 844);
  await f.p.click("[data-sala-entrar]"); await pausa(f.p, 400);
  t("F9", "acesso negado na emissão não conecta o vídeo", await f.p.evaluate(() => !window.__lk));
  await f.ctx.close();
}

await browser.close(); srv.kill();
console.log(`\nTOTAL ${R.length} | PASS ${R.filter(Boolean).length} | FAIL ${R.filter((x) => !x).length}`);
