/*
 * Guarda de ambiente do Supabase.
 *
 *   node scripts/ambiente-supabase.mjs auto           (usado no build)
 *   node scripts/ambiente-supabase.mjs producao       (barra tudo que lembre o LAB ou o uso local)
 *   node scripts/ambiente-supabase.mjs lab            (confere o pacote da Preview LAB)
 *   node scripts/ambiente-supabase.mjs preparar-lab   (gera os dados do LAB em outputs/ e confere)
 *
 * Os dados do LAB vêm de variáveis de ambiente (LAB_SUPABASE_PROJECT_REF,
 * LAB_SUPABASE_URL, LAB_SUPABASE_PUBLISHABLE_KEY) ou, na falta delas, de
 * ops/lab-preview/ambiente-lab.local.json (ignorado pelo Git). Só valores públicos.
 * Nunca imprime chaves.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { HOSTS_OFICIAIS, HOST_LAB, PROJETO_PRODUCAO, PUBLICAVEL_PRODUCAO, escolherAmbiente } from "../outputs/js/supabase/ambiente.js";

// Projetos que nunca podem aparecer em um pacote de produção.
export const PROJETOS_BLOQUEADOS_EM_PRODUCAO = Object.freeze(["hmspabllgxqfzzricijv"]);
export const ARQUIVO_LAB = "js/supabase/ambiente-lab.js";
export const ARQUIVO_LOCAL = "js/supabase/ambiente-local.js";
export const ARQUIVO_PREVIEW_E2E = "js/preview/ambiente-e2e.js";
export const FONTE_LAB_JSON = "ops/lab-preview/ambiente-lab.local.json";
const HOST_LAB_PROJETO = "wind-theme-m2-lab-preview.vercel.app";

const EXTENSOES = new Set([".js", ".mjs", ".html", ".json", ".css", ".map", ".txt", ".svg", ".xml"]);
const LIMITE_BYTES = 4 * 1024 * 1024;
const raizPadrao = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function* arquivos(pasta) {
  for (const nome of readdirSync(pasta)) {
    if (nome === "node_modules" || nome === ".git") continue;
    const caminho = join(pasta, nome);
    const info = statSync(caminho);
    if (info.isDirectory()) yield* arquivos(caminho);
    else if (EXTENSOES.has(extname(nome).toLowerCase()) && info.size <= LIMITE_BYTES) yield caminho;
  }
}

function jwtDeServico(texto) {
  for (const m of texto.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g)) {
    try {
      const corpo = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"));
      if (corpo?.role === "service_role") return true;
    } catch { /* não é JWT */ }
  }
  return false;
}

/* Varre outputs/ e devolve a lista de problemas (vazia = limpo). */
export function varrerSaida(pastaSaida, { permitirLab = false, permitirPreviewE2E = false } = {}) {
  const problemas = [];
  if (!permitirLab && existsSync(join(pastaSaida, ARQUIVO_LAB))) problemas.push(`${ARQUIVO_LAB} não pode existir em um pacote de produção`);
  // A configuração local nunca pertence a um pacote publicado, em nenhum modo.
  if (existsSync(join(pastaSaida, ARQUIVO_LOCAL))) problemas.push(`${ARQUIVO_LOCAL} é só para uso local e não pode existir em um pacote publicado`);
  if (!permitirPreviewE2E && existsSync(join(pastaSaida, ARQUIVO_PREVIEW_E2E))) problemas.push(`${ARQUIVO_PREVIEW_E2E} só pode existir na Preview E2E autorizada`);
  for (const caminho of arquivos(pastaSaida)) {
    const rel = relative(pastaSaida, caminho).replaceAll("\\", "/");
    const texto = readFileSync(caminho, "utf8");
    if (!permitirLab) {
      for (const ref of PROJETOS_BLOQUEADOS_EM_PRODUCAO) {
        if (texto.includes(ref)) problemas.push(`${rel}: identificador do projeto LAB`);
      }
    }
    if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(texto)) problemas.push(`${rel}: chave secreta do Supabase`);
    if (jwtDeServico(texto)) problemas.push(`${rel}: JWT com papel service_role`);
  }
  return problemas;
}

