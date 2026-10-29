import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PROJECT = "hmspabllgxqfzzricijv";
const url = String(process.env.POTALA_LAB_URL || "").replace(/\/$/, "");
const anon = process.env.POTALA_LAB_ANON_KEY;
const service = process.env.POTALA_LAB_SERVICE_ROLE_KEY;
if (url !== `https://${PROJECT}.supabase.co` || !anon || !service) throw new Error("Destino ou credenciais do laboratório ausentes/divergentes.");

const evidence = { project: PROJECT, startedAt: new Date().toISOString(), checks: [] };
const check = (name, ok, detail = "") => {
  evidence.checks.push({ name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) throw new Error(`${name}: ${detail}`);
};
const blocked = (name, detail) => evidence.checks.push({ name, status: "BLOCKED", detail });

async function request(path, { key = anon, token = key, method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

const stamp = Date.now().toString(36);
const password = () => `T01!${randomBytes(18).toString("base64url")}a9`;
const users = ["a", "b"].map((suffix) => ({ email: `m2-t01-${stamp}-${suffix}@example.com`, password: password(), name: `Pessoa T01 ${suffix.toUpperCase()}` }));

for (const user of users) {
  const signup = await request("/auth/v1/signup", { method: "POST", body: { email: user.email, password: user.password, data: { full_name: user.name } } });
  if ([200, 201].includes(signup.status) && signup.data?.id) {
    evidence.checks.push({ name: `cadastro_${user.name.at(-1)}`, status: "PASS", detail: `HTTP ${signup.status}` });
    user.id = signup.data.id;
    user.awaitingConfirmation = !signup.data.access_token;
  } else {
    blocked(`cadastro_publico_${user.name.at(-1)}`, `HTTP ${signup.status}; limite/configuração do Auth`);
    const created = await request("/auth/v1/admin/users", { key: service, token: service, method: "POST", body: { email: user.email, password: user.password, email_confirm: false, user_metadata: { full_name: user.name } } });
    check(`identidade_sintetica_${user.name.at(-1)}`, created.status === 200 && created.data?.id, `HTTP ${created.status}`);
    user.id = created.data.id;
    user.awaitingConfirmation = true;
  }
  const confirm = await request(`/auth/v1/admin/users/${user.id}`, { key: service, token: service, method: "PUT", body: { email_confirm: true } });
  check(`confirmacao_${user.name.at(-1)}`, confirm.status === 200 && confirm.data?.email_confirmed_at, `HTTP ${confirm.status}`);
  const login = await request("/auth/v1/token?grant_type=password", { method: "POST", body: { email: user.email, password: user.password } });
  check(`login_${user.name.at(-1)}`, login.status === 200 && login.data?.access_token && login.data?.refresh_token, `HTTP ${login.status}`);
  user.token = login.data.access_token;
  user.refresh = login.data.refresh_token;
}

const [a, b] = users;
const auth = (user, path, options = {}) => request(path, { ...options, token: user.token });

const profileA = await auth(a, `/rest/v1/profiles?id=eq.${a.id}&select=id,display_name,city,bio,interests`);
check("perfil_criado_por_trigger", profileA.status === 200 && profileA.data?.length === 1, `HTTP ${profileA.status}; rows ${profileA.data?.length}`);
const updateA = await auth(a, `/rest/v1/profiles?id=eq.${a.id}`, { method: "PATCH", body: { display_name: "Pessoa A T01", city: "São Paulo", bio: "Perfil sintético de homologação", interests: ["Leitura", "Yoga"] }, headers: { Prefer: "return=representation" } });
check("perfil_editavel", updateA.status === 200 && updateA.data?.length === 1, `HTTP ${updateA.status}`);

const address = await auth(a, "/rest/v1/user_addresses", { method: "POST", body: { label: "Laboratório", recipient_name: "Pessoa A T01", postal_code: "01001-000", street: "Rua Sintética", number: "1", complement: "", district: "Centro", city: "São Paulo", state: "SP", is_primary: true }, headers: { Prefer: "return=representation" } });
check("endereco_persistido", address.status === 201 && address.data?.length === 1, `HTTP ${address.status}`);

const privacy = await auth(a, "/rest/v1/privacy_preferences?on_conflict=user_id", { method: "POST", body: { history_enabled: false, personalization_enabled: true, analytics_consent: false, commercial_communications: false }, headers: { Prefer: "resolution=merge-duplicates,return=representation" } });
check("privacidade_persistida", [200, 201].includes(privacy.status) && privacy.data?.length === 1, `HTTP ${privacy.status}`);

const saved = await auth(a, "/rest/v1/saved_items", { method: "POST", body: { item_type: "pagina", item_ref: `t01-${stamp}`, title: "Evidência T01", href: "/transcendido.html" }, headers: { Prefer: "return=representation" } });
check("favorito_persistido", saved.status === 201 && saved.data?.length === 1, `HTTP ${saved.status}`);

const crossProfile = await auth(a, `/rest/v1/profiles?id=eq.${b.id}&select=id`);
check("isolamento_perfil_a_nao_le_b", crossProfile.status === 200 && crossProfile.data?.length === 0, `HTTP ${crossProfile.status}; rows ${crossProfile.data?.length}`);
const crossSaved = await auth(b, `/rest/v1/saved_items?item_ref=eq.t01-${stamp}&select=id`);
check("isolamento_b_nao_le_salvo_a", crossSaved.status === 200 && crossSaved.data?.length === 0, `HTTP ${crossSaved.status}; rows ${crossSaved.data?.length}`);
const forged = await auth(a, "/rest/v1/user_addresses", { method: "POST", body: { user_id: b.id, label: "Ataque", recipient_name: "Outro", postal_code: "01001-000", street: "Rua X", number: "2", district: "Centro", city: "São Paulo", state: "SP" } });
check("isolamento_a_nao_grava_b", [401, 403].includes(forged.status), `HTTP ${forged.status}`);

const activities = await auth(a, "/rest/v1/account_activity?select=action&order=occurred_at.desc");
const actions = new Set((activities.data || []).map((row) => row.action));
check("trilha_servidor", activities.status === 200 && ["profile_updated", "address_created", "privacy_updated"].every((item) => actions.has(item)), `HTTP ${activities.status}; actions ${actions.size}`);
const fakeActivity = await auth(a, "/rest/v1/account_activity", { method: "POST", body: { user_id: a.id, action: "password_changed" } });
check("trilha_nao_forjavel", [401, 403, 404].includes(fakeActivity.status), `HTTP ${fakeActivity.status}`);

const publicPrivate = await request("/rest/v1/profiles?select=id");
check("anon_nao_le_perfis", [401, 403].includes(publicPrivate.status) || (publicPrivate.status === 200 && publicPrivate.data?.length === 0), `HTTP ${publicPrivate.status}`);
const adminSurface = await auth(a, "/rest/v1/users?select=id,role,active");
check("usuario_comum_sem_admin", adminSurface.status === 200 && adminSurface.data?.length === 0, `HTTP ${adminSurface.status}; rows ${adminSurface.data?.length}`);

const refresh = await request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: a.refresh } });
check("sessao_persistente_renovavel", refresh.status === 200 && refresh.data?.access_token, `HTTP ${refresh.status}`);

