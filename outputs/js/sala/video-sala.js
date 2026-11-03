/*
 * VÍDEO DA SALA: porta independente de provedor + adaptador LiveKit.
 *
 * O resto da sala só conhece `entrar(container, { url, token }, ganchos)`. O SDK oficial
 * (livekit-client, servido de /vendor/livekit-client.umd.js) fica só neste arquivo.
 * Nenhuma chave existe aqui: o token chega pronto da função de borda, vale poucos
 * segundos para ENTRAR e é restrito a esta sala.
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

const botao = (documento, rotulo, aoClicar) => {
  const b = documento.createElement("button");
  b.type = "button";
  b.className = "mp-botao mp-botao--secundario sala-video-botao";
  b.textContent = rotulo;
  b.addEventListener("click", aoClicar);
  return b;
};

export function adaptadorLiveKit({ documento = globalThis.document, sdk = globalThis.LivekitClient } = {}) {
  return {
    nome: "livekit",
    montar(container, { url, token }, ganchos = {}) {
      if (!urlDeSalaValida(url) || typeof token !== "string" || !token || token.length > 4096) {
        throw new TypeError("Dados da sala de vídeo inválidos.");
      }
      if (!sdk?.Room) throw new TypeError("O módulo de vídeo não foi carregado.");

      const grade = documento.createElement("div");
      grade.className = "sala-video-grade";
      const remoto = documento.createElement("div");
      remoto.className = "sala-video-remoto";
      const local = documento.createElement("div");
      local.className = "sala-video-local";
      const aviso = documento.createElement("p");
      aviso.className = "sala-video-aviso";
      aviso.setAttribute("role", "status");
      aviso.textContent = "Conectando à videochamada…";
      const controles = documento.createElement("div");
      controles.className = "sala-video-controles";
      grade.append(remoto, local, aviso, controles);
      container.replaceChildren(grade);

      const room = new sdk.Room({ adaptiveStream: true, dynacast: true });
      let encerrado = false;
      const ligado = { mic: false, cam: false };

      const anexar = (track, onde) => {
        const elemento = track.attach();
        if (track.kind === "video") { elemento.setAttribute("playsinline", ""); elemento.muted = true; }
        onde.append(elemento);
      };
      // O SDK ja solta o elemento ao cancelar a assinatura: detach() devolve vazio e o <video> ficaria preso na tela.
      const limparRemotos = () => [...remoto.children].forEach((el) => { const trilhas = el.srcObject?.getTracks?.() ?? []; if (!trilhas.some((t) => t.readyState === "live")) el.remove(); });
      room.on(sdk.RoomEvent.TrackSubscribed, (track) => { aviso.hidden = true; limparRemotos(); anexar(track, remoto); });
      room.on(sdk.RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach((el) => el.remove()); limparRemotos(); });
      room.on(sdk.RoomEvent.ParticipantDisconnected, () => {
        if (room.remoteParticipants?.size) return;
        remoto.replaceChildren(); aviso.hidden = false; aviso.textContent = "Aguardando a outra pessoa entrar\u2026";
      });
      room.on(sdk.RoomEvent.LocalTrackPublished, (pub) => { if (pub.track?.kind === "video") anexar(pub.track, local); });
      room.on(sdk.RoomEvent.LocalTrackUnpublished, (pub) => { pub.track?.detach().forEach((el) => el.remove()); });
      room.on(sdk.RoomEvent.Reconnecting, () => ganchos.aoPerder?.());
      room.on(sdk.RoomEvent.Reconnected, () => ganchos.aoRecuperar?.());
      room.on(sdk.RoomEvent.Disconnected, (razao) => {
        if (encerrado) return;
        ganchos.aoDesconectar?.(motivoDaDesconexao(razao, sdk.DisconnectReason ?? {}));
      });

      const alternar = async (qual, rotulo, ativar) => {
        try {
          ligado[qual] = !ligado[qual];
          await ativar(ligado[qual]);
        } catch { ligado[qual] = !ligado[qual]; aviso.hidden = false; aviso.textContent = `Não foi possível usar ${rotulo}. Verifique a permissão do navegador.`; }
        atualizar();
      };
      const bMic = botao(documento, "Microfone", () => alternar("mic", "o microfone", (v) => room.localParticipant.setMicrophoneEnabled(v)));
      const bCam = botao(documento, "Câmera", () => alternar("cam", "a câmera", (v) => room.localParticipant.setCameraEnabled(v)));
      const atualizar = () => {
        bMic.textContent = ligado.mic ? "Desligar microfone" : "Ligar microfone"; bMic.setAttribute("aria-pressed", String(ligado.mic));
        bCam.textContent = ligado.cam ? "Desligar câmera" : "Ligar câmera"; bCam.setAttribute("aria-pressed", String(ligado.cam));
      };
      atualizar();
      controles.append(bMic, bCam);

      (async () => {
        try {
          await room.connect(url, token);
          if (encerrado) { room.disconnect(); return; }
          aviso.textContent = "Aguardando a outra pessoa entrar…";
          ganchos.aoConectar?.();
          // Câmera e microfone só depois de conectar; recusa de permissão não derruba a chamada.
          await alternar("mic", "o microfone", (v) => room.localParticipant.setMicrophoneEnabled(v));
          await alternar("cam", "a câmera", (v) => room.localParticipant.setCameraEnabled(v));
          if (room.remoteParticipants?.size) aviso.hidden = true;
        } catch {
          if (!encerrado) ganchos.aoFalhar?.();
        }
      })();

      return {
        sair() {
          if (encerrado) return;
          encerrado = true;
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
