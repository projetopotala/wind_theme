/*
 * AMBIENTE DO BANCO, DECIDIDO PELA ORIGEM DA PÁGINA — SEMPRE DE FORMA EXPLÍCITA.
 *
 * O portal é estático: não existe etapa de build que possa trocar valores. Por
 * isso o ambiente sai da origem em que a página está sendo servida, comparada
 * de forma EXATA (nunca por substring), e nunca de um valor editado à mão.
 *
 *   PRODUÇÃO     origem https:// com host em HOSTS_OFICIAIS  -> projeto de produção.
 *   LAB          origem https:// de HOST_LAB                 -> projeto LAB, e só ele.
 *   LOCAL        localhost / 127.0.0.1 / [::1]               -> exige ambiente-local.js
 *                (configuração explícita, fora do Git); nunca usa produção.
 *   DESCONHECIDO qualquer outra origem                       -> erro controlado; a página
 *                não se conecta a banco algum (nenhum login, leitura ou escrita).
 *
 * Os dados do LAB e do uso local nunca moram na main: o scripts/ambiente-supabase.mjs
 * os gera em outputs/ a partir de variáveis de ambiente ou de um JSON ignorado pelo
 * Git, e barra qualquer build de produção em que eles apareçam.
 *
 * Só valores públicos passam por aqui: URL do projeto e chave publicável.
 */

export const PROJETO_PRODUCAO = "gotrumwuimpoeggwamut";
// Origens oficiais autorizadas. Acrescente aqui o domínio próprio quando for aprovado.
export const HOSTS_OFICIAIS = Object.freeze(["wind-theme.vercel.app"]);
// Alias do projeto LAB e deployments isolados (wind-theme-m2-lab-preview-<id>-potala).
// Âncoras nas duas pontas: nada com prefixo ou sufixo acrescentado passa.
export const HOST_LAB = /^wind-theme-m2-lab-preview(?:-[a-z0-9]+-potala)?\.vercel\.app$/;
const HOST_LOCAL = /^(?:localhost|127\.0\.0\.1|\[::1\]|(?:[a-z0-9-]+\.)+localhost)$/;

export const PUBLICAVEL_PRODUCAO = "sb_publishable_daUl7ko5Dg-C5jO67g4sEQ_rGLbbu0e";
const REF = /^[a-z0-9]{20}$/;
const SEGREDO_NA_CHAVE = /sb_secret_|service_role/i;

export class ErroDeAmbiente extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.name = "ErroDeAmbiente";
    this.codigo = codigo;
  }
}

export const ehHostLab = (hostname) => HOST_LAB.test(String(hostname || ""));
export const ehHostLocal = (hostname) => HOST_LOCAL.test(String(hostname || ""));
export const ehHostOficial = (hostname) => HOSTS_OFICIAIS.includes(String(hostname || ""));

export function refDaUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const m = /^([a-z0-9]+)\.supabase\.co$/.exec(u.hostname);
  return m ? m[1] : null;
}

function origemValida(origem) {
  let u;
  try { u = new URL(String(origem || "")); } catch { return null; }
  if (u.origin === "null" || u.username || u.password) return null;
  return u;
}

/* Classifica a origem: "producao" | "lab" | "local" | "desconhecido". Comparação exata. */
export function classificarOrigem(origem) {
  const u = origemValida(origem);
  if (!u) return "desconhecido";
  if (u.protocol === "https:" && ehHostOficial(u.hostname) && !u.port) return "producao";
  if (u.protocol === "https:" && ehHostLab(u.hostname) && !u.port) return "lab";
  if ((u.protocol === "http:" || u.protocol === "https:") && ehHostLocal(u.hostname)) return "local";
  return "desconhecido";
}

function chaveSegura(chave) {
  const texto = String(chave || "");
  return texto.startsWith("sb_publishable_") && !SEGREDO_NA_CHAVE.test(texto);
}

