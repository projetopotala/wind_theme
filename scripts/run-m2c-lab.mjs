/*
 * Homologação integrada da Frente C. Só aceita o laboratório Potala e mantém
 * os dados sintéticos identificáveis como evidência; não faz limpeza implícita.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createOperationsClient } from "../outputs/js/admin/operations/client.js";

const PROJECT = "hmspabllgxqfzzricijv";
const envPath = process.env.POTALA_LAB_ENV || "C:/Users/vicel/potala-lab.env";
const parseEnv = (file) => Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/)
  .map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const at = line.indexOf("="); return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
const env = parseEnv(envPath);
const url = env.POTALA_LAB_URL;
const anonKey = env.POTALA_LAB_ANON_KEY;
const serviceKey = env.POTALA_LAB_SERVICE_ROLE_KEY;
const target = new URL(url || "https://invalid.test");
if (target.protocol !== "https:" || target.hostname !== `${PROJECT}.supabase.co` || !anonKey || !serviceKey) {
  throw new Error("Destino recusado: o runner aceita somente o laboratório Potala autorizado.");
}

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(url, serviceKey, options);
const visitor = createClient(url, anonKey, options);
const suffix = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
const password = `${crypto.randomBytes(24).toString("base64url")}Aa1!`;
const evidence = { project: PROJECT, run: suffix, checks: [] };
const check = (name, ok, detail = "") => { evidence.checks.push({ name, ok, detail }); if (!ok) throw new Error(`${name}: ${detail || "FAIL"}`); };
const createUser = async (kind) => {
  const email = `m2c-${kind}-${suffix}@example.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { synthetic: true, suite: "m2c" } });
  if (error) throw error;
  return { email, user: data.user };
};
const signIn = async (email) => {
  const client = createClient(url, anonKey, options);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
};
const rpc = async (client, name, args) => {
  const { data, error } = await client.rpc(name, args);
  return { data, error };
};

const { user: adminUser, email: adminEmail } = await createUser("admin");
const { email: clientAEmail } = await createUser("client-a");
const { email: clientBEmail } = await createUser("client-b");
const { error: adminInsertError } = await service.from("users").insert({ id: adminUser.id, email: adminEmail, name: "Admin sintético M2C", role: "admin", active: true });
if (adminInsertError) throw adminInsertError;
const admin = await signIn(adminEmail);
const clientA = await signIn(clientAEmail);
const clientB = await signIn(clientBEmail);
const { data: adminGuard, error: adminGuardError } = await rpc(admin, "is_portal_admin");
check("admin reconhecido", adminGuard === true && !adminGuardError, adminGuardError?.code);

for (const fn of ["create_appointment_slot", "submit_appointment_slot_request", "list_available_appointment_slots", "cancel_my_appointment_request", "list_my_appointment_requests"]) {
  const { error } = await visitor.rpc(fn, {});
  check(`anon sem EXECUTE: ${fn}`, Boolean(error), error?.code);
}
const { error: directSlotInsert } = await clientA.from("appointment_slots").insert({});
check("INSERT direto de horário negado", Boolean(directSlotInsert), directSlotInsert?.code);

const ids = {};
const operations = createOperationsClient({ client: admin, id: () => `m2c-${crypto.randomUUID()}`, agora: () => new Date().toISOString() });
await operations.refresh();
ids.professional = (await operations.command("person.save", { display_name: `Profissional M2C ${suffix}`, email: "", roles: ["professional"], professional_title: "Terapeuta", presentation: "Perfil sintético de homologação.", education: "Formação sintética", specialties: ["Reiki"], practice_areas: ["bem-estar"], modalities: ["online"], active: true, published: true })).id;
ids.clientA = (await operations.command("person.save", { display_name: "Cliente A M2C", email: clientAEmail, roles: ["client"], active: true, published: false })).id;
ids.clientB = (await operations.command("person.save", { display_name: "Cliente B M2C", email: clientBEmail, roles: ["client"], active: true, published: false })).id;
ids.definition = (await operations.command("definition.save", { title: `Atendimento M2C ${suffix}`, kind: "appointment" })).id;
ids.offering = (await operations.command("offering.save", { title: `Sessão M2C ${suffix}`, definition_id: ids.definition, professional_id: ids.professional, mode: "online", capacity: 1, price_cents: 10000, active: true })).id;

const starts = new Date(Date.now() + 14 * 86400000); starts.setUTCHours(16, 0, 0, 0);
const ends = new Date(starts.valueOf() + 3600000);
const createSlot = async (start = starts, end = ends) => {
  const { data, error } = await rpc(admin, "create_appointment_slot", { p_details: { offering_id: ids.offering, professional_profile_id: ids.professional, starts_at: start.toISOString(), ends_at: end.toISOString() } });
  check("horário administrativo criado", !error && data?.status === "available", error?.code);
  return data.id;
};
const slotOne = await createSlot();
const { data: slotsA, error: slotsAError } = await rpc(clientA, "list_available_appointment_slots", { p_offering_id: ids.offering });
check("cliente consulta horários publicados", !slotsAError && slotsA.some((slot) => slot.id === slotOne), slotsAError?.code);

const keyOne = crypto.randomUUID();
const first = await rpc(clientA, "submit_appointment_slot_request", { p_idempotency_key: keyOne, p_slot_id: slotOne });
check("primeira solicitação recebida", !first.error && first.data?.status === "recebida", first.error?.code);
const replay = await rpc(clientA, "submit_appointment_slot_request", { p_idempotency_key: keyOne, p_slot_id: slotOne });
check("replay idempotente", !replay.error && replay.data?.id === first.data.id && replay.data?.replayed === true, replay.error?.code);
const foreign = await rpc(clientB, "submit_appointment_slot_request", { p_idempotency_key: crypto.randomUUID(), p_slot_id: slotOne });
check("segundo cliente não toma horário", foreign.error?.code === "PT409", foreign.error?.code);
const own = await rpc(clientA, "list_my_appointment_requests", {});
const other = await rpc(clientB, "list_my_appointment_requests", {});
check("isolamento entre clientes", !own.error && own.data.some((row) => row.id === first.data.id) && !other.data.some((row) => row.id === first.data.id));

const startTwo = new Date(starts.valueOf() + 2 * 3600000), endTwo = new Date(startTwo.valueOf() + 3600000);
const slotTwo = await createSlot(startTwo, endTwo);
const concurrent = await Promise.allSettled([
  rpc(clientA, "submit_appointment_slot_request", { p_idempotency_key: crypto.randomUUID(), p_slot_id: slotTwo }),
  rpc(clientB, "submit_appointment_slot_request", { p_idempotency_key: crypto.randomUUID(), p_slot_id: slotTwo }),
]);
const accepted = concurrent.filter((result) => result.status === "fulfilled" && !result.value.error);
const denied = concurrent.filter((result) => result.status === "fulfilled" && result.value.error?.code === "PT409");
check("concorrência reserva exatamente um horário", accepted.length === 1 && denied.length === 1, JSON.stringify(concurrent));

const { data: requestRow, error: requestRowError } = await service.from("appointment_requests").select("id,updated_at,appointment_slot_id,status,offering_id,professional_profile_id,modality").eq("id", first.data.id).single();
check("pedido persistido com horário", !requestRowError && requestRow.appointment_slot_id === slotOne && requestRow.status === "recebida", requestRowError?.code);
const confirmation = await rpc(admin, "confirm_appointment_request_reservation", { p_request_id: requestRow.id, p_expected_updated_at: requestRow.updated_at, p_idempotency_key: `m2c-confirm-${suffix}`, p_schedule: { starts_at: starts.toISOString(), ends_at: ends.toISOString(), room_id: null, notes: "Homologação M2C", offering_id: ids.offering, professional_profile_id: ids.professional, client_profile_id: ids.clientA } });
check("admin confirma reserva operacional", !confirmation.error && confirmation.data?.result?.request_id === requestRow.id, confirmation.error?.code);
const { data: confirmed, error: confirmedError } = await service.from("appointment_requests").select("status,reservation_schedule_id").eq("id", requestRow.id).single();
check("pedido confirmado e vinculado à agenda", !confirmedError && confirmed.status === "encerrada" && Boolean(confirmed.reservation_schedule_id), confirmedError?.code);

const startThree = new Date(starts.valueOf() + 4 * 3600000), endThree = new Date(startThree.valueOf() + 3600000);
const slotThree = await createSlot(startThree, endThree);
const cancelRequest = await rpc(clientA, "submit_appointment_slot_request", { p_idempotency_key: crypto.randomUUID(), p_slot_id: slotThree });
check("pedido cancelável criado", !cancelRequest.error, cancelRequest.error?.code);
const cancelled = await rpc(clientA, "cancel_my_appointment_request", { p_request_id: cancelRequest.data.id });
check("cliente cancela o próprio pedido", !cancelled.error && cancelled.data?.status === "cancelada", cancelled.error?.code);
const { data: released, error: releasedError } = await service.from("appointment_slots").select("status,held_by_request_id").eq("id", slotThree).single();
check("cancelamento libera horário", !releasedError && released.status === "available" && released.held_by_request_id === null, releasedError?.code);

await operations.refresh();
const room = await operations.command("room.save", { code: `M2C-${suffix}`, name: `Sala sintética M2C ${suffix}`,
  status: "available", capacity: 2, opens_at: "08:00", closes_at: "20:00" });
const inPersonOffering = await operations.command("offering.save", { title: `Sessão presencial M2C ${suffix}`,
  definition_id: ids.definition, professional_id: ids.professional, mode: "presencial",
  capacity: 1, price_cents: 10000, active: true });
const inPersonStart = new Date(starts.valueOf() + 86400000);
const inPersonEnd = new Date(inPersonStart.valueOf() + 3600000);
const inPersonSlot = await rpc(admin, "create_appointment_slot", { p_details: {
  offering_id: inPersonOffering.id, professional_profile_id: ids.professional,
  room_id: room.id, starts_at: inPersonStart.toISOString(), ends_at: inPersonEnd.toISOString(),
} });
check("sala sintética permite horário presencial", !inPersonSlot.error && inPersonSlot.data?.status === "available", inPersonSlot.error?.code);
const inPersonRequest = await rpc(clientA, "submit_appointment_slot_request", {
  p_idempotency_key: crypto.randomUUID(), p_slot_id: inPersonSlot.data.id,
});
check("cliente solicita atendimento presencial", !inPersonRequest.error, inPersonRequest.error?.code);
const inPersonRow = await service.from("appointment_requests").select("id,updated_at,status")
  .eq("id", inPersonRequest.data.id).single();
check("pedido presencial persistido", !inPersonRow.error && inPersonRow.data.status === "recebida", inPersonRow.error?.code);
const inPersonConfirmation = await rpc(admin, "confirm_appointment_request_reservation", {
  p_request_id: inPersonRow.data.id, p_expected_updated_at: inPersonRow.data.updated_at,
  p_idempotency_key: `m2c-presencial-${suffix}`,
  p_schedule: { starts_at: inPersonStart.toISOString(), ends_at: inPersonEnd.toISOString(),
    room_id: room.id, notes: "Homologação presencial M2C", offering_id: inPersonOffering.id,
    professional_profile_id: ids.professional, client_profile_id: ids.clientA },
});
check("admin confirma reserva presencial", !inPersonConfirmation.error
  && Boolean(inPersonConfirmation.data?.result?.schedule_id), inPersonConfirmation.error?.code);
const presencialSchedule = await service.from("op_records").select("document")
  .eq("collection", "schedule_items").eq("id", inPersonConfirmation.data.result.schedule_id).single();
check("agenda operacional vincula sala sintética", !presencialSchedule.error
  && presencialSchedule.data.document.room_id === room.id, presencialSchedule.error?.code);

const { data: history, error: historyError } = await rpc(clientA, "list_my_appointment_requests", {});
check("Meu Potala mostra confirmação e cancelamento", !historyError
  && history.some((row) => row.id === requestRow.id && row.status === "encerrada" && row.reservation_schedule_id)
  && history.some((row) => row.id === cancelRequest.data.id && row.status === "cancelada"), historyError?.code);
const startFour = new Date(starts.valueOf() + 6 * 3600000), endFour = new Date(startFour.valueOf() + 3600000);
const slotFour = await createSlot(startFour, endFour);
await operations.refresh();
const profile = operations.snapshot.profiles.find((row) => row.id === ids.professional);
await operations.command("person.save", { ...profile, active: false });
const afterDeactivate = await rpc(clientA, "submit_appointment_slot_request", {
  p_idempotency_key: crypto.randomUUID(), p_slot_id: slotFour,
});
check("profissional desativado não recebe solicitação", Boolean(afterDeactivate.error), afterDeactivate.error?.code);

const { data: ownEvents, error: ownEventsError } = await clientA.from("appointment_request_events")
  .select("request_id,event_type").in("request_id", [requestRow.id, cancelRequest.data.id]);
const { data: otherEvents, error: otherEventsError } = await clientB.from("appointment_request_events")
  .select("request_id,event_type").in("request_id", [requestRow.id, cancelRequest.data.id]);
check("histórico pertence somente ao cliente", !ownEventsError && !otherEventsError
  && ownEvents.some((row) => row.event_type === "confirmed")
  && ownEvents.some((row) => row.event_type === "cancelled") && otherEvents.length === 0,
  ownEventsError?.code || otherEventsError?.code);

console.log(JSON.stringify(evidence, null, 2));
