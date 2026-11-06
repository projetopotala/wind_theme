import assert from "node:assert/strict";
import test from "node:test";
import { adaptadorLiveKit, criarPortaDeVideo, mensagemDeMidia } from "../../outputs/js/sala/video-sala.js";
import { criarChat, horaDaMensagem } from "../../outputs/js/sala/chat-sala.js";

// DOM mínimo com busca recursiva e eventos de documento.
function no(tag) {
  return { tag, children: [], className: "", _text: "", listeners: {}, attrs: {},
    set textContent(v) { this._text = String(v); this.children = []; }, get textContent() { return this._text; },
    append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; },
    remove() { this.removed = true; }, setAttribute(k, v) { this.attrs[k] = v; this[k] = v; },
    addEventListener(n, f) { this.listeners[n] = f; }, focus() {} };
}
function criarDoc() {
  const ouvintes = {};
  return { createElement: no, fullscreenElement: null, ouvintes,
    addEventListener(n, f) { ouvintes[n] = f; }, removeEventListener(n) { delete ouvintes[n]; },
    async exitFullscreen() { this.fullscreenElement = null; ouvintes.fullscreenchange?.(); } };
}
const achar = (raiz, teste) => {
  for (const c of raiz.children ?? []) { if (teste(c)) return c; const r = achar(c, teste); if (r) return r; }
  return null;
};
const porClasse = (raiz, classe) => achar(raiz, (c) => String(c.className).split(" ").includes(classe));
const aguardar = () => new Promise((r) => setImmediate(r));

function sdkComSala() {
  const eventos = {}, estado = { audio: 0, startAudio: 0 };
  const local = { isMicrophoneEnabled: false, isCameraEnabled: false, isSpeaking: false,
    setMicrophoneEnabled: async (v) => { local.isMicrophoneEnabled = v; emitir("TrackMuted"); },
    setCameraEnabled: async (v) => { local.isCameraEnabled = v; emitir("TrackMuted"); } };
  class Room {
    constructor() { this.remoteParticipants = new Map(); this.localParticipant = local; this.canPlaybackAudio = true; }
    on(ev, fn) { (eventos[ev] ??= []).push(fn); return this; }
    async connect() {}
    async startAudio() { estado.startAudio++; this.canPlaybackAudio = true; }
    disconnect() {}
  }
  const nomes = ["TrackSubscribed", "TrackUnsubscribed", "LocalTrackPublished", "LocalTrackUnpublished", "Reconnecting", "Reconnected",
    "Disconnected", "ParticipantConnected", "ParticipantDisconnected", "TrackMuted", "TrackUnmuted", "ActiveSpeakersChanged", "AudioPlaybackStatusChanged"];
  const RoomEvent = Object.fromEntries(nomes.map((n) => [n, n]));
  function emitir(ev, ...a) { (eventos[ev] ?? []).forEach((fn) => fn(...a)); }
  const salas = [];
  const sdk = { RoomEvent, Room: class extends Room { constructor(o) { super(o); salas.push(this); } } };
  return { sdk, local, emitir, estado, get sala() { return salas[0]; } };
}

async function montar(papel = "professional", docExtra = {}) {
  const f = sdkComSala(); const doc = Object.assign(criarDoc(), docExtra);
  const container = Object.assign(no("div"), { className: "sala-video" });
  const porta = criarPortaDeVideo(adaptadorLiveKit({ documento: doc, sdk: f.sdk }));
  porta.entrar(container, { url: "wss://x.livekit.cloud", token: "t", papel }, {});
  await aguardar();
  return { f, doc, container, porta, grade: container.children[0] };
}

test("microfone: o indicador segue o estado REAL da sala (próprio e do outro participante)", async () => {
  const { f, grade } = await montar("professional");
  const botaoMic = porClasse(grade, "sala-video-controles").children[0];
  const seloLocal = porClasse(porClasse(grade, "sala-video-local"), "sala-video-selo");
  assert.match(botaoMic["aria-label"], /Microfone ligado/);
  assert.equal(seloLocal.hidden, true);
  // O navegador/SDK muda o estado sem passar pelo botão (ex.: queda de permissão): a tela acompanha.
  f.local.isMicrophoneEnabled = false; f.emitir("TrackMuted");
  assert.match(botaoMic["aria-label"], /Microfone desligado/);
  assert.equal(botaoMic["data-ativo"], "false");
  assert.equal(seloLocal.hidden, false);
  assert.match(porClasse(seloLocal, "sala-video-selo-texto").textContent, /Seu microfone está desligado/);
  f.local.isMicrophoneEnabled = true; f.emitir("TrackUnmuted");
  assert.match(botaoMic["aria-label"], /Microfone ligado/);
  assert.equal(seloLocal.hidden, true);
  // Outro participante entra com o microfone desligado.
  const seloRemoto = porClasse(porClasse(grade, "sala-video-remoto"), "sala-video-selo");
  const outro = { isMicrophoneEnabled: false, isCameraEnabled: true, isSpeaking: false };
  f.sala.remoteParticipants.set("cli", outro); f.emitir("ParticipantConnected", outro);
  assert.equal(seloRemoto.hidden, false);
  assert.match(porClasse(seloRemoto, "sala-video-selo-texto").textContent, /Microfone de cliente desligado/);
  outro.isMicrophoneEnabled = true; f.emitir("TrackUnmuted");
  assert.equal(seloRemoto.hidden, true);
  // Quem fala recebe o aro.
  outro.isSpeaking = true; f.emitir("ActiveSpeakersChanged");
  assert.equal(porClasse(grade, "sala-video-remoto").attrs["data-falando"], "true");
});

