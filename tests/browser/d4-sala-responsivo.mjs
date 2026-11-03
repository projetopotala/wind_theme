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
      rotulos: [...document.querySelectorAll(".sala-video-botao")].map((b) => b.getAttribute("aria-label")) };
  });
  t(`R${w}a`, `${w}px: sem rolagem horizontal`, m.sw <= m.iw, JSON.stringify(m));
  t(`R${w}b`, `${w}px: vídeo remoto, miniatura local e controles visíveis dentro da tela`, m.remoto?.width > 50 && m.local?.width > 20 && m.controles && m.controles.right <= m.iw + 0.5 && m.video.right <= m.iw + 0.5, JSON.stringify(m));
  t(`R${w}c`, `${w}px: botões com alvo >= 44 px e dentro da tela`, m.alturas.every((a) => a >= 44) && m.larguraBotoes.every(Boolean), JSON.stringify(m.alturas));
  t(`R${w}d`, `${w}px: chat presente e rótulos de câmera/microfone em português`, m.chat?.width > 0 && m.rotulos.length === 3 && /Microfone ligado/.test(m.rotulos[0]) && /Câmera ligada/.test(m.rotulos[1]) && /Expandir/.test(m.rotulos[2]), JSON.stringify(m.rotulos));
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
  const antes = await p.getAttribute(".sala-video-botao", "aria-label");
  await p.click(".sala-video-botao"); await pausa(p, 200);
  const depois = await p.getAttribute(".sala-video-botao", "aria-label");
  t("F1", "alternar microfone muda o rótulo e mostra o selo 'microfone desligado' no próprio vídeo", antes !== depois && /desligado/.test(depois)
    && await p.isVisible(".sala-video-local .sala-video-selo"), `${antes} -> ${depois}`);
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
  await p.click("[data-sala-encerrar]"); await pausa(p, 200);
  const nada = await p.evaluate(() => !window.__sala.chamadas.some((c) => String(c.url || "").includes("close-appointment-room")));
  t("F6b", "'Encerrar para todos' só pede confirmação; nada é encerrado antes do 'Sim'", nada && await p.isVisible("[data-sala-confirmar]"));
  await p.click("[data-sala-confirmar-nao]"); await pausa(p, 100);
  t("F6c", "'Cancelar' fecha a confirmação sem encerrar", !(await p.isVisible("[data-sala-confirmar]")) && !(await p.evaluate(() => window.__sala.chamadas.some((c) => String(c.url || "").includes("close-appointment-room")))));
  await p.click("[data-sala-encerrar]"); await p.click("[data-sala-confirmar-sim]"); await pausa(p, 400);
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

