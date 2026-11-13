/*
 * ASSISTENTE POTALA — entrada (IA-01). Uma linha em cada página pública:
 *   <script type="module" src="/js/assistente/assistente-boot.js"></script>
 *
 * Decide o modo:
 *   - backend encontrado e ativo (GET responde {ativo:true}) -> conversa real;
 *   - fora de Production, sem backend ativo -> modo de demonstração rotulado, sem IA;
 *   - Production sem backend ativo -> a bolinha NÃO aparece (nada de promessa vazia).
 * O CSS é carregado só quando a bolinha vai de fato aparecer.
 */
import { criarTransporteReal, criarTransporteSimulado, resolverBackend } from "./assistente-cliente.js";
import { montarAssistente } from "./assistente-ui.js";

export async function decidirModo({ origem = globalThis.location?.origin || "", resolver = resolverBackend, real = criarTransporteReal, simulado = criarTransporteSimulado } = {}) {
  const backend = await resolver(origem);
  if (backend.url) {
    const transporte = real(backend);
    if (await transporte.ativo()) return transporte;
  }
  return backend.tipo === "producao" ? null : simulado();
}

function carregarEstilo(doc) {
  if (doc.querySelector("link[data-assistente-estilo]")) return;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("../../css/assistente-flutuante.css", import.meta.url).href;
  link.setAttribute("data-assistente-estilo", "");
  doc.head.append(link);
}

export async function iniciarAssistente(doc = document) {
  if (doc.documentElement.hasAttribute("data-sem-assistente")) return null;
  const transporte = await decidirModo();
  if (!transporte) return null;
  carregarEstilo(doc);
  return montarAssistente({ doc, transporte });
}

if (typeof document !== "undefined" && !globalThis.__POTALA_TESTE__) {
  const iniciar = () => { iniciarAssistente(document).catch(() => { /* sem assistente: a página segue normal */ }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  else iniciar();
}
