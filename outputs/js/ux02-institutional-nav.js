import { buscarInstituto } from "./ux02-institutional-search.js";

const MENSAGENS_ASSISTENTE = [
  "Não sabe por onde começar?",
  "Encontre caminhos de cuidado e aprendizagem.",
  "Quer conhecer nossos cursos e atividades?",
  "Precisa localizar uma informação?",
  "Descubra o que existe no Instituto.",
  "Posso ajudar você a explorar o Potala.",
];

const fechar = (elemento) => { elemento.hidden = true; };

export function montarNavegacaoInstitucional({ doc = document, buscar = buscarInstituto, carregarIndice } = {}) {
  const header = doc.querySelector("[data-ux02-header]");
  if (!header) return null;

  const buscaPainel = header.querySelector("#ux02-search-panel");
  const explorarPainel = header.querySelector("#ux02-explore-panel");
  const buscaBotao = header.querySelector("[data-search-toggle]");
  const explorarBotao = header.querySelector("[data-explore-toggle]");
  const campo = header.querySelector("#ux02-search-input");
  const resultados = header.querySelector("#ux02-search-results");
  const estado = header.querySelector("#ux02-search-status");
  let indice = {};

  const carregar = carregarIndice || (async () => {
    const resposta = await fetch(new URL("./home/busca-indice.json", import.meta.url));
    if (!resposta.ok) throw new Error("Índice institucional indisponível");
    return resposta.json();
  });
  carregar().then((valor) => { indice = valor; }).catch(() => { indice = {}; });

  const alternarPainel = (painel, botao) => {
    const vaiAbrir = painel.hidden;
    [buscaPainel, explorarPainel].forEach(fechar);
    [buscaBotao, explorarBotao].forEach((controle) => controle.setAttribute("aria-expanded", "false"));
    painel.hidden = !vaiAbrir;
    botao.setAttribute("aria-expanded", String(vaiAbrir));
    doc.body.classList.toggle("ux02-header-open", vaiAbrir);
    if (vaiAbrir && painel === buscaPainel) campo.focus();
  };

  const renderizar = (texto) => {
    const encontrados = buscar(texto, indice);
    resultados.replaceChildren();
    campo.setAttribute("aria-expanded", String(Boolean(texto.trim())));
    if (!texto.trim()) {
      estado.textContent = "Digite um tema, serviço ou necessidade.";
      return encontrados;
    }
    if (!encontrados.length) {
      const item = doc.createElement("li");
      item.className = "ux02-search-empty";
      item.innerHTML = `<p>Não encontramos uma correspondência nesta busca.</p><a href="recepcao.html">Consultar a Recepção <span aria-hidden="true">→</span></a>`;
      resultados.append(item);
      estado.textContent = "Nenhum resultado. A Recepção pode orientar você.";
      return encontrados;
    }
    encontrados.forEach((resultado) => {
      const item = doc.createElement("li");
      item.innerHTML = `<a href="${resultado.href}"><span><small>${resultado.category}</small><strong>${resultado.title}</strong></span><p>${resultado.summary}</p><i aria-hidden="true">→</i></a>`;
      resultados.append(item);
    });
    estado.textContent = `${encontrados.length} ${encontrados.length === 1 ? "resultado encontrado" : "resultados encontrados"}.`;
    return encontrados;
  };

  buscaBotao.addEventListener("click", () => alternarPainel(buscaPainel, buscaBotao));
  explorarBotao.addEventListener("click", () => alternarPainel(explorarPainel, explorarBotao));
  campo.addEventListener("input", () => renderizar(campo.value));
  campo.addEventListener("keydown", (evento) => {
    const links = [...resultados.querySelectorAll("a")];
    if (evento.key === "ArrowDown" && links.length) { evento.preventDefault(); links[0].focus(); }
    if (evento.key === "Enter" && links.length) { evento.preventDefault(); links[0].click(); }
    if (evento.key === "Escape") { evento.preventDefault(); fechar(buscaPainel); buscaBotao.setAttribute("aria-expanded", "false"); buscaBotao.focus(); }
  });
  resultados.addEventListener("keydown", (evento) => {
    const links = [...resultados.querySelectorAll("a")];
    const atual = links.indexOf(doc.activeElement);
    if (evento.key === "ArrowDown" && atual >= 0) { evento.preventDefault(); links[(atual + 1) % links.length].focus(); }
    if (evento.key === "ArrowUp" && atual >= 0) { evento.preventDefault(); (atual ? links[atual - 1] : campo).focus(); }
    if (evento.key === "Escape") { evento.preventDefault(); fechar(buscaPainel); buscaBotao.setAttribute("aria-expanded", "false"); buscaBotao.focus(); }
  });
  doc.addEventListener("keydown", (evento) => {
    if (evento.key !== "Escape") return;
    [buscaPainel, explorarPainel].forEach(fechar);
    [buscaBotao, explorarBotao].forEach((controle) => controle.setAttribute("aria-expanded", "false"));
    doc.body.classList.remove("ux02-header-open");
  });

  const assistente = header.querySelector("[data-assistant-promo]");
  const mensagem = assistente.querySelector("[data-assistant-message]");
  const pausar = assistente.querySelector("[data-assistant-pause]");
  const reduzido = matchMedia("(prefers-reduced-motion: reduce)");
  let mensagemAtual = 0;
  let pausado = reduzido.matches;
  let temporizador = 0;
  const agendar = () => {
    clearInterval(temporizador);
    if (pausado) return;
    temporizador = setInterval(() => {
      mensagemAtual = (mensagemAtual + 1) % MENSAGENS_ASSISTENTE.length;
      mensagem.textContent = MENSAGENS_ASSISTENTE[mensagemAtual];
    }, 10000);
  };
  const definirPausa = (valor) => {
    pausado = valor;
    pausar.setAttribute("aria-pressed", String(pausado));
    pausar.setAttribute("aria-label", pausado ? "Retomar mensagens do Assistente" : "Pausar mensagens do Assistente");
    pausar.textContent = pausado ? "Retomar" : "Pausar";
    agendar();
  };
  pausar.addEventListener("click", () => definirPausa(!pausado));
  assistente.addEventListener("mouseenter", () => { clearInterval(temporizador); });
  assistente.addEventListener("mouseleave", agendar);
  assistente.addEventListener("focusin", () => { clearInterval(temporizador); });
  assistente.addEventListener("focusout", agendar);
  definirPausa(pausado);

  renderizar("");
  return { buscar: renderizar, fechar: () => [buscaPainel, explorarPainel].forEach(fechar) };
}
