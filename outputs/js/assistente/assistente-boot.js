/*
 * ASSISTENTE POTALA — entrada (IA-01). Uma linha em cada página pública:
 *   <script type="module" src="/js/assistente/assistente-boot.js"></script>
 *
 * Decide o modo:
 *   - backend encontrado e ativo (GET responde {ativo:true}) -> conversa real;
 *   - fora de Production, sem backend ativo -> modo de demonstração rotulado, sem IA;
 *   - Production sem backend ativo -> a bolinha APARECE em modo indisponivel: avisa que as respostas
 *     inteligentes estao temporariamente indisponiveis, nao envia nada a IA e oferece atalhos reais.
 * O CSS é carregado só quando a bolinha vai de fato aparecer.
 */
import { criarTransporteIndisponivel, criarTransporteReal, criarTransporteSimulado, resolverBackend } from "./assistente-cliente.js";
import { montarAssistente } from "./assistente-ui.js";

export async function decidirModo({ origem = globalThis.location?.origin || "", resolver = resolverBackend, real = criarTransporteReal, simulado = criarTransporteSimulado, indisponivel = criarTransporteIndisponivel } = {}) {
  const backend = await resolver(origem);
  if (backend.url) {
    const transporte = real(backend);
    if (await transporte.ativo()) return transporte;
  }
  return backend.tipo === "producao" ? indisponivel() : simulado();
}

/* Resolve quando o CSS carregou (ou falhou, ou passou 2 s): montar a janela antes dele a deixaria como
   elemento comum no fim da pagina, e qualquer foco ou rolagem a levaria para la. */
function carregarEstilo(doc) {
  if (doc.querySelector("link[data-assistente-estilo]")) return Promise.resolve();
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("../../css/assistente-flutuante.css", import.meta.url).href;
  link.setAttribute("data-assistente-estilo", "");
  const pronto = new Promise((resolver) => {
    link.addEventListener("load", resolver, { once: true });
    link.addEventListener("error", resolver, { once: true });
    setTimeout(resolver, 2000);
  });
  doc.head.append(link);
  return pronto;
}

export async function iniciarAssistente(doc = document) {
  if (doc.documentElement.hasAttribute("data-sem-assistente")) return null;
  const transporte = await decidirModo();
  if (!transporte) return null;
  await carregarEstilo(doc);
  return montarAssistente({ doc, transporte });
}

if (typeof document !== "undefined" && !globalThis.__POTALA_TESTE__) {
  const iniciar = () => { iniciarAssistente(document).catch(() => { /* sem assistente: a página segue normal */ }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  else iniciar();
}