/* Confere a decisão efetiva de ambiente, como o navegador a faria. */
export async function conferirDecisao(raiz, { modo, permitirPreviewE2E = false }) {
  const problemas = [];
  for (const host of HOSTS_OFICIAIS) {
    const c = escolherAmbiente({ origem: `https://${host}` });
    if (c.projectRef !== PROJETO_PRODUCAO || c.ambiente !== "producao" || c.siteUrl !== `https://${host}`) problemas.push(`host oficial "${host}" não resolve para produção com retorno próprio`);
  }
  // Nada além do oficial pode chegar à produção, nem sem configuração.
  for (const origem of ["https://wind-theme-abc123-potala.vercel.app", "https://outro.exemplo.com", "http://wind-theme.vercel.app", "https://wind-theme.vercel.app.evil.com", "null", ""]) {
    try { escolherAmbiente({ origem }); problemas.push(`origem "${origem}" não deveria receber configuração`); } catch { /* esperado */ }
  }
  for (const origem of [`https://${HOST_LAB_PROJETO}`, "http://localhost:3000"]) {
    try { escolherAmbiente({ origem }); problemas.push(`origem ${origem} sem configuração explícita não falha fechado`); } catch { /* esperado */ }
  }
  if (modo === "lab") {
    const arquivo = join(raiz, "outputs", ARQUIVO_LAB);
    if (!existsSync(arquivo)) { problemas.push(`${ARQUIVO_LAB} ausente (rode npm run lab:preparar)`); return problemas; }
    const { AMBIENTE_LAB } = await import(`${pathToFileURL(arquivo).href}?v=${Date.now()}`);
    for (const host of [HOST_LAB_PROJETO, "wind-theme-m2-lab-preview-abc123-potala.vercel.app"]) {
      try {
        const c = escolherAmbiente({ origem: `https://${host}`, overlayLab: AMBIENTE_LAB });
        if (c.ambiente !== "lab" || c.projectRef === PROJETO_PRODUCAO || c.siteUrl !== `https://${host}`) problemas.push(`host ${host} não resolve para o LAB`);
      } catch (erro) { problemas.push(`dados do LAB inválidos: ${erro.message}`); break; }
    }
  }
  if (permitirPreviewE2E) {
    const arquivo = join(raiz, "outputs", ARQUIVO_PREVIEW_E2E);
    if (!existsSync(arquivo)) problemas.push(`${ARQUIVO_PREVIEW_E2E} ausente na Preview E2E autorizada`);
    else {
      const { AMBIENTE_E2E } = await import(`${pathToFileURL(arquivo).href}?v=${Date.now()}`);
      try {
        const c = escolherAmbiente({ origem: AMBIENTE_E2E.origin, overlayPreview: AMBIENTE_E2E });
        if (c.ambiente !== "preview-e2e" || c.projectRef !== PROJETO_PRODUCAO
          || c.siteUrl !== AMBIENTE_E2E.origin || c.appointments.publicRequests !== false
          || !c.appointments.authenticatedRequests || !c.appointments.admin || !c.appointments.reservations) {
          problemas.push("perfil da Preview E2E não preserva os gates autorizados");
        }
      } catch (erro) { problemas.push(`dados da Preview E2E inválidos: ${erro.message}`); }
    }
  }
  return problemas;
}

export function previewE2EAtiva(env = process.env) {
  return env.POTALA_APPOINTMENT_E2E_PREVIEW === "true"
    && env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === "codex/appointments-livekit-production"
    && env.VERCEL_PROJECT_PRODUCTION_URL === "wind-theme.vercel.app"
    && /^wind-theme-[a-z0-9]+-potala\.vercel\.app$/.test(String(env.VERCEL_URL || ""));
}

export function prepararPreviewE2E({ raiz = raizPadrao, env = process.env } = {}) {
  const destino = join(raiz, "outputs", ARQUIVO_PREVIEW_E2E);
  if (!previewE2EAtiva(env)) {
    if (existsSync(destino)) rmSync(destino, { force: true });
    return null;
  }
  const origin = `https://${env.VERCEL_URL}`;
  const dados = {
    origin,
    projectRef: PROJETO_PRODUCAO,
    url: `https://${PROJETO_PRODUCAO}.supabase.co`,
    publishableKey: PUBLICAVEL_PRODUCAO,
    appointments: {
      authenticatedRequests: true,
      admin: true,
      reservations: true,
      publicRequests: false,
      turnstileSiteKey: "",
    },
  };
  // Contém somente URL, chave publicável e flags; nunca credenciais privadas.
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, `// Gerado somente no build protegido da Preview E2E. Não versionar.\nexport const AMBIENTE_E2E = Object.freeze(${JSON.stringify(dados, null, 2)});\n`);
  return destino;
}

