// MODELO de LiveKit para testes locais (não é o LiveKit real).
// Premissas do modelo, todas a confirmar na homologação real:
//  - o token é um JWT que continua válido até expirar, mesmo depois de a sala ser apagada;
//  - entrar com token válido numa sala inexistente a CRIA (auto-create);
//  - apagar a sala desconecta quem está nela; remover participante também.
import { createCloseRoomHandler } from "../../supabase/functions/close-appointment-room/handler.ts";
import { createRoomTokenHandler } from "../../supabase/functions/issue-appointment-room-token/handler.ts";

export const ID = "11111111-2222-4333-8444-555555555555";
export const SALA = "potala-0123456789abcdef0123456789abcdef";
export const barreira = () => { let abrir; const passou = new Promise((r) => { abrir = r; }); return { passou, abrir }; };
export const nuncaVolta = () => new Promise(() => {});

export function modeloLiveKit() {
  const m = { agora: 1_000_000, salas: new Map(), chamadas: [], down: false, criacaoDown: false, gate: null, chegou: barreira() };
  const log = (...a) => m.chamadas.push(a);
  const lk = {
    async createRoom(name) {
      log("createRoom", name);
      m.chegou.abrir(); if (m.gate) await m.gate.passou;
      if (m.criacaoDown) return { status: 503 };
      if (!m.salas.has(name)) m.salas.set(name, { max: 2, conectados: new Map() });
      return { status: 200 };
    },
    async removeParticipant(room, id) {
      log("removeParticipant", room, id);
      if (m.down) return { status: 503 };
      const s = m.salas.get(room); if (!s) return { status: 404 };
      return s.conectados.delete(id) ? { status: 200 } : { status: 404 };
    },
    async deleteRoom(room) {
      log("deleteRoom", room);
      if (m.down) return { status: 503 };
      return m.salas.delete(room) ? { status: 200 } : { status: 404 };
    },
    async findRoom(room) {
      log("findRoom", room);
      if (m.down) return { status: 503 };
      return { status: m.salas.has(room) ? 200 : 404 };
    },
    async token(spec) { log("token", spec.room, spec.identity, spec.ttlSeconds); return `tok|${spec.room}|${spec.identity}|${m.agora + spec.ttlSeconds}`; },
  };
  // Cliente tentando entrar com um token (modelo do servidor LiveKit).
  m.entrar = (token) => {
    const [, room, identity, exp] = String(token).split("|");
    if (Number(exp) <= m.agora) return { ok: false, motivo: "expirado" };
    let s = m.salas.get(room);
    if (!s) { s = { max: 0, conectados: new Map() }; m.salas.set(room, s); } // auto-create sem limites
    if (!s.conectados.has(identity) && s.max && s.conectados.size >= s.max) return { ok: false, motivo: "cheia" };
    s.conectados.set(identity, true);
    return { ok: true };
  };
  m.conectados = (room) => [...(m.salas.get(room)?.conectados.keys() ?? [])];
  return { m, lk };
}

const ENV = { LIVEKIT_URL: "wss://potala-lab.livekit.cloud", LIVEKIT_API_KEY: "APIchaveficticia", LIVEKIT_API_SECRET: "segredoficticio0123456789", ROOM_ALLOWED_ORIGINS: "https://app.invalid" };
export const envPadrao = (over = {}) => (n) => ({ ...ENV, ...over })[n];
export const pedido = (extra = {}) => new Request("https://f.invalid/x", { method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://app.invalid", Authorization: "Bearer jwt", ...extra }, body: JSON.stringify({ request_id: ID }) });

export function mundo(opc = {}) {
  const { m, lk } = modeloLiveKit();
  const w = { m, fechado: false, tarefas: [], espera: barreira(), contextoFalhas: opc.contextoFalhas ?? 0, marcadas: [], lookupProvider: opc.provider ?? "livekit" };
  const env = envPadrao(opc.env);
  const later = (t) => { w.tarefas.push(t); };
  const esperar = opc.esperar ?? (() => w.espera.passou); // retentativas só andam quando o teste libera
  const expira = () => new Date(Date.now() + (opc.janelaMs ?? 3600e3)).toISOString();
  const emitir = createRoomTokenHandler({ env, later, esperar, lk,
    issue: async () => ({ data: { session_id: "s", room_name: SALA, provider: opc.provider ?? "livekit", role: "client", expires_at: expira(), participant_id: "u1" } }),
    context: async () => {
      if (opc.contextoSempreAberto) return { data: { state: "open" } };
      if (w.contextoFalhas-- > 0) throw new Error("timeout");
      return { data: { state: w.fechado ? "closed" : "open" } };
    } });
  const encerrar = createCloseRoomHandler({ env, later, esperar, lk,
    close: async () => { w.fechado = true; return { data: { closed: true } }; },
    lookup: async () => ({ session_id: "sess-1", provider: w.lookupProvider, room_name: SALA, user_ids: ["u1", "u2"] }),
    marcar: async (id) => { w.marcadas.push(id); } });
  return { w, m, lk, emitir: () => emitir(pedido()), encerrar: () => encerrar(pedido()) };
}
