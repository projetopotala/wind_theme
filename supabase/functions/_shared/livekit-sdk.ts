// Cliente LiveKit das Edge Functions: SDK oficial (livekit-server-sdk) por trás da interface
// LkAdmin, que é o que os handlers e os testes conhecem. Nenhum segredo sai deste módulo.
import { AccessToken, RoomServiceClient, TrackSource } from "npm:livekit-server-sdk@2.19.2";
import { gerarToken } from "./livekit-token.ts";
import { urlLiveKit, type LkAdmin, type LkResult } from "./livekit-revoke.ts";

const TIMEOUT_MS = 8000;
// Remove espaços, quebras de linha e aspas coladas junto com o valor do segredo.
const limpa = (v: string | undefined) => (v ?? "").trim().replace(/^["']+|["']+$/g, "").trim();

// Nunca devolve a mensagem do erro (poderia citar cabeçalhos): só um status HTTP.
function statusDoErro(e: unknown): number {
  const x = e as { status?: unknown; code?: unknown };
  if (x?.code === "not_found") return 404;
  return typeof x?.status === "number" ? x.status : 599;
}

const comLimite = <T>(p: Promise<T>): Promise<T> => Promise.race([
  p, new Promise<T>((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { status: 599 })), TIMEOUT_MS)),
]);

async function chamar(f: () => Promise<unknown>): Promise<LkResult> {
  try { await comLimite(f()); return { status: 200 }; } catch (e) { return { status: statusDoErro(e) }; }
}

export function criarLk(env: (nome: string) => string | undefined): LkAdmin & {
  token: (spec: { room: string; identity: string; name: string; ttlSeconds: number }) => Promise<string>;
} {
  const wss = urlLiveKit(env("LIVEKIT_URL")) ?? "";
  const key = limpa(env("LIVEKIT_API_KEY"));
  const secret = limpa(env("LIVEKIT_API_SECRET"));
  const admin = () => new RoomServiceClient(wss.replace(/^wss:/, "https:"), key, secret);
  return {
    createRoom: (name) => chamar(() => admin().createRoom({ name, maxParticipants: 2, emptyTimeout: 120, departureTimeout: 30 })),
    removeParticipant: (room, identity) => chamar(() => admin().removeParticipant(room, identity)),
    deleteRoom: (room) => chamar(() => admin().deleteRoom(room)),
    // listRooms filtrado por nome devolve lista vazia quando a sala não existe (404 aqui).
    async findRoom(room) {
      try {
        const rooms = await comLimite(admin().listRooms([room]));
        return { status: rooms.length ? 200 : 404 };
      } catch (e) { return { status: statusDoErro(e) }; }
    },
    token: (spec) => gerarToken({ AccessToken, TrackSource }, key, secret, spec),
  };
}
