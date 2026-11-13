/*
 * ASSISTENTE POTALA — a bolinha flutuante e a janela de conversa (IA-01).
 *
 * Segurança de exibição: todo texto entra por textContent; links só são criados a
 * partir de endereços que passaram por linksSeguros (páginas do próprio portal). Nada
 * vindo do modelo vira HTML.
 *
 * Acessibilidade: a bolinha é um botão com aria-expanded/aria-controls; a janela é um
 * diálogo não modal (não prende o foco nem bloqueia a página); as mensagens ficam numa
 * região role="log" com aria-live; Esc minimiza e devolve o foco à bolinha.
 */
import { ATALHOS, LIMITE_PERGUNTA, MAX_HISTORICO, limparSessao, linksSeguros, lerSessao, mensagensParaEnvio, salvarSessao } from "./assistente-cliente.js";

export const SUGESTOES = Object.freeze([
  "Que cursos e atividades o Instituto oferece?",
  "Como faço para agendar um atendimento?",
  "Tem artigos sobre meditação no Blog?",
  "O que é a Saúde Integrativa no Potala?",
]);

const BOAS_VINDAS = "Olá! Sou o Assistente Potala, uma inteligência artificial que ajuda você a encontrar cursos, atendimentos, atividades e artigos do Instituto. Respondo a partir do conteúdo público do portal e posso errar. O que você procura?";
const BOAS_VINDAS_INDISPONIVEL = "Ol\u00e1! Sou o Assistente Potala. No momento minhas respostas inteligentes est\u00e3o temporariamente indispon\u00edveis. Use os atalhos abaixo ou diga o que procura e eu indico p\u00e1ginas do portal que podem ajudar. N\u00e3o fa\u00e7o agendamentos, inscri\u00e7\u00f5es nem pagamentos: isso \u00e9 feito nas p\u00e1ginas indicadas.";
const AVISO_INDISPONIVEL = "Respostas inteligentes temporariamente indispon\u00edveis";
const AVISO_SIMULADO = "Modo de demonstração: respostas simuladas, sem inteligência artificial.";

const el = (doc, tag, props = {}, filhos = []) => {
  const n = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "texto") n.textContent = v;
    else if (k === "classe") n.className = v;
    else if (v === true) n.setAttribute(k, "");
    else if (v !== false && v != null) n.setAttribute(k, String(v));
  }
  for (const f of filhos) if (f) n.append(f);
  return n;
};

/* Endereço absoluto do link do portal (as páginas públicas ficam na raiz do site). */
const hrefDoPortal = (doc, caminho) => new URL(caminho, `${doc.location?.origin || ""}/`).href;