export function modoAutomatico(env = process.env) {
  const hostProjeto = String(env.VERCEL_PROJECT_PRODUCTION_URL || "");
  return HOST_LAB.test(hostProjeto) ? "lab" : "producao";
}

export async function verificar(modo, { raiz = raizPadrao, env = process.env } = {}) {
  const pastaSaida = join(raiz, "outputs");
  if (modo === "auto") modo = modoAutomatico(env);
  const problemas = [];
  const permitirPreviewE2E = previewE2EAtiva(env);
  const hostProjeto = String(env.VERCEL_PROJECT_PRODUCTION_URL || "");
  if (modo === "producao" && HOST_LAB.test(hostProjeto)) problemas.push("o projeto Vercel LAB não pode rodar a verificação de produção");
  problemas.push(...varrerSaida(pastaSaida, { permitirLab: modo === "lab", permitirPreviewE2E }));
  problemas.push(...(await conferirDecisao(raiz, { modo, permitirPreviewE2E })));
  return { modo, problemas };
}

/* Lê os dados públicos do LAB: variáveis de ambiente primeiro, depois o JSON local ignorado pelo Git. */
export function lerDadosLab({ raiz = raizPadrao, env = process.env } = {}) {
  let dados;
  if (env.LAB_SUPABASE_PROJECT_REF || env.LAB_SUPABASE_URL || env.LAB_SUPABASE_PUBLISHABLE_KEY) {
    dados = { projectRef: env.LAB_SUPABASE_PROJECT_REF, url: env.LAB_SUPABASE_URL, publishableKey: env.LAB_SUPABASE_PUBLISHABLE_KEY };
  } else {
    const fonte = join(raiz, FONTE_LAB_JSON);
    if (!existsSync(fonte)) {
      throw new Error(`Dados do LAB ausentes: defina LAB_SUPABASE_PROJECT_REF, LAB_SUPABASE_URL e LAB_SUPABASE_PUBLISHABLE_KEY, ou crie ${FONTE_LAB_JSON} (veja ops/lab-preview/ambiente-lab.exemplo.json).`);
    }
    dados = JSON.parse(readFileSync(fonte, "utf8"));
  }
  const { projectRef, url, publishableKey } = dados;
  // Valida exatamente como o navegador validará; lança se algo estiver errado.
  escolherAmbiente({ origem: `https://${HOST_LAB_PROJETO}`, overlayLab: { projectRef, url, publishableKey } });
  return { projectRef, url, publishableKey };
}

export function prepararLab({ raiz = raizPadrao, env = process.env } = {}) {
  const dados = lerDadosLab({ raiz, env });
  const destino = join(raiz, "outputs", ARQUIVO_LAB);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, `// Gerado por npm run lab:preparar. Não versionar.\nexport const AMBIENTE_LAB = Object.freeze(${JSON.stringify(dados, null, 2)});\n`);
  return destino;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const comando = process.argv[2] || "auto";
  if (!["auto", "producao", "lab", "preparar-lab"].includes(comando)) {
    console.error("Uso: node scripts/ambiente-supabase.mjs <auto|producao|lab|preparar-lab>");
    process.exit(2);
  }
  try {
    prepararPreviewE2E();
    if (comando === "preparar-lab") prepararLab();
    const { modo, problemas } = await verificar(comando === "preparar-lab" ? "lab" : comando);
    if (problemas.length) {
      console.error(`Verificação de ambiente (${modo}) FALHOU:`);
      for (const p of problemas) console.error(` - ${p}`);
      process.exit(1);
    }
    console.log(`Verificação de ambiente (${modo}) OK.`);
  } catch (erro) {
    console.error(`Verificação de ambiente falhou: ${erro.message}`);
    process.exit(1);
  }
}
