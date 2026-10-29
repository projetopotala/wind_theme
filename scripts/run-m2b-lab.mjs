import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createOperationsClient } from "../outputs/js/admin/operations/client.js";

const EXPECTED_PROJECT = "hmspabllgxqfzzricijv";
const envPath = process.env.POTALA_LAB_ENV || "C:/Users/vicel/potala-lab.env";
const parsed = Object.fromEntries(fs.readFileSync(envPath, "utf8")
  .split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#") && line.includes("="))
  .map(line => { const at = line.indexOf("="); return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
const url = parsed.POTALA_LAB_URL;
const anonKey = parsed.POTALA_LAB_ANON_KEY;
const serviceKey = parsed.POTALA_LAB_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Variáveis do laboratório incompletas.");
const target = new URL(url);
if (target.protocol !== "https:" || target.hostname !== `${EXPECTED_PROJECT}.supabase.co`) {
  throw new Error("Destino recusado: este runner aceita somente o laboratório autorizado.");
}

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(url, serviceKey, options);
const visitor = createClient(url, anonKey, options);
const suffix = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
const password = crypto.randomBytes(24).toString("base64url") + "Aa1!";
const adminEmail = `m2b-admin-${suffix}@example.test`;
const commonEmail = `m2b-common-${suffix}@example.test`;
const evidence = { project: EXPECTED_PROJECT, run: suffix, checks: [] };
const check = (name, ok, detail = "") => {
  evidence.checks.push({ name, ok, detail });
  if (!ok) throw new Error(`${name}: ${detail || "FAIL"}`);
};
const createSyntheticUser = async (email) => {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { synthetic: true, suite: "m2b" } });
  if (error) throw error;
  return data.user;
};
const signIn = async (email) => {
  const client = createClient(url, anonKey, options);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
};

const adminUser = await createSyntheticUser(adminEmail);
await createSyntheticUser(commonEmail);
const { error: profileError } = await service.from("users").insert({ id: adminUser.id, email: adminEmail, name: "Admin sintético M2B", role: "admin", active: true });
if (profileError) throw profileError;
const admin = await signIn(adminEmail);
const common = await signIn(commonEmail);

const { data: adminGuard, error: adminGuardError } = await admin.rpc("is_portal_admin");
check("admin sintético reconhecido", !adminGuardError && adminGuard === true, adminGuardError?.code);
const { data: commonGuard, error: commonGuardError } = await common.rpc("is_portal_admin");
check("usuário comum não é admin", !commonGuardError && commonGuard === false, commonGuardError?.code);
const { error: commonSnapshotError } = await common.rpc("op_snapshot");
check("usuário comum bloqueado na operação", commonSnapshotError?.code === "42501", commonSnapshotError?.code);
const { error: publicTableError } = await visitor.from("op_records").select("collection,id").limit(1);
check("tabela operacional não é pública", Boolean(publicTableError), publicTableError?.code);

const ids = { profile: `m2b-prof-${suffix}`, definition: `m2b-def-${suffix}`, offering: `m2b-offer-${suffix}`, schedule: `m2b-slot-${suffix}` };
const idQueue = [ids.profile, ids.definition, ids.offering, ids.schedule];
const operations = createOperationsClient({ client: admin, id: () => idQueue.shift() || `m2b-${crypto.randomUUID()}`, agora: () => new Date().toISOString() });
await operations.refresh();
const profile = await operations.command("person.save", {
  display_name: `Profissional Sintético ${suffix}`, email: "", roles: ["professional"],
  professional_title: "Terapeuta de homologação", presentation: "Perfil sintético criado para homologação da Frente B.",
  education: "Formação sintética", specialties: ["Acupuntura"], practice_areas: ["corpo"], modalities: ["online", "presencial"],
  price_cents: 15000, availability: "Terças, das 14h às 17h", active: true, published: false,
});
check("cadastro administrativo persistido", profile.id === ids.profile);
const definition = await operations.command("definition.save", { title: `Atendimento sintético ${suffix}`, kind: "appointment" });
check("serviço base persistido", definition.id === ids.definition);
const offering = await operations.command("offering.save", {
  title: `Sessão sintética ${suffix}`, definition_id: ids.definition, professional_id: ids.profile,
  mode: "online", capacity: 1, price_cents: 17500, description: "Oferta sintética", active: true,
});
check("serviço vinculado ao profissional", offering.professional_id === ids.profile && offering.price_cents === 17500);
const slot = await operations.command("schedule.save", {
  title: `Disponibilidade sintética ${suffix}`, mode: "online", professional_id: ids.profile,
  offering_id: ids.offering, starts_at: "2027-01-12T14:00:00-03:00", ends_at: "2027-01-12T15:00:00-03:00", participants: 1,
});
check("disponibilidade persistida", slot.id === ids.schedule);

await operations.command("person.save", { ...profile, presentation: "Perfil sintético atualizado e publicado.", published: true });
const { data: published, error: publishedError } = await visitor.rpc("list_published_professionals");
const visible = Array.isArray(published) ? published.find(item => item.id === ids.profile) : null;
check("consulta pública retorna perfil publicado", !publishedError && visible?.presentation.includes("atualizado"), publishedError?.code);
check("consulta pública retorna serviço e valor", visible?.services?.some(item => item.id === ids.offering && item.price_cents === 17500));
check("projeção não expõe contato privado", visible && !("email" in visible) && !("phone" in visible));

await operations.command("person.save", { ...operations.snapshot.profiles.find(item => item.id === ids.profile), active: false });
const { data: afterDeactivate, error: deactivateError } = await visitor.rpc("list_published_professionals");
check("perfil desativado some da consulta pública", !deactivateError && !afterDeactivate.some(item => item.id === ids.profile), deactivateError?.code);
const finalSnapshot = await operations.refresh();
check("registro desativado preservado no administrativo", finalSnapshot.profiles.some(item => item.id === ids.profile && item.active === false));
check("agenda permanece vinculada por professional_id", finalSnapshot.schedule_items.some(item => item.id === ids.schedule && item.professional_id === ids.profile));

evidence.summary = { passed: evidence.checks.filter(item => item.ok).length, total: evidence.checks.length, syntheticUsers: 2, preservedRecords: 4 };
console.log(JSON.stringify(evidence, null, 2));
