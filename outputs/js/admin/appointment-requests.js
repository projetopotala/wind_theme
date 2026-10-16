// Preparado para Recebido pelo site. Não carregado pela interface nesta etapa.
// Usar somente o cliente da sessão administrativa; autorização final é a RLS.
const FIELDS = "id,service,modality,requester_name,contact_type,contact,preferred_date,preferred_period,status,created_at,updated_at";
const STATES = ["recebida", "em_contato", "encerrada", "cancelada"];

export async function loadAppointmentRequests(client) {
  const { data, error } = await client.from("appointment_requests").select(FIELDS)
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

export async function updateAppointmentRequestStatus(client, id, status) {
  if (!STATES.includes(status)) throw new Error("Estado de solicitação inválido.");
  const { data, error } = await client.from("appointment_requests").update({ status })
    .eq("id", id).select(FIELDS).single();
  if (error) throw error;
  if (!data || data.id !== id || data.status !== status) throw new Error("Alteração não confirmada.");
  return data;
}
