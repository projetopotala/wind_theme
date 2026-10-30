const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isoLocal(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || "")) throw new Error("Informe início e fim válidos.");
  const instant = new Date(`${value}:00-03:00`);
  if (!Number.isFinite(instant.valueOf())) throw new Error("Informe início e fim válidos.");
  return instant.toISOString();
}

/*
 * O servidor fala por SQLSTATE. Cada um pede uma acao diferente de quem opera,
 * entao sao traduzidos um a um. O 22023 e validacao de dados, nao concorrencia:
 * mandar "recarregue" ali faria o administrador repetir uma tentativa que vai
 * falhar de novo pelo mesmo motivo. A mensagem do banco nunca e repassada.
 */
export const ERROS_DA_CONFIRMACAO = Object.freeze({
  PT409: ["APPOINTMENT_CONFLICT", "A solicitação ou a agenda mudou. Recarregue antes de confirmar."],
  PT422: ["APPOINTMENT_CLIENT_LINK", "O cadastro operacional do solicitante precisa ser revisado antes da confirmação."],
  42501: ["APPOINTMENT_FORBIDDEN", "Seu acesso não permite confirmar reservas."],
  P0002: ["APPOINTMENT_MISSING", "Esta solicitação não está mais acessível. Recarregue a lista."],
  23514: ["APPOINTMENT_UNAVAILABLE", "A sala escolhida não está disponível neste horário."],
  23503: ["APPOINTMENT_LINK_LOCKED", "O vínculo desta reserva não pode ser alterado."],
  55000: ["APPOINTMENT_NOT_READY", "A operação do Instituto ainda não está inicializada."],
  22023: ["APPOINTMENT_INVALID", "Revise os dados da reserva: algum campo não confere com a solicitação."],
});

/* Sessao vencida ou ausente: PostgREST responde fora da faixa SQLSTATE. */
const SESSAO_EXPIRADA = new Set(["PGRST301", "PGRST302", "401"]);

export function traduzirErroDaConfirmacao(error) {
  const bruto = error?.code == null ? "" : String(error.code);
  if (SESSAO_EXPIRADA.has(bruto) || error?.status === 401) {
    return Object.assign(new Error("Sua sessão expirou. Entre novamente para confirmar."), { code: "APPOINTMENT_SESSION" });
  }
  const conhecido = Object.prototype.hasOwnProperty.call(ERROS_DA_CONFIRMACAO, bruto)
    ? ERROS_DA_CONFIRMACAO[bruto] : null;
  if (!conhecido) {
    return Object.assign(new Error("Não foi possível confirmar a reserva. Tente novamente em instantes."), { code: "APPOINTMENT_FAILED" });
  }
  const [codigo, mensagem] = conhecido;
  return Object.assign(new Error(mensagem), { code: codigo });
}

export async function confirmAppointmentReservation(client, {
  requestId, expectedUpdatedAt, idempotencyKey, startsAt, endsAt, roomId = "", notes = "",
  offeringId = "", professionalProfileId = "", clientProfileId = "", slotStartsAt = "", slotEndsAt = "",
} = {}) {
  if (!UUID.test(requestId || "") || !expectedUpdatedAt || !UUID.test(idempotencyKey || "")) {
    throw new Error("Recarregue a solicitação antes de confirmar.");
  }
  const start = isoLocal(startsAt);
  const end = isoLocal(endsAt);
  if (Date.parse(end) <= Date.parse(start)) throw new Error("O término deve ser posterior ao início.");
  if ((slotStartsAt || slotEndsAt) && (startsAt !== slotStartsAt || endsAt !== slotEndsAt)) {
    throw new Error("O horário deve corresponder exatamente ao slot solicitado.");
  }
  const { data, error } = await client.rpc("confirm_appointment_request_reservation", {
    p_request_id: requestId,
    p_expected_updated_at: expectedUpdatedAt,
    p_idempotency_key: idempotencyKey,
    p_schedule: {
      starts_at: start,
      ends_at: end,
      room_id: String(roomId || "").trim() || null,
      notes: String(notes || "").trim().slice(0, 1000),
      offering_id: String(offeringId || "").trim() || null,
      professional_profile_id: String(professionalProfileId || "").trim() || null,
      client_profile_id: String(clientProfileId || "").trim() || null,
    },
  });
  if (error) throw traduzirErroDaConfirmacao(error);
  if (data?.result?.request_id !== requestId || !data?.result?.schedule_id) throw new Error("A reserva não foi confirmada pelo servidor.");
  return data;
}