test("câmera: botão, aviso 'Câmera desligada' e estado vêm da sala; sem outro participante aparece a espera", async () => {
  const { f, grade } = await montar("client");
  const botaoCam = porClasse(grade, "sala-video-controles").children[1];
  const semVideoLocal = porClasse(porClasse(grade, "sala-video-local"), "sala-video-semvideo");
  const espera = porClasse(grade, "sala-video-espera");
  assert.match(botaoCam["aria-label"], /Câmera ligada/);
  assert.equal(semVideoLocal.hidden, true);
  assert.equal(espera.hidden, false);
  assert.equal(espera.textContent, "Aguardando o outro participante");
  f.local.isCameraEnabled = false; f.emitir("TrackMuted");
  assert.match(botaoCam["aria-label"], /Câmera desligada/);
  assert.equal(semVideoLocal.hidden, false);
  assert.match(porClasse(grade, "sala-video-nome").textContent, /Profissional/, "o outro lado de um cliente é o profissional");
  const outro = { isMicrophoneEnabled: true, isCameraEnabled: false };
  f.sala.remoteParticipants.set("p", outro); f.emitir("ParticipantConnected");
  assert.equal(espera.hidden, true);
  assert.equal(porClasse(porClasse(grade, "sala-video-remoto"), "sala-video-semvideo").hidden, false);
  f.emitir("Reconnecting");
  assert.equal(espera.textContent, "Reconectando…");
  f.emitir("Reconnected");
  assert.equal(espera.hidden, true);
  f.sala.remoteParticipants.clear(); f.emitir("ParticipantDisconnected");
  assert.equal(espera.textContent, "Aguardando o outro participante");
});

test("áudio bloqueado pelo navegador: aparece 'Ativar áudio', que libera a reprodução", async () => {
  const { f, grade } = await montar();
  const botao = porClasse(grade, "sala-video-audio");
  assert.equal(botao.hidden, true);
  f.sala.canPlaybackAudio = false; f.emitir("AudioPlaybackStatusChanged");
  assert.equal(botao.hidden, false);
  assert.equal(botao.textContent, "Ativar áudio");
  const antes = f.estado.startAudio;
  await botao.listeners.click();
  assert.equal(f.estado.startAudio, antes + 1);
  assert.equal(botao.hidden, true);
});

test("áudio remoto: elemento que o navegador recusa tocar também mostra 'Ativar áudio'", async () => {
  const { f, grade } = await montar();
  const elemento = Object.assign(no("audio"), { srcObject: null, play: () => Promise.reject(new Error("NotAllowedError")) });
  f.emitir("TrackSubscribed", { kind: "audio", attach: () => elemento, detach: () => [] });
  await aguardar();
  assert.ok(porClasse(grade, "sala-video-remoto").children.includes(elemento));
  assert.equal(porClasse(grade, "sala-video-audio").hidden, false);
});

test("tela cheia: sem API nativa expande na página, alterna o texto e Esc volta; sair() limpa", async () => {
  const { doc, container, porta, grade } = await montar();
  const botao = porClasse(grade, "sala-video-controles").children[2];
  assert.match(botao["aria-label"], /Expandir/);
  await botao.listeners.click();
  assert.match(container.className, /sala-video--cheia/);
  assert.equal(container.attrs["data-tela"], "pagina");
  assert.match(botao["aria-label"], /Sair da tela cheia/);
  doc.ouvintes.keydown({ key: "Escape" });
  assert.equal(container.className, "sala-video");
  assert.match(botao["aria-label"], /Expandir/);
  await botao.listeners.click(); await botao.listeners.click();
  assert.equal(container.className, "sala-video");
  await botao.listeners.click();
  porta.sair();
  assert.equal(container.className, "sala-video");
  assert.equal(doc.ouvintes.keydown, undefined, "ouvintes do documento removidos ao sair");
});

test("tela cheia: com API nativa usa o contêiner do vídeo e acompanha a saída pelo Esc do navegador", async () => {
  const f = sdkComSala(); const doc = criarDoc();
  const container = Object.assign(no("div"), { className: "sala-video" });
  container.requestFullscreen = async () => { doc.fullscreenElement = container; doc.ouvintes.fullscreenchange?.(); };
  criarPortaDeVideo(adaptadorLiveKit({ documento: doc, sdk: f.sdk })).entrar(container, { url: "wss://x.livekit.cloud", token: "t" }, {});
  await aguardar();
  const botao = porClasse(container.children[0], "sala-video-controles").children[2];
  await botao.listeners.click();
  assert.equal(container.attrs["data-tela"], "nativa");
  assert.match(container.className, /sala-video--cheia/);
  // Esc: o navegador sai sozinho e avisa pelo evento.
  doc.fullscreenElement = null; doc.ouvintes.fullscreenchange();
  assert.equal(container.className, "sala-video");
  assert.match(botao["aria-label"], /Expandir/);
  // Recusa da API nativa cai para a expansão na página.
  container.requestFullscreen = async () => { throw new Error("recusado"); };
  await botao.listeners.click();
  assert.equal(container.attrs["data-tela"], "pagina");
});

