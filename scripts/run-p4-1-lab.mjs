import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

const ENV_PATH = process.env.POTALA_LAB_ENV || join(homedir(), "potala-lab.env");
const EXPECTED_PROJECT = "hmspabllgxqfzzricijv";

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
}

const env = parseEnv(await readFile(ENV_PATH, "utf8"));
const url = String(env.POTALA_LAB_URL || "").replace(/\/$/, "");
const anon = env.POTALA_LAB_ANON_KEY;
const service = env.POTALA_LAB_SERVICE_ROLE_KEY;
if (!url.includes(EXPECTED_PROJECT) || !anon || !service) throw new Error("Destino de laboratório inválido ou configuração incompleta.");

const marker = `p4-1-${Date.now()}-${randomBytes(3).toString("hex")}`;
const email = `${marker}@example.test`;
const newsletterEmail = `${marker}-newsletter@example.test`;
const password = randomBytes(24).toString("base64url") + "Aa1!";
const created = { userId: null, postId: marker, commentId: null, interestIds: [], newsletterEmail };
const results = [];

function record(name, pass, evidence = "") {
  results.push({ name, status: pass ? "PASS" : "FAIL", evidence });
  if (!pass) throw new Error(`${name}: ${evidence}`);
}

async function request(path, { key = anon, token = null, method = "GET", body, headers = {}, expected = [200, 201, 204] } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!expected.includes(response.status)) {
    const error = new Error(`HTTP ${response.status}: ${data?.message || data?.msg || "falha"}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return { status: response.status, data, headers: response.headers };
}

async function expectDenied(name, action, statuses, code) {
  try {
    await action();
    record(name, false, "a operação foi aceita");
  } catch (error) {
    const statusOk = statuses.includes(error.status);
    const codeOk = !code || error.data?.code === code;
    record(name, statusOk && codeOk, `HTTP ${error.status}; código ${error.data?.code || "ausente"}`);
  }
}

const admin = (path, options = {}) => request(path, { key: service, token: service, ...options });
const publicRequest = (path, options = {}) => request(path, { key: anon, ...options });
const authenticated = (token, path, options = {}) => request(path, { key: anon, token, ...options });

try {
  const authUser = await admin("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  created.userId = authUser.data.id;
  record("Auth sintético criado no laboratório", Boolean(created.userId));

  await admin("/rest/v1/users", { method: "POST", body: { id: created.userId, email, name: "P4.1 QA", role: "owner", active: true } });
  const session = await publicRequest("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  const token = session.data.access_token;
  record("Sessão JWT real obtida", Boolean(token));

  const postDocument = { id: marker, slug: marker, title: "Post sintético P4.1", status: "published", featured: false, publishedAt: "2026-10-28", content: [] };
  await admin("/rest/v1/blog_posts", { method: "POST", body: { id: marker, slug: marker, status: "published", featured: false, published_at: "2026-10-28", document: postDocument } });

  const courseBody = { kind: "curso", subject: marker, details: { topic: "Tema sintético", modality: "Online", availability: ["Noite"] }, page: "/cursos.html" };
  const submitInterest = (body, submissionKey, token = null) => (token ? authenticated(token, "/rest/v1/rpc/submit_site_interest", { method: "POST", body: {
    p_kind: body.kind, p_subject: body.subject, p_details: body.details, p_page: body.page, p_submission_key: submissionKey,
  } }) : publicRequest("/rest/v1/rpc/submit_site_interest", { method: "POST", body: {
    p_kind: body.kind, p_subject: body.subject, p_details: body.details, p_page: body.page, p_submission_key: submissionKey,
  } }));
  const courseKey = `site-${marker}-course`;
  await submitInterest(courseBody, courseKey);
  record("RPC como anon é permitida", true);
  const firstCourse = await admin(`/rest/v1/site_interests?subject=eq.${encodeURIComponent(marker)}&kind=eq.curso&select=id,kind`);
  record("Interesse em curso persiste", firstCourse.data?.length === 1 && firstCourse.data[0].kind === "curso");

  await submitInterest(courseBody, courseKey);
  const duplicateRows = await admin(`/rest/v1/site_interests?subject=eq.${encodeURIComponent(marker)}&select=id`);
  results.push({ name: "Idempotência de interesse repetido", status: duplicateRows.data.length === 1 ? "PASS" : "FAIL", evidence: `${duplicateRows.data.length} registros para duas requisições iguais` });

  const concurrentKey = `site-${marker}-concurrent`;
  await Promise.all([submitInterest(courseBody, concurrentKey), submitInterest(courseBody, concurrentKey)]);
  const concurrentRows = await admin(`/rest/v1/site_interests?submission_key=eq.${encodeURIComponent(concurrentKey)}&select=id`);
  record("Concorrência mantém uma única linha", concurrentRows.data.length === 1, `${concurrentRows.data.length} registro(s)`);

  await expectDenied("Mesma chave com payload divergente é rejeitada", () => submitInterest({ ...courseBody, subject: `${marker}-diferente` }, courseKey), [409], "23505");
  const unchanged = await admin(`/rest/v1/site_interests?submission_key=eq.${encodeURIComponent(courseKey)}&select=subject`);
  record("Conflito não altera a linha original", unchanged.data.length === 1 && unchanged.data[0].subject === marker);

  await expectDenied("Chave inválida é rejeitada", () => submitInterest(courseBody, "curta"), [400], "22023");
  await expectDenied("Tipo inválido é rejeitado", () => submitInterest({ ...courseBody, kind: "invalido" }, `site-${marker}-invalid-kind`), [400], "22023");
  await expectDenied("JSON não objeto é rejeitado", () => submitInterest({ ...courseBody, details: [] }, `site-${marker}-invalid-json`), [400], "22023");

  const directBody = { kind: "curso", subject: `${marker}-direct`, details: {}, page: "/cursos.html" };
  await expectDenied("INSERT direto como anon é negado", () => publicRequest("/rest/v1/site_interests", { method: "POST", body: directBody }), [401, 403]);
  await expectDenied("INSERT direto como authenticated é negado", () => authenticated(token, "/rest/v1/site_interests", { method: "POST", body: directBody }), [401, 403]);
  await submitInterest({ ...courseBody, subject: `${marker}-auth-rpc` }, `site-${marker}-auth-rpc`, token);
  record("RPC como authenticated é permitida", true);

  try {
    const publicRead = await publicRequest(`/rest/v1/site_interests?subject=like.${encodeURIComponent(marker)}*&select=id`);
    record("SELECT público não expõe recebimentos", Array.isArray(publicRead.data) && publicRead.data.length === 0, `HTTP ${publicRead.status}; ${publicRead.data?.length || 0} linha(s)`);
  } catch (error) {
    record("SELECT público não expõe recebimentos", [401, 403].includes(error.status), `HTTP ${error.status}; código ${error.data?.code || "ausente"}`);
  }

  await submitInterest({ kind: "retorno-recepcao", subject: marker, details: { answer: "partial" }, page: "/recepcao.html" }, `site-${marker}-reception`);
  const reception = await admin(`/rest/v1/site_interests?subject=eq.${encodeURIComponent(marker)}&kind=eq.retorno-recepcao&select=id,kind`);
  record("Feedback da Recepção persiste", reception.data?.length === 1);

  await submitInterest({ kind: "experiencia-cultural", subject: marker, details: { slug: "experiencia-sintetica" }, page: "/experiencias-culturais.html" }, `site-${marker}-culture`);
  const culture = await admin(`/rest/v1/site_interests?subject=eq.${encodeURIComponent(marker)}&kind=eq.experiencia-cultural&select=id,kind`);
  record("Interesse cultural persiste", culture.data?.length === 1);

  await publicRequest("/rest/v1/rpc/subscribe_newsletter", { method: "POST", body: { p_email: newsletterEmail, p_source: "blog" } });
  await publicRequest("/rest/v1/rpc/subscribe_newsletter", { method: "POST", body: { p_email: newsletterEmail.toUpperCase(), p_source: "blog" } });
  const subscriptions = await admin(`/rest/v1/newsletter_subscriptions?email=eq.${encodeURIComponent(newsletterEmail)}&select=id,email`);
  record("Newsletter é idempotente e normalizada", subscriptions.data.length === 1 && subscriptions.data[0].email === newsletterEmail);

  const xssText = `<img src=x onerror=alert('${marker}')> reflexão sintética`;
  await publicRequest("/rest/v1/blog_comments", { method: "POST", body: { post_slug: marker, author_name: marker, body: xssText }, headers: { Prefer: "return=minimal" } });
  const comment = await admin(`/rest/v1/blog_comments?author_name=eq.${encodeURIComponent(marker)}&select=id,status`);
  created.commentId = comment.data?.[0]?.id;
  record("Comentário nasce pendente", comment.data?.length === 1 && comment.data[0].status === "pending");

  const publicPending = await publicRequest(`/rest/v1/blog_comments?id=eq.${created.commentId}&select=id`);
  record("Comentário pendente não é público", publicPending.data.length === 0);

  const adminInterests = await authenticated(token, `/rest/v1/site_interests?subject=eq.${encodeURIComponent(marker)}&select=id,kind,subject,details,page,created_at`);
  record("Administração lê interesses e feedback", adminInterests.data.length >= 4, `${adminInterests.data.length} registros relacionados`);
  const adminComments = await authenticated(token, `/rest/v1/blog_comments?id=eq.${created.commentId}&select=id,status,body`);
  record("Administração lê comentário pendente", adminComments.data.length === 1 && adminComments.data[0].status === "pending");

  await authenticated(token, `/rest/v1/blog_comments?id=eq.${created.commentId}`, { method: "PATCH", body: { status: "approved", reviewed_at: new Date().toISOString() }, headers: { Prefer: "return=representation" } });
  const publicApproved = await publicRequest(`/rest/v1/blog_comments?id=eq.${created.commentId}&select=id,body,status`);
  record("Comentário aparece somente após aprovação", publicApproved.data.length === 1 && publicApproved.data[0].status === "approved");
  record("Conteúdo não confiável permanece texto no banco", publicApproved.data[0].body === xssText);

  await authenticated(token, `/rest/v1/blog_comments?id=eq.${created.commentId}`, { method: "PATCH", body: { status: "rejected", reviewed_at: new Date().toISOString() }, headers: { Prefer: "return=representation" } });
  const publicRejected = await publicRequest(`/rest/v1/blog_comments?id=eq.${created.commentId}&select=id`);
  record("Comentário rejeitado deixa de ser público", publicRejected.data.length === 0);

  const count = await authenticated(token, "/rest/v1/newsletter_subscriptions?select=id", { method: "HEAD", headers: { Prefer: "count=exact" } });
  record("Administração pode contar newsletter", Number(count.headers.get("content-range")?.split("/")[1]) >= 1);
} finally {
  // Evidências são preservadas. A limpeza é uma operação posterior e explícita.
}

console.log(JSON.stringify({ project: EXPECTED_PROJECT, marker, results, cleanup: "pendente e explícita" }, null, 2));
if (results.some(({ status }) => status === "FAIL")) process.exitCode = 2;