// Valida o perfil final antes de entregá-lo ao restante do portal.
export function validarPerfil(perfil) {
  const ref = refDaUrl(perfil.url);
  if (!ref || ref !== perfil.projectRef) throw new TypeError("A URL do Supabase não corresponde ao projeto do ambiente.");
  if (!chaveSegura(perfil.publishableKey)) throw new TypeError("Use somente a chave publicável do Supabase no navegador.");
  const site = origemValida(perfil.siteUrl);
  if (!site || site.pathname !== "/" || site.search || site.hash) {
    throw new TypeError("A URL pública do portal deve ser uma origem, sem caminho.");
  }
  if (perfil.ambiente === "producao") {
    if (perfil.projectRef !== PROJETO_PRODUCAO || site.protocol !== "https:" || !ehHostOficial(site.hostname)) {
      throw new TypeError("Perfil de produção inconsistente.");
    }
  } else if (perfil.ambiente === "lab") {
    if (perfil.projectRef === PROJETO_PRODUCAO || site.protocol !== "https:" || !ehHostLab(site.hostname)) {
      throw new TypeError("Perfil LAB inconsistente.");
    }
  } else if (perfil.ambiente === "local") {
    if (perfil.projectRef === PROJETO_PRODUCAO || !ehHostLocal(site.hostname)) {
      throw new TypeError("Perfil local inconsistente: o uso local nunca aponta para a produção.");
    }
  } else if (perfil.ambiente === "preview-e2e") {
    if (perfil.projectRef !== PROJETO_PRODUCAO || site.protocol !== "https:"
      || perfil.origemAutorizada !== site.origin || !/^wind-theme-[a-z0-9]+-potala\.vercel\.app$/.test(site.hostname)) {
      throw new TypeError("Perfil da Preview E2E inconsistente.");
    }
  } else {
    throw new TypeError("Ambiente desconhecido.");
  }
  const appointments = Object.freeze({
    authenticatedRequests: perfil.appointments?.authenticatedRequests === true,
    admin: perfil.appointments?.admin === true,
    reservations: perfil.appointments?.reservations === true,
    publicRequests: perfil.appointments?.publicRequests === true,
    turnstileSiteKey: String(perfil.appointments?.turnstileSiteKey || ""),
  });
  return Object.freeze({ ...perfil, appointments });
}

function perfilExterno(ambiente, dados, origem, nomeArquivo) {
  if (!dados || typeof dados !== "object") {
    throw new ErroDeAmbiente(
      `${ambiente}-sem-configuracao`,
      `Ambiente ${ambiente.toUpperCase()} sem os dados de configuração (${nomeArquivo}): a página não se conecta a nenhum banco.`,
    );
  }
  const { projectRef, url, publishableKey } = dados;
  if (!REF.test(String(projectRef || ""))) throw new TypeError(`Identificador do projeto ${ambiente.toUpperCase()} inválido.`);
  return validarPerfil({ ambiente, projectRef, url, publishableKey, siteUrl: origem.origin });
}

/*
 * Regra única de decisão. Cada arquivo de configuração só é considerado no seu
 * próprio ambiente: em qualquer outra origem ele é ignorado e não desvia nada.
 * Sem origem conhecida não existe perfil: o resultado é um erro controlado.
 */
export function escolherAmbiente({ origem = "", overlayLab = null, overlayLocal = null, overlayPreview = null } = {}) {
  const tipo = classificarOrigem(origem);
  const u = origemValida(origem);
  if (tipo === "producao") {
    return validarPerfil({
      ambiente: "producao",
      projectRef: PROJETO_PRODUCAO,
      url: `https://${PROJETO_PRODUCAO}.supabase.co`,
      publishableKey: PUBLICAVEL_PRODUCAO,
      siteUrl: u.origin,
    });
  }
  if (tipo === "lab") return perfilExterno("lab", overlayLab, u, "ambiente-lab.js");
  if (tipo === "local") return perfilExterno("local", overlayLocal, u, "ambiente-local.js");
  if (tipo === "desconhecido" && overlayPreview && u && overlayPreview.origin === u.origin) {
    return validarPerfil({
      ambiente: "preview-e2e",
      projectRef: overlayPreview.projectRef,
      url: overlayPreview.url,
      publishableKey: overlayPreview.publishableKey,
      siteUrl: u.origin,
      origemAutorizada: overlayPreview.origin,
      appointments: overlayPreview.appointments,
    });
  }
  throw new ErroDeAmbiente(
    "origem-desconhecida",
    "Origem não autorizada para este portal: a página não se conecta a nenhum banco.",
  );
}