test("erros de mídia: cada causa tem sua frase", () => {
  assert.match(mensagemDeMidia({ name: "NotAllowedError" }, "o microfone"), /permissão do navegador/);
  assert.match(mensagemDeMidia({ name: "NotFoundError" }, "a câmera"), /Nenhum aparelho/);
  assert.match(mensagemDeMidia({ name: "NotReadableError" }, "a câmera"), /outro programa ou navegador/);
  assert.match(mensagemDeMidia(new Error("x"), "a câmera"), /permissão do navegador/);
});

/* ---------------- chat ---------------- */

function montarChat(opcoes = {}) {
  const doc = criarDoc();
  const lista = no("ol"), form = no("form"), campo = Object.assign(no("textarea"), { value: "" }), aviso = no("p");
  const vazio = no("p"), botao = Object.assign(no("button"), { disabled: false, rotulo: no("span") });
  const enviados = [];
  const chat = criarChat({ lista, formulario: form, campo, aviso, vazio, botao, documento: doc, agendar: () => 0, cancelar: () => {},
    listar: opcoes.listar ?? (async () => []), enviar: opcoes.enviar ?? (async (t) => { enviados.push(t); }) });
  return { lista, form, campo, aviso, vazio, botao, chat, enviados };
}

test("chat: estado vazio, minhas mensagens à direita, recebidas à esquerda, hora e nome do remetente", async () => {
  const c = montarChat({ listar: async () => [
    { id: 1, mine: false, role: "client", body: "Olá", created_at: "2026-11-03T15:30:00Z" },
    { id: 2, mine: true, role: "professional", body: "<b>oi</b>", created_at: "2026-11-03T15:31:00Z" },
    { id: 3, mine: false, role: "client", body: "sem hora", created_at: "lixo" }] });
  assert.equal(c.vazio.hidden, false, "antes de qualquer mensagem: 'Nenhuma mensagem ainda'");
  await c.chat.iniciar();
  assert.equal(c.vazio.hidden, true);
  const [a, b, d] = c.lista.children;
  assert.equal(a.className, "sala-msg sala-msg--outra");
  assert.equal(b.className, "sala-msg sala-msg--minha");
  assert.equal(a.children[0].textContent, "Cliente");
  assert.equal(b.children[0].textContent, "Você");
  assert.equal(b.children[1].textContent, "<b>oi</b>", "texto nunca vira marcação");
  assert.equal(a.children[2].tag, "time");
  assert.match(a.children[2].textContent, /^\d{2}:\d{2}$/);
  assert.equal(d.children.length, 2, "data inválida: sem hora");
  assert.equal(horaDaMensagem(undefined), null);
});

test("chat: Enter envia, Shift+Enter não envia, envio mostra 'Enviando…' e limpa o campo", async () => {
  let liberar; const c = montarChat({ enviar: () => new Promise((r) => { liberar = r; }) });
  c.campo.value = "oi";
  let impedido = 0;
  c.campo.listeners.keydown({ key: "Enter", shiftKey: true, preventDefault() { impedido++; } });
  assert.equal(impedido, 0, "Shift+Enter quebra linha");
  assert.equal(c.botao.disabled, false);
  c.campo.listeners.keydown({ key: "Enter", shiftKey: false, preventDefault() { impedido++; } });
  assert.equal(impedido, 1);
  assert.equal(c.botao.disabled, true);
  assert.equal(c.botao.rotulo.textContent, "Enviando…");
  assert.equal(c.botao["aria-busy"], "true");
  c.campo.listeners.keydown({ key: "Enter", shiftKey: false, preventDefault() {} }); // segundo Enter durante o envio é ignorado
  liberar(); await aguardar(); await aguardar();
  assert.equal(c.campo.value, "");
  assert.equal(c.botao.disabled, false);
  assert.equal(c.botao.rotulo.textContent, "Enviar");
});

test("chat: falha ao enviar avisa, mantém o texto digitado e permite tentar de novo", async () => {
  const c = montarChat({ enviar: async () => { throw Object.assign(new Error("network"), { code: "network", status: 0 }); } });
  c.campo.value = "importante";
  await c.form.listeners.submit({ preventDefault() {} });
  assert.match(c.aviso.textContent, /^Não enviada\./);
  assert.equal(c.campo.value, "importante");
  assert.equal(c.botao.disabled, false);
  c.campo.value = "   ";
  await c.form.listeners.submit({ preventDefault() {} });
  assert.match(c.aviso.textContent, /Escreva uma mensagem/);
});
