/*
 * VÍDEO DA SALA: porta independente de provedor + adaptador LiveKit.
 *
 * O resto da sala só conhece `entrar(container, { url, token }, ganchos)`. O SDK oficial
 * (livekit-client, servido de /vendor/livekit-client.umd.js) fica só neste arquivo.
 * Nenhuma chave existe aqui: o token chega pronto da função de borda, vale poucos
 * segundos para ENTRAR e é restrito a esta sala.
 *
 * Os indicadores de microfone e câmera NÃO vêm de variáveis locais: a cada evento do
 * LiveKit (mudo/desmudo, publicação, assinatura, reconexão) o estado é relido da sala.
 */

const HOST_LIVEKIT = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.livekit\.cloud$/i;

export function urlDeSalaValida(url) {
  try {
    const u = new URL(url);
    return u.protocol === "wss:" && HOST_LIVEKIT.test(u.hostname) && (u.pathname === "/" || u.pathname === "")
      && !u.search && !u.hash && !u.username && !u.password && !u.port;
  } catch { return false; }
}

// Motivo de desconexão do SDK -> o que a sessão precisa decidir.
export function motivoDaDesconexao(razao, enumeracao = {}) {
  const e = { CLIENT_INITIATED: 1, DUPLICATE_IDENTITY: 2, PARTICIPANT_REMOVED: 4, ROOM_DELETED: 5, ...enumeracao };
  if (razao === e.CLIENT_INITIATED) return "saiu";
  if (razao === e.DUPLICATE_IDENTITY) return "duplicada";
  if (razao === e.PARTICIPANT_REMOVED || razao === e.ROOM_DELETED) return "removida";
  return "rede";
}

// Erro do navegador -> frase clara. Nunca esconde a causa real (permissão, aparelho ausente, aparelho ocupado).
export function mensagemDeMidia(erro, rotulo) {
  const nome = String(erro?.name ?? "");
  if (nome === "NotAllowedError" || nome === "PermissionDeniedError" || nome === "SecurityError") {
    return `Não foi possível usar ${rotulo}. Verifique a permissão do navegador.`;
  }
  if (nome === "NotFoundError" || nome === "OverconstrainedError" || nome === "DevicesNotFoundError") {
    return `Nenhum aparelho encontrado para ${rotulo}. Conecte um e tente de novo.`;
  }
  if (nome === "NotReadableError" || nome === "TrackStartError" || nome === "AbortError") {
    return `Não foi possível usar ${rotulo}: outro programa ou navegador está usando o aparelho.`;
  }
  return `Não foi possível usar ${rotulo}. Verifique a permissão do navegador.`;
}

const criar = (documento, tag, classe, texto) => {
  const e = documento.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
};

// Botão da barra: ícone (desenhado em CSS) + rótulo visível + nome acessível com o estado real.
function criarBotao(documento, aoClicar) {
  const b = criar(documento, "button", "mp-botao mp-botao--secundario sala-video-botao");
  b.type = "button";
  const icone = criar(documento, "span", "sala-icone");
  icone.setAttribute("aria-hidden", "true");
  const rotulo = criar(documento, "span", "sala-video-botao-rotulo");
  b.append(icone, rotulo);
  b.addEventListener("click", aoClicar);
  b.pintar = ({ icone: classe, texto, nome, ativo }) => {
    icone.className = `sala-icone sala-icone--${classe}`;
    rotulo.textContent = texto;
    b.setAttribute("aria-label", nome);
    b.setAttribute("data-ativo", String(Boolean(ativo)));
  };
  return b;
}

// Selo "microfone desligado" sobre um vídeo (texto acessível sempre presente).
function criarSelo(documento) {
  const selo = criar(documento, "p", "sala-video-selo");
  selo.setAttribute("role", "status");
  const icone = criar(documento, "span", "sala-icone sala-icone--mic-desligado");
  icone.setAttribute("aria-hidden", "true");
  const texto = criar(documento, "span", "sala-video-selo-texto");
  selo.append(icone, texto);
  selo.hidden = true;
  selo.pintar = (visivel, frase) => { selo.hidden = !visivel; texto.textContent = visivel ? frase : ""; };
  return selo;
}

