import { classificarOrigem, escolherAmbiente } from "./ambiente.js";

/*
 * Configuração pública do Supabase, escolhida pela ORIGEM da página (veja
 * ambiente.js). É também a verificação de inicialização: se a origem não for
 * autorizada, ou faltar a configuração do LAB/local, este módulo lança um erro
 * controlado e NENHUM cliente, login, leitura ou escrita acontece. Não existe
 * fallback para a produção.
 *
 * Os arquivos ambiente-lab.js e ambiente-local.js só são buscados no ambiente
 * correspondente; em produção nenhuma requisição extra é feita.
 *
 * Fora do navegador (testes e ferramentas), a origem precisa ser informada em
 * POTALA_AMBIENTE_ORIGEM; sem ela o resultado é o mesmo erro controlado.
 *
 * Retornos de autenticação usam sempre siteUrl, que é a origem validada.
 */
const origem = globalThis.location?.origin
  ?? globalThis.process?.env?.POTALA_AMBIENTE_ORIGEM
  ?? "";

function avisar(erro) {
  const doc = globalThis.document;
  if (!doc?.addEventListener) return;
  const mostrar = () => {
    if (!doc.body || doc.getElementById("erro-ambiente")) return;
    const aviso = doc.createElement("div");
    aviso.id = "erro-ambiente";
    aviso.setAttribute("role", "alert");
    aviso.textContent = "Configuração de ambiente inválida. Esta página foi bloqueada e não se conecta a nenhum banco de dados.";
    aviso.style.cssText = "position:fixed;inset:0 0 auto 0;z-index:2147483647;padding:16px;background:#7a1f1f;color:#fff;font:16px/1.4 system-ui,sans-serif;text-align:center";
    doc.body.prepend(aviso);
  };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", mostrar, { once: true });
  else mostrar();
  globalThis.console?.error?.(`[ambiente] ${erro.message}`);
}

const tipo = classificarOrigem(origem);
const carregar = (caminho, exportado) => import(caminho).then((modulo) => modulo[exportado], () => null);

let perfil;
try {
  const overlayLab = tipo === "lab" ? await carregar("./ambiente-lab.js", "AMBIENTE_LAB") : null;
  const overlayLocal = tipo === "local" ? await carregar("./ambiente-local.js", "AMBIENTE_LOCAL") : null;
  perfil = escolherAmbiente({ origem, overlayLab, overlayLocal });
} catch (erro) {
  avisar(erro);
  throw erro;
}

export const SUPABASE_CONFIG = perfil;
export const AMBIENTE_SUPABASE = SUPABASE_CONFIG.ambiente;
