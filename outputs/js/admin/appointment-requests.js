// Usar somente o cliente da sessão administrativa; autorização final é a RLS.
const FIELDS = "id,service,modality,requester_name,contact_type,contact,preferred_date,preferred_period,status,offering_id,professional_profile_id,appointment_slot_id,reservation_schedule_id,reservation_confirmed_at,created_at,updated_at,appointment_slot:appointment_slots!appointment_requests_appointment_slot_id_fkey(id,starts_at,ends_at,status,held_by_request_id)";
export const STATES = ["recebida", "em_contato", "encerrada", "cancelada"];

export async function loadAppointmentRequests(client) {
  const { data, error } = await client.from("appointment_requests").select(FIELDS)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

export async function updateAppointmentRequestStatus(client, id, status, updatedAt) {
  if (!STATES.includes(status)) throw new Error("Estado de solicitação inválido.");
  if (!updatedAt || !Number.isFinite(Date.parse(updatedAt))) throw new Error("Recarregue a solicitação antes de atualizar.");
  const { data, error } = await client.from("appointment_requests").update({ status })
    .eq("id", id).eq("updated_at", updatedAt).select(FIELDS).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Alteração não confirmada. A solicitação mudou ou não está acessível. Recarregue antes de tentar novamente."), { code: "APPOINTMENT_CONFLICT" });
  if (data.id !== id || data.status !== status || !data.updated_at) throw new Error("Alteração não confirmada.");
  return data;
}