export function adaptadorLiveKit({ documento = globalThis.document, sdk = globalThis.LivekitClient } = {}) {
  return {
    nome: "livekit",
    montar(container, { url, token, papel } = {}, ganchos = {}) {
      if (!urlDeSalaValida(url) || typeof token !== "string" || !token || token.length > 4096) {
        throw new TypeError("Dados da sala de vídeo inválidos.");
      }
      if (!sdk?.Room) throw new TypeError("O módulo de vídeo não foi carregado.");

      const nomeLocal = papel === "professional" ? "Você (profissional)" : papel === "client" ? "Você (cliente)" : "Você";
      const nomeRemoto = papel === "professional" ? "Cliente" : papel === "client" ? "Profissional" : "Outro participante";
      const classeBase = container.className ?? "";

      const grade = criar(documento, "div", "sala-video-grade");
      const remoto = criar(documento, "div", "sala-video-remoto");
      remoto.setAttribute("data-falando", "false");
      const nomeDoRemoto = criar(documento, "p", "sala-video-nome", nomeRemoto);
      const seloMicRemoto = criarSelo(documento);
      const semVideoRemoto = criar(documento, "p", "sala-video-semvideo", "Câmera desligada");
      semVideoRemoto.hidden = true;
      const espera = criar(documento, "p", "sala-video-espera", "Conectando…");
      espera.setAttribute("role", "status");
      const local = criar(documento, "div", "sala-video-local");
      local.setAttribute("data-falando", "false");
      const nomeDoLocal = criar(documento, "p", "sala-video-nome sala-video-nome--local", nomeLocal);
      const seloMicLocal = criarSelo(documento);
      const semVideoLocal = criar(documento, "p", "sala-video-semvideo sala-video-semvideo--local", "Câmera desligada");
      semVideoLocal.hidden = true;
      const aviso = criar(documento, "p", "sala-video-aviso");
      aviso.setAttribute("role", "status");
      aviso.hidden = true;
      const bAudio = criar(documento, "button", "mp-botao sala-video-audio", "Ativar áudio");
      bAudio.type = "button";
      bAudio.hidden = true;
      const controles = criar(documento, "div", "sala-video-controles");
      controles.setAttribute("role", "group");
      controles.setAttribute("aria-label", "Controles da videochamada");
      remoto.append(nomeDoRemoto, semVideoRemoto, seloMicRemoto);
      local.append(nomeDoLocal, semVideoLocal, seloMicLocal);
      grade.append(remoto, espera, local, aviso, bAudio, controles);
      container.replaceChildren(grade);

      const room = new sdk.Room({ adaptiveStream: true, dynacast: true });
      let encerrado = false;
      let reconectando = false;
      let conectou = false;
      let audioRecusado = false;
      const ligado = { mic: false, cam: false }; // só para SDKs sem os getters de estado
      const ouvir = (evento, fn) => { if (evento !== undefined) room.on(evento, fn); };
      const E = sdk.RoomEvent ?? {};

      /* ---------- estado lido da sala (fonte da verdade) ---------- */
      const outros = () => [...(room.remoteParticipants?.values?.() ?? [])];
      const outro = () => outros()[0];
      const micLocal = () => (typeof room.localParticipant?.isMicrophoneEnabled === "boolean" ? room.localParticipant.isMicrophoneEnabled : ligado.mic);
      const camLocal = () => (typeof room.localParticipant?.isCameraEnabled === "boolean" ? room.localParticipant.isCameraEnabled : ligado.cam);

      const sincronizar = () => {
        if (encerrado) return;
        const o = outro();
        const micL = micLocal(), camL = camLocal();
        bMic.pintar({
          icone: micL ? "mic" : "mic-desligado", texto: micL ? "Microfone ligado" : "Microfone desligado",
          nome: micL ? "Microfone ligado. Clique para desligar." : "Microfone desligado. Clique para ligar.", ativo: micL,
        });
        bCam.pintar({
          icone: camL ? "cam" : "cam-desligada", texto: camL ? "Câmera ligada" : "Câmera desligada",
          nome: camL ? "Câmera ligada. Clique para desligar." : "Câmera desligada. Clique para ligar.", ativo: camL,
        });
        seloMicLocal.pintar(conectou && !micL, "Seu microfone está desligado");
        semVideoLocal.hidden = !conectou || camL;
        const micR = o ? o.isMicrophoneEnabled !== false : true;
        const camR = o ? o.isCameraEnabled !== false : true;
        seloMicRemoto.pintar(Boolean(o) && !micR, `Microfone de ${nomeRemoto.toLowerCase()} desligado`);
        semVideoRemoto.hidden = !o || camR;
        nomeDoRemoto.hidden = !o;
        remoto.setAttribute("data-falando", String(Boolean(o?.isSpeaking)));
        local.setAttribute("data-falando", String(Boolean(room.localParticipant?.isSpeaking) && micL));
        bAudio.hidden = room.canPlaybackAudio !== false && !audioRecusado;
        // Fase da tela: o quadro nunca fica preto sem explicação.
        if (reconectando) { espera.hidden = false; espera.textContent = "Reconectando…"; }
        else if (!conectou) { espera.hidden = false; espera.textContent = "Conectando…"; }
        else if (!o) { espera.hidden = false; espera.textContent = "Aguardando o outro participante"; }
        else { espera.hidden = true; }
      };

      /* ---------- áudio e vídeo remotos ---------- */
      const anexar = (track, onde) => {
        const elemento = track.attach();
        if (track.kind === "video") { elemento.setAttribute("playsinline", ""); elemento.muted = true; }
        onde.append(elemento);
        // Se o navegador recusar tocar (política de autoplay), o botão "Ativar áudio" aparece.
        if (track.kind === "audio") {
          const recusou = () => { audioRecusado = true; bAudio.hidden = false; };
          try { elemento.play?.()?.catch?.(recusou); } catch { recusou(); }
        }
      };
      // O SDK já solta o elemento ao cancelar a assinatura: detach() devolve vazio e o elemento ficaria preso na tela.
      const limparRemotos = () => [...remoto.children].forEach((el) => {
        if (!el.srcObject) return;
        const trilhas = el.srcObject.getTracks?.() ?? [];
        if (!trilhas.some((t) => t.readyState === "live")) el.remove();
      });
      ouvir(E.TrackSubscribed, (track) => { limparRemotos(); anexar(track, remoto); sincronizar(); });
      ouvir(E.TrackUnsubscribed, (track) => { track.detach().forEach((el) => el.remove()); limparRemotos(); sincronizar(); });
      ouvir(E.ParticipantConnected, sincronizar);
      ouvir(E.ParticipantDisconnected, () => {
        // Sem mais ninguém na sala, nenhum <video>/<audio> remoto deve sobrar na tela.
        if (!room.remoteParticipants?.size) [...remoto.children].forEach((el) => { if (el.srcObject !== undefined) el.remove(); });
        sincronizar();
      });
      ouvir(E.LocalTrackPublished, (pub) => { if (pub.track?.kind === "video") anexar(pub.track, local); sincronizar(); });
      ouvir(E.LocalTrackUnpublished, (pub) => { pub.track?.detach().forEach((el) => el.remove()); sincronizar(); });
      for (const nome of ["TrackMuted", "TrackUnmuted", "TrackPublished", "TrackUnpublished", "ActiveSpeakersChanged", "AudioPlaybackStatusChanged", "ParticipantMetadataChanged"]) ouvir(E[nome], sincronizar);
      ouvir(E.MediaDevicesError, (erro) => mostrarAviso(mensagemDeMidia(erro, "o microfone ou a câmera")));
      ouvir(E.Reconnecting, () => { reconectando = true; sincronizar(); ganchos.aoPerder?.(); });
      ouvir(E.Reconnected, () => { reconectando = false; sincronizar(); ganchos.aoRecuperar?.(); });
      ouvir(E.Disconnected, (razao) => {
        if (encerrado) return;
        ganchos.aoDesconectar?.(motivoDaDesconexao(razao, sdk.DisconnectReason ?? {}));
      });

      let temporizador = null;
      const mostrarAviso = (texto) => {
        aviso.hidden = false; aviso.textContent = texto;
        globalThis.clearTimeout?.(temporizador);
        temporizador = globalThis.setTimeout?.(() => { aviso.hidden = true; }, 8000);
      };

      /* ---------- controles ---------- */
      // O valor novo parte do estado REAL da sala (não de uma variável que pode ter ficado para trás).
      const definir = async (qual, rotulo, valor, ativar) => {
        const antes = ligado[qual];
        try {
          ligado[qual] = valor;
          await ativar(valor);
        } catch (erro) { ligado[qual] = antes; mostrarAviso(mensagemDeMidia(erro, rotulo)); }
        sincronizar();
      };
      const ligarMic = (valor) => definir("mic", "o microfone", valor, (v) => room.localParticipant.setMicrophoneEnabled(v));
      const ligarCam = (valor) => definir("cam", "a câmera", valor, (v) => room.localParticipant.setCameraEnabled(v));
      const bMic = criarBotao(documento, () => ligarMic(!micLocal()));
      const bCam = criarBotao(documento, () => ligarCam(!camLocal()));

      /* ---------- tela cheia: API nativa; se faltar (ex.: iPhone), expande dentro da página ---------- */
      let modo = "normal"; // normal | nativa | pagina
      const podeNativa = typeof container.requestFullscreen === "function" || typeof container.webkitRequestFullscreen === "function";
      const bTela = criarBotao(documento, () => alternarTela());
      const pintarTela = () => {
        const cheia = modo !== "normal";
        bTela.pintar({
          icone: cheia ? "tela-sair" : "tela", texto: cheia ? "Sair da tela cheia" : "Expandir",
          nome: cheia ? "Sair da tela cheia" : "Expandir o vídeo para tela cheia", ativo: cheia,
        });
        container.className = cheia ? `${classeBase} sala-video--cheia` : classeBase;
        container.setAttribute?.("data-tela", modo);
      };
      const elementoCheio = () => documento.fullscreenElement ?? documento.webkitFullscreenElement ?? null;
      const aoMudarTela = () => {
        if (encerrado) return;
        if (modo === "nativa" && elementoCheio() !== container) modo = "normal"; // Esc ou saída pelo navegador
        pintarTela();
      };
      const sairDaTela = async () => {
        if (modo === "nativa") { try { await (documento.exitFullscreen?.() ?? documento.webkitExitFullscreen?.()); } catch { /* já saiu */ } }
        modo = "normal"; pintarTela();
      };
      const alternarTela = async () => {
        if (modo !== "normal") { await sairDaTela(); return; }
        if (podeNativa) {
          try { await (container.requestFullscreen?.() ?? container.webkitRequestFullscreen?.()); modo = "nativa"; pintarTela(); return; }
          catch { /* recusado: usa a expansão dentro da página */ }
        }
        modo = "pagina"; pintarTela();
      };
      const aoTeclar = (evento) => { if (evento?.key === "Escape" && modo === "pagina") { modo = "normal"; pintarTela(); } };
      documento.addEventListener?.("fullscreenchange", aoMudarTela);
      documento.addEventListener?.("webkitfullscreenchange", aoMudarTela);
      documento.addEventListener?.("keydown", aoTeclar);

      bAudio.addEventListener("click", async () => {
        try { await room.startAudio(); audioRecusado = false; } catch { mostrarAviso("O navegador não liberou o áudio. Toque na tela e tente de novo."); }
        sincronizar();
      });
      controles.append(bMic, bCam, bTela);
      pintarTela();
      sincronizar();

      (async () => {
        try {
          await room.connect(url, token);
          if (encerrado) { room.disconnect(); return; }
          conectou = true;
          ganchos.aoConectar?.();
          // Entrar já foi um clique do usuário: tenta liberar o áudio de uma vez.
          try { await room.startAudio?.(); } catch { /* o botão "Ativar áudio" cobre */ }
          sincronizar();
          // Câmera e microfone só depois de conectar; recusa de permissão não derruba a chamada.
          await ligarMic(true);
          await ligarCam(true);
          sincronizar();
        } catch {
          if (!encerrado) ganchos.aoFalhar?.();
        }
      })();

      return {
        sair() {
          if (encerrado) return;
          encerrado = true;
          globalThis.clearTimeout?.(temporizador);
          documento.removeEventListener?.("fullscreenchange", aoMudarTela);
          documento.removeEventListener?.("webkitfullscreenchange", aoMudarTela);
          documento.removeEventListener?.("keydown", aoTeclar);
          if (modo === "nativa") { try { documento.exitFullscreen?.()?.catch?.(() => {}); } catch { /* sem tela cheia */ } }
          container.className = classeBase;
          try { room.disconnect(); } catch { /* já desconectado */ }
          grade.remove();
        },
      };
    },
  };
}

export function criarPortaDeVideo(adaptador) {
  if (typeof adaptador?.montar !== "function") throw new TypeError("Adaptador de vídeo inválido.");
  let ativa = null;
  return {
    entrar(container, dados, ganchos) { ativa?.sair(); ativa = adaptador.montar(container, dados, ganchos); },
    sair() { ativa?.sair(); ativa = null; },
    get ativa() { return Boolean(ativa); },
  };
}