export function montarAssistente({ doc = document, transporte, base = new URL("../../", import.meta.url).href, armazenamento = globalThis.sessionStorage } = {}) {
  if (!transporte || doc.querySelector("[data-assistente-potala]")) return null;
  const estado = { ...lerSessao(armazenamento), ocupado: false };
  const simulado = transporte.modo === "simulado";
  const indisponivel = transporte.modo === "indisponivel";

  const marca = el(doc, "img", { src: new URL("media/potala-mark-transparent.png", base).href, alt: "", width: 34, height: 28, decoding: "async" });
  const bolinha = el(doc, "button", { type: "button", classe: "pa-bolinha", "aria-expanded": "false", "aria-controls": "pa-janela", "aria-label": "Abrir o Assistente Potala", "data-pa-bolinha": true }, [marca, el(doc, "span", { classe: "pa-bolinha__ponto", "aria-hidden": "true", hidden: true })]);

  const titulo = el(doc, "h2", { id: "pa-titulo", classe: "pa-titulo", texto: "Assistente Potala" });
  const subtitulo = el(doc, "p", { classe: "pa-subtitulo", texto: indisponivel ? AVISO_INDISPONIVEL : simulado ? AVISO_SIMULADO : "Inteligência artificial · conteúdo público do portal" });
  const botao = (rotulo, acao, simbolo) => el(doc, "button", { type: "button", classe: "pa-acao", "aria-label": rotulo, title: rotulo, [`data-pa-${acao}`]: true }, [el(doc, "span", { "aria-hidden": "true", texto: simbolo })]);
  const acoes = el(doc, "div", { classe: "pa-acoes" }, [botao("Limpar conversa", "limpar", "↺"), botao("Minimizar", "minimizar", "–"), botao("Fechar e encerrar a conversa", "fechar", "×")]);
  const cabeca = el(doc, "header", { classe: "pa-cabeca" }, [el(doc, "div", { classe: "pa-cabeca__marca", "aria-hidden": "true" }, [marca.cloneNode()]), el(doc, "div", { classe: "pa-cabeca__texto" }, [titulo, subtitulo]), acoes]);

  const lista = el(doc, "div", { classe: "pa-mensagens", role: "log", "aria-live": "polite", "aria-relevant": "additions", "aria-label": "Conversa com o assistente", tabindex: "0" });
  const sugestoes = el(doc, "div", { classe: "pa-sugestoes", role: "group", "aria-label": indisponivel ? "Atalhos do portal" : "Sugest\u00f5es de perguntas" }, (indisponivel ? linksSeguros(ATALHOS).map((l) => el(doc, "a", { classe: "pa-sugestao pa-atalho", href: hrefDoPortal(doc, l.url), texto: l.titulo })) : SUGESTOES.map((s) => el(doc, "button", { type: "button", classe: "pa-sugestao", "data-pa-sugestao": s, texto: s }))));
  const campo = el(doc, "textarea", { id: "pa-pergunta", classe: "pa-campo", rows: 1, maxlength: LIMITE_PERGUNTA, placeholder: "Escreva sua pergunta…", autocomplete: "off", enterkeyhint: "send" });
  const contador = el(doc, "span", { classe: "pa-contador", "aria-hidden": "true", texto: `0/${LIMITE_PERGUNTA}` });
  const enviar = el(doc, "button", { type: "submit", classe: "pa-enviar", "aria-label": "Enviar pergunta" }, [el(doc, "span", { "aria-hidden": "true", texto: "➤" })]);
  const form = el(doc, "form", { classe: "pa-form", "data-pa-form": true }, [el(doc, "label", { for: "pa-pergunta", classe: "pa-sr", texto: "Sua pergunta para o assistente" }), campo, enviar, contador]);
  const rodape = el(doc, "p", { classe: "pa-rodape", texto: indisponivel ? "Nada do que voc\u00ea escreve aqui \u00e9 enviado a uma IA. Os atalhos levam \u00e0s p\u00e1ginas do portal. Conversa apenas nesta aba." : "IA pode errar. Não substitui orientação profissional. Não guardamos a conversa; ela fica só nesta aba." });
  const janela = el(doc, "section", { id: "pa-janela", classe: "pa-janela", role: "dialog", "aria-modal": "false", "aria-labelledby": "pa-titulo", hidden: true }, [cabeca, lista, sugestoes, form, rodape]);
  const raiz = el(doc, "div", { classe: "pa-raiz", "data-assistente-potala": true, "data-modo": transporte.modo }, [janela, bolinha]);

  function desenharMensagem(m) {
    const caixa = el(doc, "div", { classe: `pa-msg pa-msg--${m.papel}${m.erro ? " pa-msg--erro" : ""}` });
    caixa.append(el(doc, "span", { classe: "pa-sr", texto: m.papel === "usuario" ? "Você: " : "Assistente: " }));
    for (const paragrafo of String(m.texto).split(/\n+/).filter(Boolean)) caixa.append(el(doc, "p", { texto: paragrafo }));
    if (m.links?.length) {
      const ul = el(doc, "ul", { classe: "pa-links", "aria-label": "Páginas sugeridas" });
      for (const l of m.links) ul.append(el(doc, "li", {}, [el(doc, "a", { href: hrefDoPortal(doc, l.url), texto: l.titulo })]));
      caixa.append(ul);
    }
    return caixa;
  }

  function desenhar() {
    lista.replaceChildren(desenharMensagem({ papel: "assistente", texto: indisponivel ? BOAS_VINDAS_INDISPONIVEL : BOAS_VINDAS }), ...estado.mensagens.map(desenharMensagem));
    if (estado.ocupado) lista.append(el(doc, "div", { classe: "pa-msg pa-msg--assistente pa-digitando", role: "status" }, [el(doc, "span", { classe: "pa-sr", texto: "O assistente está escrevendo" }), el(doc, "i"), el(doc, "i"), el(doc, "i")]));
    sugestoes.hidden = !indisponivel && estado.mensagens.length > 0;
    enviar.disabled = estado.ocupado;
    campo.setAttribute("aria-busy", String(estado.ocupado));
    lista.scrollTop = lista.scrollHeight;
  }

  function abrir() {
    janela.hidden = false;
    raiz.dataset.aberto = "true";
    bolinha.setAttribute("aria-expanded", "true");
    bolinha.setAttribute("aria-label", "Minimizar o Assistente Potala");
    bolinha.querySelector(".pa-bolinha__ponto").hidden = true;
    estado.aberto = true;
    salvarSessao(estado, armazenamento);
    desenhar();
    campo.focus();
  }
  function minimizar({ foco = true } = {}) {
    janela.hidden = true;
    delete raiz.dataset.aberto;
    bolinha.setAttribute("aria-expanded", "false");
    bolinha.setAttribute("aria-label", estado.mensagens.length ? "Abrir o Assistente Potala (conversa em andamento)" : "Abrir o Assistente Potala");
    bolinha.querySelector(".pa-bolinha__ponto").hidden = !estado.mensagens.length;
    estado.aberto = false;
    salvarSessao(estado, armazenamento);
    if (foco) bolinha.focus();
  }
  function limpar() {
    estado.mensagens = [];
    limparSessao(armazenamento);
    salvarSessao(estado, armazenamento);
    desenhar();
    campo.focus();
  }

  async function perguntar(texto) {
    const pergunta = String(texto || "").replace(/\s+/g, " ").trim().slice(0, LIMITE_PERGUNTA);
    if (!pergunta || estado.ocupado) return;
    estado.mensagens.push({ papel: "usuario", texto: pergunta, links: [] });
    estado.mensagens = estado.mensagens.slice(-MAX_HISTORICO);
    estado.ocupado = true;
    campo.value = "";
    contador.textContent = `0/${LIMITE_PERGUNTA}`;
    desenhar();
    try {
      const { resposta, links } = await transporte.perguntar(mensagensParaEnvio(estado.mensagens.filter((m) => !m.erro)));
      estado.mensagens.push({ papel: "assistente", texto: resposta, links });
    } catch (erro) {
      estado.mensagens.push({ papel: "assistente", texto: erro?.message || "Não consegui responder agora.", links: [], erro: true });
    } finally {
      estado.ocupado = false;
      estado.mensagens = estado.mensagens.slice(-MAX_HISTORICO);
      salvarSessao({ ...estado, mensagens: estado.mensagens.filter((m) => !m.erro) }, armazenamento);
      desenhar();
      if (!janela.hidden) campo.focus();
    }
  }

  bolinha.addEventListener("click", () => (janela.hidden ? abrir() : minimizar()));
  raiz.addEventListener("click", (evento) => {
    const alvo = evento.target.closest?.("button");
    if (!alvo) return;
    if (alvo.hasAttribute("data-pa-minimizar")) minimizar();
    else if (alvo.hasAttribute("data-pa-fechar")) { estado.mensagens = []; limparSessao(armazenamento); minimizar(); }
    else if (alvo.hasAttribute("data-pa-limpar")) limpar();
    else if (alvo.dataset.paSugestao) void perguntar(alvo.dataset.paSugestao);
  });
  form.addEventListener("submit", (evento) => { evento.preventDefault(); void perguntar(campo.value); });
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" && !evento.shiftKey && !evento.isComposing) { evento.preventDefault(); void perguntar(campo.value); }
  });
  campo.addEventListener("input", () => { contador.textContent = `${campo.value.length}/${LIMITE_PERGUNTA}`; });
  janela.addEventListener("keydown", (evento) => { if (evento.key === "Escape") { evento.stopPropagation(); minimizar(); } });

  doc.body.append(raiz);
  desenhar();
  if (estado.aberto) abrir();
  else minimizar({ foco: false });
  return { raiz, abrir, minimizar, limpar, perguntar, estado };
}
