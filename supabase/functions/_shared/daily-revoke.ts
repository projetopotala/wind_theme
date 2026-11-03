// Revogação no Daily compartilhada pelas duas funções. Idempotente: repetir é seguro.
export type DailyResult = { status: number; json: Record<string, unknown> };
export type DailyCall = (method: "POST" | "DELETE", path: string, body?: unknown) => Promise<DailyResult>;
export type Esperar = (ms: number) => Promise<void>;

export const esperarReal: Esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Sucesso é só o que o Daily confirma de forma inequívoca; 404 = sala já ausente
// (nunca criada ou já removida), o estado desejado.
export function confirmou(r: DailyResult, campo: "ejectedIds" | "deleted") {
  if (r.status === 404) return true;
  if (r.status !== 200) return false;
  return campo === "deleted" ? r.json?.deleted === true : Array.isArray(r.json?.ejectedIds);
}

// Cada passo é tentado mesmo que o outro falhe. Timeout/exceção = não confirmado.
export async function revogarSala(daily: DailyCall, roomName: string, userIds: string[]): Promise<boolean> {
  const room = encodeURIComponent(roomName);
  const passo = async (chamada: () => Promise<DailyResult>, campo: "ejectedIds" | "deleted") => {
    try { return confirmou(await chamada(), campo); } catch { return false; }
  };
  const ejected = userIds.length === 0 ? true
    : await passo(() => daily("POST", `/rooms/${room}/eject`, { user_ids: userIds, ban: true }), "ejectedIds");
  const removed = await passo(() => daily("DELETE", `/rooms/${room}`), "deleted");
  return ejected && removed;
}

// Repete com espera crescente até confirmar ou esgotar as tentativas.
export async function revogarComRetentativas(daily: DailyCall, roomName: string, userIds: string[],
  { esperas = [1000, 3000, 8000], esperar = esperarReal }: { esperas?: number[]; esperar?: Esperar } = {}): Promise<boolean> {
  for (let i = 0; ; i++) {
    if (await revogarSala(daily, roomName, userIds)) return true;
    if (i >= esperas.length) return false;
    await esperar(esperas[i]);
  }
}
