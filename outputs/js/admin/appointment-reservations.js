const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isoLocal(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || "")) throw new Error("Informe início e fim válidos.");
  const instant = new Date(`${value}:00-03:00`);
  if (!Number.isFinite(instant.valueOf())) throw new Error("Informe início e fim válidos.");
  return instant.toISOString();
}

export async function confirmAppointmentReservation(client, {
  requestId, expectedUpdatedAt, idempotencyKey, startsAt, endsAt, roomId = "", notes = "",
  offeringId = "", professionalProfileId = "", clientProfileId = "",
} = {}) {
  if (!UUID.test(requestId || "") || !expectedUpdatedAt || !UUID.test(idempotencyKey || "")) {
    throw new Error("Recarregue a solicitação antes de confirmar.");
  }
  const start = isoLocal(startsAt);
  const end = isoLocal(endsAt);
  if (Date.parse(end) <= Date.parse(start)) throw new Error("O término deve ser posterior ao início.");
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
  if (error) {
    if (error.code === "PT409") throw Object.assign(new Error("A solicitação ou a agenda mudou. Recarregue antes de confirmar."), { code: "APPOINTMENT_CONFLICT" });
    throw error;
  }
  if (data?.result?.request_id !== requestId || !data?.result?.schedule_id) throw new Error("A reserva não foi confirmada pelo servidor.");
  return data;
}