const recover = await request("/auth/v1/recover", { method: "POST", body: { email: a.email } });
if (recover.status === 200) evidence.checks.push({ name: "recuperacao_aceita_sem_enumerar", status: "PASS", detail: "HTTP 200" });
else if (recover.status === 429) blocked("recuperacao_aceita_sem_enumerar", "HTTP 429; limite de e-mail do Auth no laboratório");
else check("recuperacao_aceita_sem_enumerar", false, `HTTP ${recover.status}`);

evidence.emailDelivery = "BLOCKED: domínio reservado example.com não representa destinatário autorizado; endpoint Auth foi exercitado sem validar entrega SMTP.";
evidence.syntheticUsers = users.map((user) => ({ idSuffix: user.id.slice(-8), awaitingConfirmationInitially: user.awaitingConfirmation }));
evidence.finishedAt = new Date().toISOString();
const output = join(tmpdir(), `potala-m2-t01-${stamp}.json`);
await writeFile(output, JSON.stringify(evidence, null, 2), "utf8");
const passed = evidence.checks.filter((item) => item.status === "PASS").length;
const blockedCount = evidence.checks.filter((item) => item.status === "BLOCKED").length;
console.log(`T-01 LAB PASS ${passed}; BLOCKED ${blockedCount}`);
console.log(`Evidence: ${output}`);
