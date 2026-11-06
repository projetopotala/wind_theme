// Montagem do token de acesso LiveKit. Recebe as classes do SDK oficial por parâmetro: na Edge
// Function vêm de `npm:livekit-server-sdk`, nos testes do pacote instalado em node_modules, e assim
// os claims reais são verificados sem rede. Nenhum segredo é guardado aqui.
type Concessao<S> = {
  room: string; roomJoin: boolean; canPublish: boolean; canSubscribe: boolean; canPublishData: boolean;
  canUpdateOwnMetadata: boolean; canPublishSources: S[];
};
type Opcoes = { identity: string; name: string; ttl: number };
type Sdk<S> = {
  AccessToken: new (key: string, secret: string, opts: Opcoes) => { addGrant(c: Concessao<S>): void; toJwt(): Promise<string> };
  TrackSource: { CAMERA: S; MICROPHONE: S };
};

// LiveKit Cloud: RemoveParticipant com revokeTokenTs invalida tokens emitidos antes desse instante (nbf),
// mesmo que o participante já tenha saído, e não falha se ele não existe mais. O instante precisa estar
// a até 60 s do relógio do servidor; +5 s cobre token emitido no mesmo segundo.
export const opcoesDeRevogacao = (agoraSeg = Math.floor(Date.now() / 1000)) => ({ revokeTokenTs: BigInt(agoraSeg + 5) });

export type TokenSpec = { room: string; identity: string; name: string; ttlSeconds: number };

export async function gerarToken<S>(sdk: Sdk<S>, key: string, secret: string, spec: TokenSpec): Promise<string> {
  const at = new sdk.AccessToken(key, secret, { identity: spec.identity, name: spec.name, ttl: spec.ttlSeconds });
  // Só entrar nesta sala, publicar câmera/microfone e assistir. Sem tela, sem dados (o chat é nosso),
  // sem administração de sala, sem gravação, sem criar sala.
  at.addGrant({ room: spec.room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false,
    canUpdateOwnMetadata: false, canPublishSources: [sdk.TrackSource.CAMERA, sdk.TrackSource.MICROPHONE] });
  return await at.toJwt();
}
