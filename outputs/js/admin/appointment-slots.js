const ISO_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const instant = (value) => {
  if (!ISO_LOCAL.test(value || "")) throw new Error("Informe início e fim válidos.");
  const parsed = new Date(`${value}:00-03:00`);
  if (!Number.isFinite(parsed.valueOf())) throw new Error("Informe início e fim válidos.");
  return parsed.toISOString();
};

export async function createAppointmentSlot(client, { offeringId, professionalProfileId, startsAt, endsAt, roomId = "" } = {}) {
  if (!offeringId || !professionalProfileId) throw new Error("Escolha oferta e profissional.");
  const start = instant(startsAt);
  const end = instant(endsAt);
  if (Date.parse(end) <= Date.parse(start)) throw new Error("O término deve ser posterior ao início.");
  const { data, error } = await client.rpc("create_appointment_slot", { p_details: {
    offering_id: offeringId, professional_profile_id: professionalProfileId,
    starts_at: start, ends_at: end, room_id: String(roomId || "").trim() || null,
  } });
  if (error) throw error;
  if (!data?.id || data.status !== "available") throw new Error("O horário não foi confirmado pelo servidor.");
  return data;
}
