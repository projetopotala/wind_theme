// Revogacao no LiveKit compartilhada pelas funcoes. Idempotente: repetir e seguro.
//
// LiveKit NAO revoga JWT ja emitido: um token continua valido ate expirar e, se a sala for
// apagada, um token ainda valido pode recria-la ao entrar. Por isso "revogado" aqui significa:
//   1. participantes conhecidos removidos;
//   2. sala apagada (o que desconecta quem restar);
//   3. confirmacao de que a sala NAO existe mais (404). Sala existente depois do delete =
//      alguem reentrou/recriou com token ainda valido => NAO revogado, tenta de novo.
// O resto da protecao e a validade curta do token (TTL_TOKEN_SEGUNDOS) e a varredura final.
export type LkResult = { status: number; participants?: string[] };
export type LkAdmin = {
  createRoom(name: string): Promise<LkResult>;
  removeParticipant(room: string, identity: string): Promise<LkResult>;
  deleteRoom(room: string): Promise<LkResult>;
  findRoom(room: string): Promise<LkResult>; // 200 = existe, 404 = ausente
};
export type Esperar = (ms: number) => Promise<void>;

// Validade do token de entrada. Entrar leva segundos; um token roubado ou antigo morre rapido.
export const TTL_TOKEN_SEGUNDOS = 90;
// Depois de encerrar, espera-se o token mais longo possivel expirar e varre de novo.
export const JANELA_VARREDURA_MS = (TTL_TOKEN_SEGUNDOS + 5) * 1000;

export const esperarReal: Esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 404 = ja ausente (estado desejado). Qualquer outra coisa diferente de 200 nao e confirmacao.
export const confirmou = (r: LkResult) => r.status === 200 || r.status === 404;

export async function revogarSala(lk: LkAdmin, room: string, identities: string[]): Promise<boolean> {
  const seguro = async <T>(f: () => Promise<T>, vazio: T) => { try { return await f(); } catch { return vazio; } };
  const falhou: LkResult = { status: 599 };
  let removidos = true;
  for (const id of identities) {
    const r = await seguro(() => lk.removeParticipant(room, id), falhou);
    if (!confirmou(r)) removidos = false;
  }
  const apagada = confirmou(await seguro(() => lk.deleteRoom(room), falhou));
  // Verificacao independente: a sala so conta como revogada se o LiveKit diz que ela nao existe.
  const ausente = (await seguro(() => lk.findRoom(room), falhou)).status === 404;
  return removidos && apagada && ausente;
}

export async function revogarComRetentativas(lk: LkAdmin, room: string, identities: string[],
  { esperas = [1000, 3000, 8000], esperar = esperarReal }: { esperas?: number[]; esperar?: Esperar } = {}): Promise<boolean> {
  for (let i = 0; ; i++) {
    if (await revogarSala(lk, room, identities)) return true;
    if (i >= esperas.length) return false;
    await esperar(esperas[i]);
  }
}

// Espera a janela do token e revoga de novo: pega quem reentrou com token ainda valido.
export async function varrerDepoisDaJanela(lk: LkAdmin, room: string, identities: string[], esperar: Esperar = esperarReal) {
  await esperar(JANELA_VARREDURA_MS);
  return await revogarComRetentativas(lk, room, identities, { esperar });
}

export const URL_LIVEKIT = /^wss:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.livekit\.cloud$/i;
// Aceita https:// e normaliza para wss://; devolve null se nao for um host LiveKit Cloud sem caminho.
export function urlLiveKit(bruta: string | undefined): string | null {
  const s = (bruta ?? "").trim().replace(/^["']+|["']+$/g, "").trim().replace(/\/+$/, "").replace(/^https:\/\//i, "wss://");
  return URL_LIVEKIT.test(s) ? s : null;
}