for (const [w, h] of [[390, 844], [1366, 768]]) { // tela cheia (API nativa) em celular e desktop
  const { ctx, p } = await abrir("open", w, h);
  await p.click("[data-sala-entrar]"); await p.waitForSelector("[data-sala-palco]:not([hidden])"); await pausa(p);
  const botao = ".sala-video-controles .sala-video-botao:nth-child(3)";
  await p.click(botao); await pausa(p, 300);
  const cheia = await p.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    return { nativa: document.fullscreenElement === document.querySelector("[data-sala-video]"), modo: document.querySelector("[data-sala-video]").dataset.tela,
      video: r("[data-sala-video]"), local: r(".sala-video-local"), controles: r(".sala-video-controles"), iw: innerWidth, ih: innerHeight, rotulo: document.querySelector(".sala-video-controles .sala-video-botao:nth-child(3)").getAttribute("aria-label") };
  });
  t(`T${w}a`, `${w}px: botão expande o vídeo para a tela inteira (nativa ou na página) e muda o rótulo`, (cheia.nativa || cheia.modo === "pagina") && cheia.video.width >= cheia.iw - 1 && cheia.video.height >= cheia.ih - 1 && /Sair da tela cheia/.test(cheia.rotulo), JSON.stringify(cheia));
  t(`T${w}b`, `${w}px: tela cheia mantém miniatura própria e controles visíveis e acessíveis`, cheia.local.width > 40 && cheia.local.right <= cheia.iw + 1 && cheia.controles.bottom <= cheia.ih + 1 && cheia.controles.height >= 44, JSON.stringify(cheia));
  await p.click(botao); await pausa(p, 300);
  t(`T${w}c`, `${w}px: botão 'Sair da tela cheia' volta ao layout normal`, await p.evaluate(() => !document.fullscreenElement && !document.querySelector("[data-sala-video]").className.includes("--cheia")));
  await ctx.close();
}
{ // aparelho sem API nativa (ex.: iPhone): expansão na página e Esc volta
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { Element.prototype.requestFullscreen = undefined; Element.prototype.webkitRequestFullscreen = undefined; });
  const p = await ctx.newPage();
  await p.goto(`${BASE}?pedido=${ID}&cenario=open`, { waitUntil: "load" });
  await p.click("[data-sala-entrar]"); await p.waitForSelector("[data-sala-palco]:not([hidden])"); await pausa(p);
  await p.click(".sala-video-controles .sala-video-botao:nth-child(3)"); await pausa(p, 200);
  const dentro = await p.evaluate(() => { const v = document.querySelector("[data-sala-video]").getBoundingClientRect(); return v.width >= innerWidth - 1 && v.height >= innerHeight - 1 && document.querySelector("[data-sala-video]").dataset.tela === "pagina"; });
  await p.keyboard.press("Escape"); await pausa(p, 200);
  t("T0", "sem API nativa: expande dentro da página e Esc volta ao normal", dentro && await p.evaluate(() => document.querySelector("[data-sala-video]").dataset.tela === "normal"));
  await ctx.close();
}
{ // estado do outro participante: selo quando o microfone dele está desligado
  const { ctx, p } = await abrir("open", 390, 844);
  await p.click("[data-sala-entrar]"); await p.waitForSelector("[data-sala-palco]:not([hidden])"); await pausa(p);
  await p.evaluate(() => { window.__lk.sala.remoteParticipants.get("r").isMicrophoneEnabled = false; window.__lk.emite("tm"); }); await pausa(p, 100);
  const texto = await p.textContent(".sala-video-remoto .sala-video-selo");
  t("M1", "microfone do outro participante desligado aparece sobre o vídeo dele", await p.isVisible(".sala-video-remoto .sala-video-selo") && /Microfone de .* desligado/.test(texto), texto);
  await p.evaluate(() => { window.__lk.sala.canPlaybackAudio = false; window.__lk.emite("ap"); }); await pausa(p, 100);
  t("A1", "áudio bloqueado mostra 'Ativar áudio' e o clique chama startAudio", await p.isVisible(".sala-video-audio"));
  await p.click(".sala-video-audio"); await pausa(p, 100);
  t("A2", "depois de ativar, o botão some", await p.evaluate(() => window.__lk.startAudio >= 1) && !(await p.isVisible(".sala-video-audio")));
  await ctx.close();
}
{ // chat: Enter envia, Shift+Enter quebra linha, balões e estado vazio
  const { ctx, p } = await abrir("chat", 390, 844);
  await p.click("[data-sala-entrar]"); await p.waitForSelector("[data-sala-palco]:not([hidden])"); await pausa(p, 600);
  await p.fill("[data-sala-campo]", "primeira"); await p.keyboard.press("Shift+Enter"); await p.keyboard.type("segunda"); await pausa(p, 100);
  const antesEnviar = await p.evaluate(() => document.querySelectorAll(".sala-msg--minha").length);
  await p.keyboard.press("Enter"); await pausa(p, 700);
  const m = await p.evaluate(() => { const minha = document.querySelector(".sala-msg--minha"), outra = document.querySelector(".sala-msg--outra"); const lr = (e) => e.getBoundingClientRect();
    return { minhas: document.querySelectorAll(".sala-msg--minha").length, texto: minha?.querySelector("p")?.textContent, campo: document.querySelector("[data-sala-campo]").value,
      alinhaDireita: minha && lr(minha).right > innerWidth / 2 + 20 && lr(minha).left > lr(outra).left, xss: window.__xss === 1, vazioVisivel: !document.querySelector("[data-sala-vazio]").hidden }; });
  t("C1", "Shift+Enter quebra linha (nada enviado) e Enter envia; campo limpo", antesEnviar === 0 && m.minhas === 1 && m.texto === "primeira\nsegunda" && m.campo === "", JSON.stringify(m));
  t("C2", "minha mensagem à direita, recebida à esquerda, sem XSS, estado vazio oculto", m.alinhaDireita && !m.xss && !m.vazioVisivel, JSON.stringify(m));
  await ctx.close();
}

await browser.close(); srv.kill();
console.log(`\nTOTAL ${R.length} | PASS ${R.filter(Boolean).length} | FAIL ${R.filter((x) => !x).length}`);
